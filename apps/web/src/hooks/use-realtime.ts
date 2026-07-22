"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useEffect } from "react";
import type { Quote } from "@alphasignal/shared";
import { useTradingStore } from "@/stores/trading-store";

interface SocketMessage {
  event: string;
  payload: unknown;
}

export function useRealtime() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const { ticker, market, receiveQuote, setWebsocketStatus } = useTradingStore();

  useEffect(() => {
    if (!session?.accessToken || session.user.plan === "FREE") {
      setWebsocketStatus(session?.user.plan === "FREE" ? "unavailable" : "offline");
      return;
    }

    const baseUrl = new URL(process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:4000/ws");
    baseUrl.searchParams.set("token", session.accessToken);
    const socket = new WebSocket(baseUrl);
    setWebsocketStatus("connecting");

    socket.addEventListener("open", () => {
      setWebsocketStatus("live");
      socket.send(JSON.stringify({ action: "quote:subscribe", ticker, market }));
    });
    socket.addEventListener("message", (message) => {
      const data = parseMessage(message.data);
      if (!data) return;
      if (data.event === "quote:update") {
        receiveQuote(data.payload as Quote);
        return;
      }
      if (data.event.startsWith("signal:") || data.event === "algo:detection") {
        void queryClient.invalidateQueries({ queryKey: ["signals"] });
        void queryClient.invalidateQueries({ queryKey: ["algo-detections"] });
      }
      if (data.event === "ai-analysis:ready") {
        void queryClient.invalidateQueries({ queryKey: ["ai-analysis"] });
      }
      if (data.event === "notification:new") {
        void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      }
    });
    socket.addEventListener("close", () => setWebsocketStatus("offline"));
    socket.addEventListener("error", () => setWebsocketStatus("offline"));

    return () => {
      socket.close();
    };
  }, [market, queryClient, receiveQuote, session?.accessToken, session?.user.plan, setWebsocketStatus, ticker]);
}

function parseMessage(raw: unknown): SocketMessage | null {
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw) as { event?: unknown; payload?: unknown };
    return typeof parsed.event === "string" ? { event: parsed.event, payload: parsed.payload } : null;
  } catch {
    return null;
  }
}
