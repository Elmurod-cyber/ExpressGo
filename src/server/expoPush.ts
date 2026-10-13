export type ExpoPush = { to: string; title: string; body: string };

export function expoPushBody(items: ExpoPush[]) {
  return items
    .filter((item) => /^(ExponentPushToken|ExpoPushToken)\[.+\]$/.test(item.to))
    .map((item) => ({
      to: item.to,
      title: item.title,
      body: item.body,
      sound: "default" as const,
      channelId: "express-go",
    }));
}

type Sender = (items: ExpoPush[]) => Promise<void>;

async function postExpo(items: ExpoPush[]) {
  const messages = expoPushBody(items);
  if (!messages.length) return;
  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(messages),
  });
  if (!response.ok) throw new Error("Push yuborilmadi.");
}

let sender: Sender = postExpo;

export function setExpoPushSender(next: Sender | null) {
  sender = next ?? postExpo;
}

export async function sendExpoPushes(items: ExpoPush[]) {
  if (!items.length) return;
  await sender(items);
}
