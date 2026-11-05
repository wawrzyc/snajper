import { randomUUID } from "node:crypto";
import { store } from "./store.js";
import { getMyBid, placeBid } from "./allegro/client.js";
import { now as adjustedNow } from "./allegro/clock.js";
import type { Watch } from "./types.js";

const TICK_MS = 250;
/** Ile sekund po czasie zakończenia aukcji sprawdzamy ostateczny wynik. */
const FINALIZE_DELAY_S = 20;

const fired = new Set<string>();
const finalizeScheduled = new Set<string>();

function addHistory(watch: Watch, status: Watch["status"], amount: number | null, message: string) {
  store.update((draft) => {
    draft.history.unshift({
      id: randomUUID(),
      watchId: watch.id,
      offerId: watch.offerId,
      title: watch.title,
      imageUrl: watch.imageUrl,
      status,
      amount,
      message,
      createdAt: new Date().toISOString(),
    });
  });
}

function updateWatch(id: string, patch: Partial<Watch>) {
  store.update((draft) => {
    const watch = draft.watches.find((w) => w.id === id);
    if (!watch) return;
    Object.assign(watch, patch, { updatedAt: new Date().toISOString() });
  });
}

function getWatch(id: string): Watch | undefined {
  return store.get().watches.find((w) => w.id === id);
}

/**
 * Zapisuje ostateczny wynik w historii i usuwa wpis z listy "Zaplanowane /
 * aktywne" — skoro się zakończył (wygrana/przegrana/błąd), nie jest już
 * aktywny, a pełny zapis i tak zostaje w historii.
 */
function resolveWatch(watch: Watch, status: Watch["status"], amount: number | null, message: string) {
  addHistory(watch, status, amount, message);
  store.update((draft) => {
    draft.watches = draft.watches.filter((w) => w.id !== watch.id);
  });
}

const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1500;

async function fireSnipe(watch: Watch) {
  fired.add(watch.id);
  updateWatch(watch.id, { status: "fired" });

  let result = await placeBid(watch.offerId, watch.maxAmount);
  let attempt = 1;

  // Niektóre błędy mogą być chwilowe (np. przeciążenie Allegro w ostatnich
  // sekundach licytacji z wieloma rywalami) — próbujemy ponownie zanim się poddamy.
  while (!result.success && attempt < RETRY_ATTEMPTS) {
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    attempt += 1;
    result = await placeBid(watch.offerId, watch.maxAmount);
  }

  if (!result.success) {
    const message = `${result.message} (próbowano ${attempt}×)`;
    resolveWatch(watch, "error", null, message);
    return;
  }

  updateWatch(watch.id, {
    currentPrice: result.bid?.currentPrice ?? null,
    highBidder: result.bid?.highBidder ?? null,
    lastError: null,
  });
  addHistory(watch, "fired", result.bid?.currentPrice ?? null, "Oferta złożona, czekam na zakończenie aukcji");

  scheduleFinalize(watch);
}

function scheduleFinalize(watch: Watch) {
  if (finalizeScheduled.has(watch.id)) return;
  finalizeScheduled.add(watch.id);

  const delayMs = Math.max(
    0,
    new Date(watch.endTime).getTime() + FINALIZE_DELAY_S * 1000 - adjustedNow(),
  );

  setTimeout(() => {
    void finalize(watch.id);
  }, delayMs);
}

async function finalize(watchId: string) {
  const watch = getWatch(watchId);
  if (!watch) return;

  const bid = await getMyBid(watch.offerId);

  if (!bid) {
    resolveWatch(watch, "error", null, "Nie udało się odczytać ostatecznego wyniku z Allegro");
    return;
  }

  if (bid.highBidder && !bid.minimalPriceMet) {
    resolveWatch(
      watch,
      "lost",
      bid.currentPrice,
      "Najwyższa oferta, ale nie osiągnięto ceny minimalnej sprzedającego — aukcja nie zakończy się sprzedażą",
    );
    return;
  }

  const status: Watch["status"] = bid.highBidder ? "won" : "lost";
  resolveWatch(watch, status, bid.currentPrice, status === "won" ? "Wygrana licytacja" : "Przegrana licytacja");
}

function tick() {
  const now = adjustedNow();
  const watches = store.get().watches.filter((w) => w.status === "scheduled");

  for (const watch of watches) {
    if (fired.has(watch.id)) continue;
    const fireAt = new Date(watch.endTime).getTime() - watch.snipeOffsetSeconds * 1000;
    if (now >= fireAt) {
      void fireSnipe(watch);
    }
  }
}

const CLOCK_SYNC_INTERVAL_MS = 2 * 60_000;

/**
 * Odświeża przesunięcie zegara (patrz allegro/clock.ts), odpytując Allegro
 * o cokolwiek — interesuje nas tylko nagłówek Date odpowiedzi, nie wynik.
 * Bez tego offset poznalibyśmy dopiero przy pierwszym prawdziwym strzale,
 * czyli za późno.
 */
async function syncClock() {
  const anyWatch = store.get().watches.find((w) => w.status === "scheduled");
  const probeOfferId = anyWatch?.offerId ?? "0";
  try {
    await getMyBid(probeOfferId);
  } catch {
    // brak połączenia z Allegro — spróbujemy przy następnej okazji
  }
}

let timer: NodeJS.Timeout | null = null;
let clockTimer: NodeJS.Timeout | null = null;

export function startScheduler() {
  if (timer) return;
  timer = setInterval(tick, TICK_MS);
  clockTimer = setInterval(() => void syncClock(), CLOCK_SYNC_INTERVAL_MS);
  void syncClock();

  // Po restarcie serwera doplanuj finalizację dla strzałów, które już padły
  // (wygrana/przegrana/błąd są od razu usuwane z listy, więc tu zostają tylko "fired").
  for (const watch of store.get().watches) {
    if (watch.status === "fired") {
      fired.add(watch.id);
      scheduleFinalize(watch);
    }
  }
}

export function stopScheduler() {
  if (timer) clearInterval(timer);
  if (clockTimer) clearInterval(clockTimer);
  timer = null;
  clockTimer = null;
}
