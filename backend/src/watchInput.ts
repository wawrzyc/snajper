import { randomUUID } from "node:crypto";
import { extractOfferId } from "./util/allegroUrl.js";
import type { Watch } from "./types.js";

export interface NewWatchInput {
  url?: unknown;
  title?: unknown;
  maxAmount?: unknown;
  snipeOffsetSeconds?: unknown;
  endTime?: unknown;
}

export function buildWatch(input: NewWatchInput): { watch: Watch } | { error: string } {
  const { url, title, maxAmount, snipeOffsetSeconds, endTime } = input;

  const offerId = typeof url === "string" ? extractOfferId(url) : null;
  if (!offerId) {
    return { error: "Nie rozpoznano ID oferty w podanym linku" };
  }

  const max = Number(maxAmount);
  if (!Number.isFinite(max) || max <= 0) {
    return { error: "Nieprawidłowa maksymalna kwota" };
  }

  const end = new Date(String(endTime));
  if (Number.isNaN(end.getTime()) || end.getTime() <= Date.now()) {
    return { error: "Podaj prawidłową datę/godzinę zakończenia aukcji, w przyszłości" };
  }

  const offset = Number(snipeOffsetSeconds ?? 5);
  if (!Number.isFinite(offset) || offset < 1) {
    return { error: "Nieprawidłowe wyprzedzenie strzału (w sekundach)" };
  }

  const now = new Date().toISOString();
  return {
    watch: {
      id: randomUUID(),
      offerId,
      url: String(url),
      title: typeof title === "string" && title.trim() ? title.trim() : `Oferta ${offerId}`,
      maxAmount: max,
      snipeOffsetSeconds: offset,
      endTime: end.toISOString(),
      currentPrice: null,
      highBidder: null,
      status: "scheduled",
      lastError: null,
      createdAt: now,
      updatedAt: now,
    },
  };
}
