import { allegroApiBase, config } from "../config.js";
import { getAllegroApp, getValidAccessToken } from "./oauth.js";

export interface MyBid {
  maxAmount: number;
  currentPrice: number | null;
  highBidder: boolean;
  minimalPriceMet: boolean;
}

export interface BidResult {
  success: boolean;
  bid: MyBid | null;
  message: string;
}

async function allegroFetch(pathSuffix: string, init: RequestInit = {}) {
  const token = await getValidAccessToken();
  const { sandbox } = getAllegroApp();
  return fetch(`${allegroApiBase(sandbox)}${pathSuffix}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.allegro.public.v1+json",
      "Content-Type": "application/vnd.allegro.public.v1+json",
      "User-Agent": config.allegroUserAgent,
      ...init.headers,
    },
  });
}

function parseMyBid(body: any): MyBid {
  return {
    maxAmount: Number(body?.maxAmount?.amount ?? 0),
    currentPrice: body?.auction?.currentPrice?.amount
      ? Number(body.auction.currentPrice.amount)
      : null,
    highBidder: Boolean(body?.highBidder),
    minimalPriceMet: body?.minimalPriceMet !== false,
  };
}

/** Odczyt własnej oferty w licytacji — działa tylko gdy już złożyliśmy bid; przed strzałem zwykle 404. */
export async function getMyBid(offerId: string): Promise<MyBid | null> {
  const res = await allegroFetch(`/bidding/offers/${offerId}/bid`);
  if (!res.ok) return null;
  const body = (await res.json().catch(() => null)) as any;
  return body ? parseMyBid(body) : null;
}

export async function placeBid(offerId: string, maxAmount: number): Promise<BidResult> {
  const res = await allegroFetch(`/bidding/offers/${offerId}/bid`, {
    method: "PUT",
    body: JSON.stringify({
      maxAmount: { amount: maxAmount.toFixed(2), currency: "PLN" },
    }),
  });

  const body = (await res.json().catch(() => null)) as any;

  if (!res.ok) {
    const message =
      body?.errors?.[0]?.userMessage ??
      body?.errors?.[0]?.message ??
      `HTTP ${res.status}`;
    return { success: false, bid: null, message };
  }

  return { success: true, bid: parseMyBid(body), message: "Oferta złożona" };
}
