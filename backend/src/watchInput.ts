import { randomUUID } from "node:crypto";
import { extractOfferId } from "./util/allegroUrl.js";
import type { Watch } from "./types.js";

export interface NewWatchInput {
  url?: unknown;
  title?: unknown;
  imageUrl?: unknown;
  maxAmount?: unknown;
  snipeOffsetSeconds?: unknown;
  endTime?: unknown;
  knownPrice?: unknown;
}

function sanitizeImageUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function buildWatch(input: NewWatchInput): { watch: Watch } | { error: string } {
  const { url, title, imageUrl, maxAmount, snipeOffsetSeconds, endTime, knownPrice } = input;

  const offerId = typeof url === "string" ? extractOfferId(url) : null;
  if (!offerId) {
    return { error: "Nie rozpoznano ID oferty w podanym linku" };
  }

  const max = Number(maxAmount);
  if (!Number.isFinite(max) || max <= 0) {
    return { error: "Nieprawidłowa maksymalna kwota" };
  }

  const price = knownPrice !== undefined && knownPrice !== null && knownPrice !== "" ? Number(knownPrice) : null;
  if (price !== null && Number.isFinite(price) && max <= price) {
    return {
      error: `Maksymalna kwota (${max.toFixed(2)} zł) musi być wyższa niż aktualna cena (${price.toFixed(2)} zł) — inaczej oferta na pewno przegra.`,
    };
  }

  const end = new Date(String(endTime));
  if (Number.isNaN(end.getTime()) || end.getTime() <= Date.now()) {
    return { error: "Podaj prawidłową datę/godzinę zakończenia aukcji, w przyszłości" };
  }

  const offset = Number(snipeOffsetSeconds ?? 7);
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
      imageUrl: sanitizeImageUrl(imageUrl),
      maxAmount: max,
      snipeOffsetSeconds: offset,
      endTime: end.toISOString(),
      currentPrice: price !== null && Number.isFinite(price) ? price : null,
      highBidder: null,
      status: "scheduled",
      lastError: null,
      createdAt: now,
      updatedAt: now,
    },
  };
}
