type Sink = (userId: string, title: string, body: string) => void;

let sink: Sink | null = null;

export function setAccountNotify(next: Sink | null) {
  sink = next;
}

export function accountNotify(userId: string | null | undefined, title: string, body: string) {
  if (!userId || !sink) return;
  sink(userId, title, body);
}
