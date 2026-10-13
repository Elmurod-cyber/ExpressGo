import { AsyncLocalStorage } from "node:async_hooks";

export type Actor = {
  id: string;
  role: "sender" | "courier";
  phone: string;
  name: string;
  isAdmin: boolean;
};

export const actorStore = new AsyncLocalStorage<Actor | null>();

export function requireActor(): Actor {
  const actor = actorStore.getStore();
  if (!actor) {
    throw new Error("Sessiya yo'q. Qayta kiring.");
  }
  return actor;
}
