import { DurableObject } from "cloudflare:workers";
import type { Env, WSKeystrokeMessage, WSSubscribeMessage, WSErrorMessage, WSConnectedMessage } from "../types";

interface WSState {
  subscribedSession: string | "*";
}

/**
 * StreamHub – real-time WebSocket keystroke relay.
 * No auth. Accepts connections, allows session filtering,
 * broadcasts keystrokes to all matching subscribers.
 */
export class StreamHub extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/ws" && request.headers.get("Upgrade") === "websocket") {
      return this.upgrade();
    }

    if (url.pathname === "/broadcast" && request.method === "POST") {
      return this.broadcast(request);
    }

    return new Response("Not Found", { status: 404 });
  }

  private upgrade(): Response {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ subscribedSession: "*" } satisfies WSState);

    const welcome: WSConnectedMessage = {
      type: "connected",
      message: "Connected to live feed",
    };
    server.send(JSON.stringify(welcome));

    return new Response(null, { status: 101, webSocket: client });
  }

  private async broadcast(request: Request): Promise<Response> {
    let payload: WSKeystrokeMessage;
    try {
      payload = await request.json<WSKeystrokeMessage>();
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    const msg = JSON.stringify(payload);

    for (const ws of this.ctx.getWebSockets()) {
      try {
        const state = ws.deserializeAttachment() as WSState | null;
        if (
          !state ||
          state.subscribedSession === "*" ||
          state.subscribedSession === payload.sessionId
        ) {
          ws.send(msg);
        }
      } catch {
        // skip broken
      }
    }

    return new Response("OK");
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string") {
      this.sendError(ws, "Binary not supported");
      return;
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(message);
    } catch {
      this.sendError(ws, "Invalid JSON");
      return;
    }

    if (parsed.type === "subscribe") {
      const sessionId = (parsed as unknown as WSSubscribeMessage).sessionId ?? "*";
      const state: WSState = { subscribedSession: sessionId };
      ws.serializeAttachment(state);

      const ack: WSConnectedMessage = {
        type: "connected",
        message: `Subscribed to: ${sessionId}`,
      };
      ws.send(JSON.stringify(ack));
    } else {
      this.sendError(ws, `Unknown type: ${parsed.type}`);
    }
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    ws.close(code, "Closed");
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    console.error("WS error:", error);
    ws.close(1011, "Error");
  }

  private sendError(ws: WebSocket, message: string): void {
    const err: WSErrorMessage = { type: "error", message };
    try {
      ws.send(JSON.stringify(err));
    } catch { /* broken */ }
  }
}
