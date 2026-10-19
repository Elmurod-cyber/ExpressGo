import * as server from "../server/store";
import type { TripWrite } from "../server/store";
import { scheduleStoreSave } from "../server/persist";
import { pushShared } from "./cloud";
import { flushRemotePushes } from "./push";
import {
  acceptBridgeDelivery,
  advanceBridgeDelivery,
  isBridgeOrder,
  mergeDeliveries,
  releaseBridgeDelivery,
  touchCourierLocation,
} from "./bridge";
import { getApiUrl } from "./endpoint";
import { assertOnline, postRpc } from "./rpcCall";
import { getSessionToken } from "./sessionToken";
import type { AuthSession } from "../types";
import { t } from "../i18n";
import type {
  Account,
  AdCard,
  AdPlan,
  AdSlot,
  AdminBoard,
  CourierBoard,
  CourierKassa,
  ErrandCard,
  ErrandMine,
  FeeQuote,
  Pricing,
  Role,
  SavedAddresses,
  SavedSlot,
  SenderOrder,
  LiveJob,
  TripCard,
  MasterPass,
  TripPass,
  TripQuery,
  TripReveal,
  GuestPass,
  BuilderCard,
  BuilderKind,
  FoodDesk,
  FoodTicket,
  FoodOwnerCard,
  FoodTicketStatus,
  KitchenDesk,
  VehicleKind,
  CourierDocKind,
  ChatMessage,
  ChatThread,
  InboxBundle,
  JobKind,
  OtpChallenge,
} from "../types";

/**
 * Bo'sh manzil — Supabase yoki shu qurilma.
 * Profilida http://IP:8787 yozilsa bulut o'chadi va shu server ishlaydi.
 * Foiz hisobi server/rules.ts ichida.
 */
function call<T>(work: () => T | Promise<T>): Promise<T> {
  return Promise.resolve()
    .then(work)
    .then((result) => {
      scheduleStoreSave();
      pushShared();
      void flushRemotePushes();
      return result;
    });
}

const SHARED_RPC = new Set([
  "register",
  "login",
  "requestOtp",
  "verifyOtp",
  "getAccount",
  "creditCourier",
  "topUp",
  "getKassa",
  "setShift",
  "submitCourierDoc",
  "reviewCourierDoc",
  "createOrder",
  "updateOrder",
  "listSenderOrders",
  "cancelOrder",
  "getCourierBoard",
  "pingLocation",
  "acceptOrder",
  "declineOrder",
  "markPickedUp",
  "markDelivered",
  "markArrived",
  "releaseOrder",
  "getAdminBoard",
]);

async function invoke<T>(method: string, args: unknown[], local: () => T | Promise<T>): Promise<T> {
  const base = getApiUrl();
  if (SHARED_RPC.has(method)) assertOnline(base, t("delivery.server_need"));
  if (!base) return call(local);
  return postRpc(base, method, args, getSessionToken(), t("delivery.server_need"));
}

function withBridge(courierId: string, local: Promise<CourierBoard>) {
  return local.then((board) => mergeDeliveries(board, courierId));
}

export const api = {
  getPricing(): Promise<Pricing> {
    return invoke("getPricing", [], () => server.getPricing());
  },
  quoteFee(input: {
    distanceKm: number;
    district?: string | null;
    vehicle?: VehicleKind | null;
  }): Promise<FeeQuote> {
    return invoke("quoteFee", [input], () => server.quoteFee(input));
  },
  register(input: {
    role: Role;
    name: string;
    phone: string;
    deposit?: number;
    vehicle?: VehicleKind | null;
  }): Promise<Account> {
    return invoke("register", [input], () => server.register(input));
  },
  login(input: { role: Role; phone: string }): Promise<OtpChallenge> {
    return invoke("login", [input], () => server.login(input));
  },
  requestOtp(input: { role: Role; phone: string }): Promise<OtpChallenge> {
    return invoke("requestOtp", [input], () => server.requestOtp(input));
  },
  verifyOtp(input: { role: Role; phone: string; code: string }): Promise<AuthSession> {
    return invoke("verifyOtp", [input], () => {
      throw new Error(t("delivery.server_need"));
    });
  },
  ensureDemoPair(): Promise<never> {
    return Promise.reject(new Error("Sinov hisobi o'chirilgan."));
  },
  getAccount(userId: string): Promise<Account> {
    return invoke("getAccount", [userId], () => server.getAccount(userId));
  },
  updateProfile(userId: string, input: { name?: string; phone?: string; photo?: string | null }): Promise<Account> {
    return invoke("updateProfile", [userId, input], () => server.updateProfile(userId, input));
  },
  requestPhoneChange(phone: string): Promise<OtpChallenge> {
    return invoke("requestPhoneChange", [phone], () => {
      throw new Error("Telefonni almashtirish uchun server kerak.");
    });
  },
  confirmPhoneChange(input: { phone: string; code: string; name?: string }): Promise<Account> {
    return invoke("confirmPhoneChange", [input], () => {
      throw new Error("Telefonni almashtirish uchun server kerak.");
    });
  },
  setPushToken(userId: string, token: string): Promise<void> {
    return invoke("setPushToken", [userId, token], () => server.setPushToken(userId, token));
  },
  listInbox(userId: string): Promise<InboxBundle> {
    return invoke("listInbox", [userId], () => server.listInbox(userId));
  },
  markInboxRead(userId: string, noteId?: string | null): Promise<InboxBundle> {
    return invoke("markInboxRead", [userId, noteId], () => server.markInboxRead(userId, noteId));
  },
  listChat(userId: string, jobId: string, kind: JobKind): Promise<ChatMessage[]> {
    return invoke("listChat", [userId, jobId, kind], () => server.listChat(userId, jobId, kind));
  },
  sendChat(userId: string, jobId: string, kind: JobKind, text: string): Promise<ChatMessage[]> {
    return invoke("sendChat", [userId, jobId, kind, text], () => server.sendChat(userId, jobId, kind, text));
  },
  canChat(userId: string, jobId: string, kind: JobKind): Promise<boolean> {
    return invoke("canChat", [userId, jobId, kind], () => server.canChat(userId, jobId, kind));
  },
  listChatThreads(userId: string): Promise<ChatThread[]> {
    return invoke("listChatThreads", [userId], () => server.listChatThreads(userId));
  },
  getSavedPlaces(userId?: string | null): Promise<SavedAddresses> {
    return invoke("getSavedPlaces", [userId], () => server.getSavedPlaces(userId));
  },
  savePlace(input: {
    userId?: string | null;
    slot: SavedSlot;
    label: string;
    lat: number;
    lng: number;
  }): Promise<{ saved: SavedAddresses; account: Account | null }> {
    return invoke("savePlace", [input], () => server.savePlace(input));
  },
  clearPlace(input: {
    userId?: string | null;
    slot: SavedSlot;
  }): Promise<{ saved: SavedAddresses; account: Account | null }> {
    return invoke("clearPlace", [input], () => server.clearPlace(input));
  },
  creditCourier(courierId: string, amount: number): Promise<Account> {
    return invoke("creditCourier", [courierId, amount], () => server.creditCourier(courierId, amount));
  },
  topUp(courierId: string, amount: number): Promise<Account> {
    return invoke("topUp", [courierId, amount], () => server.topUp(courierId, amount));
  },
  getKassa(courierId: string): Promise<CourierKassa> {
    return invoke("getKassa", [courierId], () => server.getKassa(courierId));
  },
  cashout(courierId: string, amount: number): Promise<CourierKassa> {
    return invoke("cashout", [courierId, amount], () => server.cashout(courierId, amount));
  },
  setCourierVehicle(courierId: string, vehicle: VehicleKind): Promise<Account> {
    return invoke("setCourierVehicle", [courierId, vehicle], () => server.setCourierVehicle(courierId, vehicle));
  },
  setShift(courierId: string, on: boolean): Promise<Account> {
    return invoke("setShift", [courierId, on], () => server.setShift(courierId, on));
  },
  submitCourierDoc(courierId: string, kind: CourierDocKind, uri: string): Promise<Account> {
    return invoke("submitCourierDoc", [courierId, kind, uri], () => server.submitCourierDoc(courierId, kind, uri));
  },
  reviewCourierDoc(courierId: string, kind: CourierDocKind, ok: boolean, note?: string | null): Promise<Account> {
    return invoke("reviewCourierDoc", [courierId, kind, ok, note], () =>
      server.reviewCourierDoc(courierId, kind, ok, note),
    );
  },
  createOrder(input: {
    senderId: string;
    pickup: string;
    dropoff: string;
    item: string;
    deliveryFee: number;
    customerName: string;
    customerPhone: string;
    note?: string;
    pickupLat?: number | null;
    pickupLng?: number | null;
    dropoffLat?: number | null;
    dropoffLng?: number | null;
    district?: string | null;
    vehicle?: VehicleKind | null;
    readyAt?: number | null;
    dropoffs?: Array<{ label?: string; lat?: number | null; lng?: number | null }> | null;
  }): Promise<SenderOrder> {
    return invoke("createOrder", [input], () => server.createOrder(input));
  },
  updateOrder(
    senderId: string,
    orderId: string,
    input: {
      pickup: string;
      dropoff: string;
      item: string;
      deliveryFee: number;
      customerName: string;
      customerPhone: string;
      note?: string;
      pickupLat?: number | null;
      pickupLng?: number | null;
      dropoffLat?: number | null;
      dropoffLng?: number | null;
      district?: string | null;
      vehicle?: VehicleKind | null;
      readyAt?: number | null;
      dropoffs?: Array<{ label?: string; lat?: number | null; lng?: number | null }> | null;
    },
  ): Promise<SenderOrder> {
    return invoke("updateOrder", [senderId, orderId, input], () => server.updateOrder(senderId, orderId, input));
  },
  listSenderOrders(senderId: string): Promise<SenderOrder[]> {
    return invoke("listSenderOrders", [senderId], () => server.listSenderOrders(senderId));
  },
  listLiveJobs(): Promise<LiveJob[]> {
    if (!getApiUrl()) return Promise.resolve([]);
    return invoke("listLiveJobs", [], () => server.listLiveJobs());
  },
  cancelOrder(senderId: string, orderId: string): Promise<SenderOrder> {
    return invoke("cancelOrder", [senderId, orderId], () => server.cancelOrder(senderId, orderId));
  },
  getCourierBoard(courierId: string): Promise<CourierBoard> {
    return withBridge(courierId, invoke("getCourierBoard", [courierId], () => server.getCourierBoard(courierId)));
  },
  pingLocation(courierId: string, lat: number, lng: number): Promise<CourierBoard> {
    return invoke("pingLocation", [courierId, lat, lng], () => server.pingLocation(courierId, lat, lng)).then(async (board) => {
      await touchCourierLocation(courierId, lat, lng);
      return mergeDeliveries(board, courierId);
    });
  },
  acceptOrder(courierId: string, orderId: string): Promise<CourierBoard> {
    if (isBridgeOrder(orderId)) {
      return invoke("getAccount", [courierId], () => server.getAccount(courierId)).then(async (account) => {
        await acceptBridgeDelivery(orderId, account);
        return withBridge(courierId, invoke("getCourierBoard", [courierId], () => server.getCourierBoard(courierId)));
      });
    }
    return withBridge(courierId, invoke("acceptOrder", [courierId, orderId], () => server.acceptOrder(courierId, orderId)));
  },
  declineOrder(courierId: string, orderId: string): Promise<CourierBoard> {
    if (isBridgeOrder(orderId)) {
      return withBridge(courierId, invoke("getCourierBoard", [courierId], () => server.getCourierBoard(courierId)));
    }
    return withBridge(courierId, invoke("declineOrder", [courierId, orderId], () => server.declineOrder(courierId, orderId)));
  },
  markPickedUp(courierId: string, orderId: string, photo: string): Promise<CourierBoard> {
    if (isBridgeOrder(orderId)) {
      return advanceBridgeDelivery(orderId, courierId, "picked_up").then(() =>
        withBridge(courierId, invoke("getCourierBoard", [courierId], () => server.getCourierBoard(courierId))),
      );
    }
    return withBridge(
      courierId,
      invoke("markPickedUp", [courierId, orderId, photo], () => server.markPickedUp(courierId, orderId, photo)),
    );
  },
  markDelivered(
    courierId: string,
    orderId: string,
    photo: string,
    signature?: string | null,
  ): Promise<CourierBoard> {
    if (isBridgeOrder(orderId)) {
      return advanceBridgeDelivery(orderId, courierId, "delivered").then(() =>
        withBridge(courierId, invoke("getCourierBoard", [courierId], () => server.getCourierBoard(courierId))),
      );
    }
    return withBridge(
      courierId,
      invoke("markDelivered", [courierId, orderId, photo, signature], () =>
        server.markDelivered(courierId, orderId, photo, signature),
      ),
    );
  },
  markArrived(courierId: string, jobId: string): Promise<CourierBoard> {
    if (isBridgeOrder(jobId)) {
      return withBridge(courierId, invoke("getCourierBoard", [courierId], () => server.getCourierBoard(courierId)));
    }
    return withBridge(courierId, invoke("markArrived", [courierId, jobId], () => server.markArrived(courierId, jobId)));
  },
  releaseOrder(courierId: string, orderId: string): Promise<CourierBoard> {
    if (isBridgeOrder(orderId)) {
      return releaseBridgeDelivery(orderId).then(() =>
        withBridge(courierId, invoke("getCourierBoard", [courierId], () => server.getCourierBoard(courierId))),
      );
    }
    return withBridge(courierId, invoke("releaseOrder", [courierId, orderId], () => server.releaseOrder(courierId, orderId)));
  },
  listErrandCards(): Promise<ErrandCard[]> {
    return invoke("listErrandCards", [], () => server.listErrandCards());
  },
  listMyErrands(phone: string): Promise<ErrandMine[]> {
    return invoke("listMyErrands", [phone], () => server.listMyErrands(phone));
  },
  createErrand(input: {
    district: string;
    pickup: string;
    item: string;
    productPrice: number;
    dropoff: string;
    customerPhone: string;
    courierFee: number;
    pickupLat?: number | null;
    pickupLng?: number | null;
    dropoffLat?: number | null;
    dropoffLng?: number | null;
    vehicle?: VehicleKind | null;
    readyAt?: number | null;
  }): Promise<ErrandMine> {
    return invoke("createErrand", [input], () => server.createErrand(input));
  },
  cancelErrand(phone: string, errandId: string): Promise<ErrandMine> {
    return invoke("cancelErrand", [phone, errandId], () => server.cancelErrand(phone, errandId));
  },
  acceptErrand(courierId: string, errandId: string): Promise<CourierBoard> {
    return invoke("acceptErrand", [courierId, errandId], () => server.acceptErrand(courierId, errandId));
  },
  declineErrand(courierId: string, errandId: string): Promise<CourierBoard> {
    return invoke("declineErrand", [courierId, errandId], () => server.declineErrand(courierId, errandId));
  },
  markErrandPickedUp(courierId: string, errandId: string, photo: string): Promise<CourierBoard> {
    return invoke("markErrandPickedUp", [courierId, errandId, photo], () =>
      server.markErrandPickedUp(courierId, errandId, photo),
    );
  },
  markErrandDelivered(
    courierId: string,
    errandId: string,
    photo: string,
    signature?: string | null,
  ): Promise<CourierBoard> {
    return invoke("markErrandDelivered", [courierId, errandId, photo, signature], () =>
      server.markErrandDelivered(courierId, errandId, photo, signature),
    );
  },
  releaseErrand(courierId: string, errandId: string): Promise<CourierBoard> {
    return invoke("releaseErrand", [courierId, errandId], () => server.releaseErrand(courierId, errandId));
  },
  getAdminBoard(): Promise<AdminBoard> {
    return invoke("getAdminBoard", [], () => server.getAdminBoard());
  },
  getAd(slot: AdSlot): Promise<AdCard | null> {
    return invoke("getAd", [slot], () => server.getAd(slot));
  },
  clickAd(id: string): Promise<AdCard> {
    return invoke("clickAd", [id], () => server.clickAd(id));
  },
  buyAd(input: {
    slot: AdSlot;
    title: string;
    place: string;
    phone: string;
    plan?: AdPlan | null;
  }): Promise<AdCard> {
    return invoke("buyAd", [input], () => server.buyAd(input));
  },
  rateAsSender(senderId: string, orderId: string, stars: number): Promise<SenderOrder> {
    return invoke("rateAsSender", [senderId, orderId, stars], () => server.rateAsSender(senderId, orderId, stars));
  },
  rateAsCourier(courierId: string, orderId: string, stars: number): Promise<CourierBoard> {
    return invoke("rateAsCourier", [courierId, orderId, stars], () => server.rateAsCourier(courierId, orderId, stars));
  },
  listTrips(query?: TripQuery | null): Promise<TripCard[]> {
    return invoke("listTrips", [query ?? null], () => server.listTrips(query));
  },
  registerTripAccount(role: "rider" | "driver", name: string, phone: string, guestToken?: string | null): Promise<server.TripAccountCard> {
    return invoke("registerTripAccount", [role, name, phone, guestToken ?? null], () =>
      server.registerTripAccount(role, name, phone, guestToken),
    );
  },
  requestGuestCode(kind: "rider" | "employer" | "food", phone: string): Promise<OtpChallenge> {
    return invoke("requestGuestCode", [kind, phone], () => server.requestGuestCode(kind, phone));
  },
  verifyGuestCode(kind: "rider" | "employer" | "food", phone: string, code: string, name: string): Promise<GuestPass> {
    return invoke("verifyGuestCode", [kind, phone, code, name], () => server.verifyGuestCode(kind, phone, code, name));
  },
  postTrip(input: TripWrite): Promise<TripCard> {
    return invoke("postTrip", [input], () => server.postTrip(input));
  },
  listMyTrips(phone: string): Promise<TripCard[]> {
    return invoke("listMyTrips", [phone], () => server.listMyTrips(phone));
  },
  updateTrip(id: string, ownerPhone: string, input: TripWrite): Promise<TripCard> {
    return invoke("updateTrip", [id, ownerPhone, input], () => server.updateTrip(id, ownerPhone, input));
  },
  deleteTrip(id: string, ownerPhone: string): Promise<void> {
    return invoke("deleteTrip", [id, ownerPhone], () => server.deleteTrip(id, ownerPhone));
  },
  tripPassStatus(phone: string): Promise<TripPass> {
    return invoke("tripPassStatus", [phone], () => server.tripPassStatus(phone));
  },
  startTripPass(phone: string): Promise<TripPass> {
    return invoke("startTripPass", [phone], () => server.startTripPass(phone));
  },
  revealTripPhone(tripId: string, driverPhone: string): Promise<TripReveal> {
    return invoke("revealTripPhone", [tripId, driverPhone], () => server.revealTripPhone(tripId, driverPhone));
  },
  listBuilders(kind?: BuilderKind | null, viewerPhone?: string | null): Promise<BuilderCard[]> {
    return invoke("listBuilders", [kind ?? null, viewerPhone ?? null], () => server.listBuilders(kind, viewerPhone));
  },
  masterSubStatus(phone: string): Promise<MasterPass> {
    return invoke("masterSubStatus", [phone], () => server.masterSubStatus(phone));
  },
  registerMaster(name: string, phone: string): Promise<MasterPass> {
    return invoke("registerMaster", [name, phone], () => server.registerMaster(name, phone));
  },
  startMasterSub(phone: string): Promise<MasterPass> {
    return invoke("startMasterSub", [phone], () => server.startMasterSub(phone));
  },
  postBuilder(input: Parameters<typeof server.postBuilder>[0]): Promise<BuilderCard> {
    return invoke("postBuilder", [input], () => server.postBuilder(input));
  },
  listMyBuilders(phone: string, kind?: BuilderKind | null, guestToken?: string | null): Promise<BuilderCard[]> {
    return invoke("listMyBuilders", [phone, kind ?? null, guestToken ?? null], () => server.listMyBuilders(phone, kind, guestToken));
  },
  updateBuilder(id: string, ownerPhone: string, input: Parameters<typeof server.updateBuilder>[2]): Promise<BuilderCard> {
    return invoke("updateBuilder", [id, ownerPhone, input], () => server.updateBuilder(id, ownerPhone, input));
  },
  closeBuilder(id: string, ownerPhone: string, guestToken?: string | null): Promise<BuilderCard> {
    return invoke("closeBuilder", [id, ownerPhone, guestToken ?? null], () => server.closeBuilder(id, ownerPhone, guestToken));
  },
  deleteBuilder(id: string, ownerPhone: string, guestToken?: string | null): Promise<void> {
    return invoke("deleteBuilder", [id, ownerPhone, guestToken ?? null], () => server.deleteBuilder(id, ownerPhone, guestToken));
  },
  rateBuilder(id: string, phone: string, stars: number): Promise<BuilderCard> {
    return invoke("rateBuilder", [id, phone, stars], () => server.rateBuilder(id, phone, stars));
  },
  saveFoodCart(guestToken: string, restaurantId: string, lines: { foodId: string; quantity: number }[]): Promise<void> {
    return invoke("saveFoodCart", [guestToken, restaurantId, lines], () => server.saveFoodCart(guestToken, restaurantId, lines));
  },
  placeFoodOrder(input: {
    placeId: string;
    placeName: string;
    pickup: string;
    staffPhone: string;
    name: string;
    phone: string;
    dropoff: string;
    handoff?: "pickup" | "courier" | null;
    lines: { name: string; qty: number; price: number }[];
    guestToken?: string | null;
  }): Promise<FoodTicket> {
    return invoke("placeFoodOrder", [input], () => server.placeFoodOrder(input));
  },
  listKitchen(userId: string): Promise<KitchenDesk[]> {
    return invoke("listKitchen", [userId], () => server.listKitchen(userId));
  },
  sendKitchenToCourier(userId: string, ticketId: string): Promise<FoodTicket> {
    return invoke("sendKitchenToCourier", [userId, ticketId], () => server.sendKitchenToCourier(userId, ticketId));
  },
  foodPlaceOpen(placeId: string): Promise<boolean> {
    return invoke("foodPlaceOpen", [placeId], () => server.foodPlaceOpen(placeId));
  },
  getFoodTicket(ticketId: string): Promise<FoodTicket | null> {
    return invoke("getFoodTicket", [ticketId], () => server.getFoodTicket(ticketId));
  },
  listMyFood(guestToken: string): Promise<FoodTicket[]> {
    return invoke("listMyFood", [guestToken], () => server.listMyFood(guestToken));
  },
  updateMyFood(
    guestToken: string,
    ticketId: string,
    input: { dropoff?: string | null; handoff?: "pickup" | "courier" | null; lines?: { name: string; qty: number }[] | null },
  ): Promise<FoodTicket> {
    return invoke("updateMyFood", [guestToken, ticketId, input], () => server.updateMyFood(guestToken, ticketId, input));
  },
  cancelMyFood(guestToken: string, ticketId: string): Promise<FoodTicket> {
    return invoke("cancelMyFood", [guestToken, ticketId], () => server.cancelMyFood(guestToken, ticketId));
  },
  foodDesk(placeId: string, ownerPhone: string): Promise<FoodDesk> {
    return invoke("foodDesk", [placeId, ownerPhone], () => server.foodDesk(placeId, ownerPhone));
  },
  registerFoodOwner(placeId: string, name: string, phone: string): Promise<FoodOwnerCard> {
    return invoke("registerFoodOwner", [placeId, name, phone], () => server.registerFoodOwner(placeId, name, phone));
  },
  startFoodSub(placeId: string, phone: string): Promise<FoodOwnerCard> {
    return invoke("startFoodSub", [placeId, phone], () => server.startFoodSub(placeId, phone));
  },
  setFoodAccepting(placeId: string, demoPhone: string, accepting: boolean): Promise<FoodDesk> {
    return invoke("setFoodAccepting", [placeId, demoPhone, accepting], () =>
      server.setFoodAccepting(placeId, demoPhone, accepting),
    );
  },
  setFoodStatus(placeId: string, demoPhone: string, ticketId: string, status: FoodTicketStatus): Promise<FoodTicket> {
    return invoke("setFoodStatus", [placeId, demoPhone, ticketId, status], () =>
      server.setFoodStatus(placeId, demoPhone, ticketId, status),
    );
  },
  setKitchenStatus(userId: string, ticketId: string, status: FoodTicketStatus): Promise<FoodTicket> {
    return invoke("setKitchenStatus", [userId, ticketId, status], () => server.setKitchenStatus(userId, ticketId, status));
  },
};
