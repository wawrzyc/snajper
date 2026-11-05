/**
 * Zegar systemowy może być rozjechany względem rzeczywistego czasu (np. zły
 * serwer NTP w sieci lokalnej) — dla snajpera to krytyczne, bo decydujemy
 * o strzale co do sekundy. Zamiast ufać Date.now(), korygujemy go o różnicę
 * wobec nagłówka Date zwracanego przez serwer Allegro, z którym i tak gadamy.
 */
let offsetMs = 0;
let lastSyncAt = 0;

export function recordServerDate(dateHeader: string | null | undefined) {
  if (!dateHeader) return;
  const serverMs = Date.parse(dateHeader);
  if (Number.isNaN(serverMs)) return;
  offsetMs = serverMs - Date.now();
  lastSyncAt = Date.now();
}

/** Czas "teraz" skorygowany o znane przesunięcie względem zegara Allegro. */
export function now(): number {
  return Date.now() + offsetMs;
}

export function getClockInfo() {
  return { offsetMs, lastSyncAt: lastSyncAt ? new Date(lastSyncAt).toISOString() : null };
}
