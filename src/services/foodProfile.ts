import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "expressgo.v1.food-profile";

export type FoodProfile = {
  name: string;
  phone: string;
  token: string;
};

export async function readFoodProfile(): Promise<FoodProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FoodProfile;
    if (!parsed?.token || !parsed.phone) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveFoodProfile(profile: FoodProfile): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(profile));
}

export async function clearFoodProfile(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}

const CART_KEY = "expressgo.v1.food-cart";

export type FoodCartSnap = {
  restaurantId: string;
  items: Record<string, number>;
};

export async function readFoodCart(): Promise<FoodCartSnap> {
  try {
    const raw = await AsyncStorage.getItem(CART_KEY);
    if (!raw) return { restaurantId: "", items: {} };
    const parsed = JSON.parse(raw) as FoodCartSnap;
    if (!parsed || typeof parsed.restaurantId !== "string" || !parsed.items) return { restaurantId: "", items: {} };
    return parsed;
  } catch {
    return { restaurantId: "", items: {} };
  }
}

export async function saveFoodCartSnap(cart: FoodCartSnap): Promise<void> {
  await AsyncStorage.setItem(CART_KEY, JSON.stringify(cart));
}
