let sessionToken = "";

export function getSessionToken(): string {
  return sessionToken;
}

export function setSessionToken(value: string) {
  sessionToken = value.trim();
}
