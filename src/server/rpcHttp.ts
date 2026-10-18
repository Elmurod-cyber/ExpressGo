import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { actorStore } from "./actorContext";
import { actorFromToken, deliveryDatabaseStatus, rememberActor } from "./deliveryService";
import { handlePartner } from "./partner";
import { PUBLIC_RPC, RPC, type RpcName } from "./rpc";
import { tripDatabaseStatus } from "./tripDb";

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk as Buffer));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8") || "{}"));
    req.on("error", reject);
  });
}

export function createRpcServer(onHandled?: () => void) {
  return createServer((req, res) => {
    void handlePartner(req, res, onHandled).then((handled) => {
      if (handled) return;
      routeRpc(req, res, onHandled);
    });
  });
}

function routeRpc(req: IncomingMessage, res: ServerResponse, onHandled?: () => void) {
    if (req.method === "OPTIONS") {
      json(res, 204, {});
      return;
    }
    if (req.method === "GET" && req.url === "/health") {
      const trips = tripDatabaseStatus();
      const delivery = deliveryDatabaseStatus();
      json(res, 200, {
        ok: true,
        name: "Express Go",
        tripsDb: trips.ready,
        tripsDbReason: trips.ready ? undefined : trips.reason,
        deliveryDb: delivery.ready,
        deliveryDbReason: delivery.ready ? undefined : delivery.reason,
      });
      return;
    }
    if (req.method !== "POST" || req.url !== "/rpc") {
      json(res, 404, { error: "Topilmadi." });
      return;
    }
    void (async () => {
      try {
        const raw = await readBody(req);
        const payload = JSON.parse(raw) as { method?: string; args?: unknown[] };
        const method = payload.method as RpcName | undefined;
        if (!method || !(method in RPC)) {
          json(res, 400, { error: "Noma'lum so'rov." });
          return;
        }
        const args = Array.isArray(payload.args) ? payload.args : [];
        const header = req.headers.authorization ?? "";
        const headerValue = Array.isArray(header) ? header[0] : header;
        const match = /^Bearer\s+(\S+)/i.exec(headerValue);
        const actor = match ? await actorFromToken(match[1]) : null;
        if (!PUBLIC_RPC.has(method) && !actor) {
          json(res, 401, { error: "Sessiya yo'q. Qayta kiring." });
          return;
        }
        if (actor) rememberActor(actor);
        const result = await actorStore.run(actor, () => (RPC[method] as (...next: unknown[]) => unknown)(...args));
        onHandled?.();
        json(res, 200, { result });
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "Server xato.";
        json(res, 400, { error: message });
      }
    })();
}
