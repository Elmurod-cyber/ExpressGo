type CartLine = { foodId: string; quantity: number };
type OrderInput = {
  phone: string;
  name: string;
  restaurantId: string;
  ticketId: string;
  address: string;
  body: Record<string, unknown>;
};

type FoodPersist = {
  saveUser: (phone: string, name: string) => Promise<void>;
  saveCart: (phone: string, name: string, restaurantId: string, lines: CartLine[]) => Promise<void>;
  saveOrder: (input: OrderInput) => Promise<void>;
};

const noop: FoodPersist = {
  saveUser: async () => undefined,
  saveCart: async () => undefined,
  saveOrder: async () => undefined,
};

let current = noop;

export function setFoodPersist(next: FoodPersist): void {
  current = next;
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
