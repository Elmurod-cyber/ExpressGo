type CartLine = { foodId: string; quantity: number };
type OrderInput = {
  phone: string;
  name: string;
  restaurantId: string;
  ticketId: string;
  address: string;
  body: Record<string, unknown>;
};

type FoodNotice = {
  ticketId: string;
  placeName: string;
  staffPhone: string;
  customerName: string;
  dropoff: string;
  handoff: "pickup" | "courier";
  lines: { name: string; qty: number }[];
  total: number;
};

type FoodPersist = {
  saveUser: (phone: string, name: string) => Promise<void>;
  saveCart: (phone: string, name: string, restaurantId: string, lines: CartLine[]) => Promise<void>;
  saveOrder: (input: OrderInput) => Promise<void>;
  notify: (input: FoodNotice) => void;
};

const noop: FoodPersist = {
  saveUser: async () => undefined,
  saveCart: async () => undefined,
  saveOrder: async () => undefined,
  notify: () => undefined,
};

let current = noop;

export function setFoodPersist(next: Omit<FoodPersist, "notify"> & { notify?: FoodPersist["notify"] }): void {
  current = { ...current, ...next, notify: next.notify ?? current.notify };
}

export function setFoodNotify(notify: FoodPersist["notify"]): void {
  current = { ...current, notify };
}

export function persistFoodUser(phone: string, name: string): Promise<void> {
  return current.saveUser(phone, name);
}

export function persistFoodCart(phone: string, name: string, restaurantId: string, lines: CartLine[]): Promise<void> {
  return current.saveCart(phone, name, restaurantId, lines);
}

export function persistFoodOrder(input: OrderInput): Promise<void> {
  return current.saveOrder(input);
}

export function notifyFoodOrder(input: FoodNotice): void {
  current.notify(input);
}
