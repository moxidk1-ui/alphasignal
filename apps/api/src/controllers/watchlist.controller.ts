import { identifierParamsSchema, watchlistItemSchema } from "@alphasignal/shared";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { WatchlistService } from "../services/watchlist.service.js";

export class WatchlistController {
  constructor(private readonly watchlist: WatchlistService) {}

  list = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await reply.code(200).send({ items: await this.watchlist.list(request.auth!.user.id) });
  };

  add = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const item = await this.watchlist.add(request.auth!.user.id, watchlistItemSchema.parse(request.body));
    await reply.code(201).send({ item });
  };

  remove = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const { id } = identifierParamsSchema.parse(request.params);
    await this.watchlist.remove(request.auth!.user.id, id);
    await reply.code(204).send();
  };
}
