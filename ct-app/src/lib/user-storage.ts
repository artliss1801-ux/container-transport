export function getUserStorageKey(userId: string, key: string): string {
  return `user:${userId}:${key}`;
}

export function getUserItem(userId: string, key: string): string | null {
  if (typeof window === "undefined") return null;
  try { return localStorage.getItem(getUserStorageKey(userId, key)); } catch { return null; }
}

export function setUserItem(userId: string, key: string, value: string): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(getUserStorageKey(userId, key), value); } catch {}
}

export function cleanLegacyKeys(): void {
  if (typeof window === "undefined") return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && !k.startsWith("user:")) keysToRemove.push(k);
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch {}
}

