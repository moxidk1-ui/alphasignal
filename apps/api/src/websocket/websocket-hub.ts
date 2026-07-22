import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import type { FastifyBaseLogger } from "fastify";
import type { Redis } from "ioredis";
import { WebSocket, WebSocketServer } from "ws";
import { z } from "zod";
import type { AuthService } from "../services/auth.service.js";
import type { MarketDataService } from "../services/market-data.service.js";
import type { RealtimePublisher } from "../services/phase5.ports.js";
import type { TokenService } from "../services/token.service.js";

interface ClientSocket extends WebSocket {
  alive: boolean;
  userId: string;
  quoteSubscriptions: Map<string, () => void>;
}

const clientMessageSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("quote:subscribe"),
    ticker: z.string().trim().min(1).max(32).transform((ticker) => ticker.toUpperCase()),
    market: z.enum(["STOCKS", "FOREX", "CRYPTO", "FUTURES"]),
  }),
  z.object({
    action: z.literal("quote:unsubscribe"),
    ticker: z.string().trim().min(1).max(32).transform((ticker) => ticker.toUpperCase()),
    market: z.enum(["STOCKS", "FOREX", "CRYPTO", "FUTURES"]),
  }),
]);

export class WebSocketHub implements RealtimePublisher {
  private readonly server = new WebSocketServer({ maxPayload: 16 * 1024, noServer: true });
  private readonly subscriber: Redis;
  private readonly sockets = new Map<string, Set<ClientSocket>>();
  private heartbeat: NodeJS.Timeout | undefined;
  private started = false;

  constructor(
    private readonly httpServer: Server,
    private readonly redis: Redis,
    private readonly tokenService: TokenService,
    private readonly authService: AuthService,
    private readonly marketData: MarketDataService,
    private readonly frontendOrigin: string,
    private readonly logger: FastifyBaseLogger,
  ) {
    this.subscriber = redis.duplicate();
    this.httpServer.on("upgrade", this.onUpgrade);
    this.server.on("connection", (socket: ClientSocket) => {
      socket.alive = true;
      socket.quoteSubscriptions = new Map();
      const userSockets = this.sockets.get(socket.userId) ?? new Set<ClientSocket>();
      userSockets.add(socket);
      this.sockets.set(socket.userId, userSockets);
      socket.on("pong", () => {
        socket.alive = true;
      });
      socket.on("message", (payload) => this.handleClientMessage(socket, payload.toString()));
      socket.on("close", () => this.removeSocket(socket));
      socket.send(JSON.stringify({ event: "connection:ready", payload: { connected: true } }));
    });
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    await this.subscriber.psubscribe("ws:user:*");
    this.subscriber.on("pmessage", (_pattern, channel, payload) => {
      const userId = channel.slice("ws:user:".length);
      this.deliver(userId, payload);
    });
    this.heartbeat = setInterval(() => {
      for (const sockets of this.sockets.values()) {
        for (const socket of sockets) {
          if (!socket.alive) {
            socket.terminate();
            continue;
          }
          socket.alive = false;
          socket.ping();
        }
      }
    }, 30_000);
    this.started = true;
  }

  async publishToUser(userId: string, event: string, payload: unknown): Promise<void> {
    await this.redis.publish(`ws:user:${userId}`, JSON.stringify({ event, payload }));
  }

  async publishToUsers(userIds: string[], event: string, payload: unknown): Promise<void> {
    if (userIds.length === 0) {
      return;
    }

    const message = JSON.stringify({ event, payload });
    const batch = this.redis.pipeline();
    for (const userId of new Set(userIds)) {
      batch.publish(`ws:user:${userId}`, message);
    }
    await batch.exec();
  }

  async close(): Promise<void> {
    this.httpServer.off("upgrade", this.onUpgrade);
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
    }
    for (const sockets of this.sockets.values()) {
      for (const socket of sockets) {
        socket.terminate();
      }
    }
    if (this.started) {
      await this.subscriber.punsubscribe("ws:user:*");
    }
    this.subscriber.disconnect();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  private readonly onUpgrade = (request: IncomingMessage, socket: Duplex, head: Buffer): void => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname !== "/ws") {
      return;
    }

    const origin = request.headers.origin;
    if (origin && origin !== this.frontendOrigin) {
      rejectUpgrade(socket, 403);
      return;
    }

    const token = url.searchParams.get("token");
    if (!token) {
      rejectUpgrade(socket, 401);
      return;
    }

    void this.acceptConnection(request, socket, head, token);
  };

  private async acceptConnection(
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    token: string,
  ): Promise<void> {
    try {
      const claims = await this.tokenService.verifyAccessToken(token);
      const user = await this.authService.getUser(claims.userId);
      if (user.plan === "FREE") {
        rejectUpgrade(socket, 403);
        return;
      }

      this.server.handleUpgrade(request, socket, head, (webSocket) => {
        const client = webSocket as ClientSocket;
        client.userId = user.id;
        this.server.emit("connection", client, request);
      });
    } catch {
      rejectUpgrade(socket, 401);
    }
  }

  private deliver(userId: string, payload: string): void {
    const sockets = this.sockets.get(userId);
    if (!sockets) {
      return;
    }

    for (const socket of sockets) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(payload);
      }
    }
  }

  private removeSocket(socket: ClientSocket): void {
    for (const unsubscribe of socket.quoteSubscriptions.values()) {
      unsubscribe();
    }
    const userSockets = this.sockets.get(socket.userId);
    userSockets?.delete(socket);
    if (userSockets?.size === 0) {
      this.sockets.delete(socket.userId);
    }
    this.logger.debug({ userId: socket.userId }, "WebSocket connection closed");
  }

  private handleClientMessage(socket: ClientSocket, rawMessage: string): void {
    let input: unknown;
    try {
      input = JSON.parse(rawMessage) as unknown;
    } catch {
      return;
    }
    const message = clientMessageSchema.safeParse(input);
    if (!message.success) {
      return;
    }

    const key = `${message.data.market}:${message.data.ticker}`;
    const existing = socket.quoteSubscriptions.get(key);
    if (message.data.action === "quote:unsubscribe") {
      existing?.();
      socket.quoteSubscriptions.delete(key);
      return;
    }
    if (existing || socket.quoteSubscriptions.size >= 20) {
      return;
    }

    const unsubscribe = this.marketData.subscribeQuote(message.data.ticker, message.data.market, (quote) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ event: "quote:update", payload: quote }));
      }
    });
    socket.quoteSubscriptions.set(key, unsubscribe);
  }
}

function rejectUpgrade(socket: Duplex, statusCode: 401 | 403): void {
  const statusText = statusCode === 401 ? "Unauthorized" : "Forbidden";
  socket.write(`HTTP/1.1 ${statusCode} ${statusText}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}
