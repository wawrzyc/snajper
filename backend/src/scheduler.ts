import { randomUUID } from "node:crypto";
import { store } from "./store.js";
import { getMyBid, placeBid } from "./allegro/client.js";
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

async function fireSnipe(watch: Watch) {
  fired.add(watch.id);
  updateWatch(watch.id, { status: "fired" });

  const result = await placeBid(watch.offerId, watch.maxAmount);

  if (!result.success) {
    updateWatch(watch.id, { status: "error", lastError: result.message });
    addHistory(watch, "error", null, result.message);
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
    new Date(watch.endTime).getTime() + FINALIZE_DELAY_S * 1000 - Date.now(),
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
    updateWatch(watch.id, { status: "error", lastError: "Nie udało się potwierdzić wyniku licytacji" });
    addHistory(watch, "error", null, "Nie udało się odczytać ostatecznego wyniku z Allegro");
    return;
  }

  if (bid.highBidder && !bid.minimalPriceMet) {
    updateWatch(watch.id, { status: "lost", currentPrice: bid.currentPrice, highBidder: bid.highBidder });
    addHistory(
      watch,
      "lost",
      bid.currentPrice,
      "Najwyższa oferta, ale nie osiągnięto ceny minimalnej sprzedającego — aukcja nie zakończy się sprzedażą",
    );
    return;
  }

  const status: Watch["status"] = bid.highBidder ? "won" : "lost";
  updateWatch(watch.id, { status, currentPrice: bid.currentPrice, highBidder: bid.highBidder });
  addHistory(
    watch,
    status,
    bid.currentPrice,
    status === "won" ? "Wygrana licytacja" : "Przegrana licytacja",
  );
}

function tick() {
  const now = Date.now();
  const watches = store.get().watches.filter((w) => w.status === "scheduled");

  for (const watch of watches) {
    if (fired.has(watch.id)) continue;
    const fireAt = new Date(watch.endTime).getTime() - watch.snipeOffsetSeconds * 1000;
    if (now >= fireAt) {
      void fireSnipe(watch);
    }
  }
}

let timer: NodeJS.Timeout | null = null;

export function startScheduler() {
  if (timer) return;
  timer = setInterval(tick, TICK_MS);

  // Po restarcie serwera doplanuj finalizację dla strzałów, które już padły.
  for (const watch of store.get().watches) {
    if (watch.status === "fired" || watch.status === "won" || watch.status === "lost") {
      fired.add(watch.id);
      if (watch.status === "fired") scheduleFinalize(watch);
    }
  }
}

export function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}
