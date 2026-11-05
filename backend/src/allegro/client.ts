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
      "Accept-Language": "pl-PL",
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

/** Tłumaczy/uściśla najczęstsze komunikaty błędów Allegro na zrozumiałe wyjaśnienie po polsku. */
function explainBidError(status: number, code: string | undefined, raw: string): string {
  const lower = raw.toLowerCase();
  if (status === 404 || lower.includes("auction not found")) {
    return "Nie znaleziono tej aukcji na Allegro (zły numer oferty albo aukcja usunięta).";
  }
  if (lower.includes("inactive") || lower.includes("ended") || lower.includes("zakończ")) {
    return `Aukcja nie była już aktywna w momencie strzału — najpewniej zakończyła się wcześniej niż podany czas końca, albo została zakończona/anulowana przez sprzedającego. (surowy komunikat Allegro: „${raw}”)`;
  }
  if (lower.includes("minimal") || lower.includes("too low") || lower.includes("amount")) {
    return `Allegro odrzuciło kwotę — ktoś mógł mieć już wyższą ofertę niż Twoje maksimum. (surowy komunikat Allegro: „${raw}”)`;
  }
  if (status === 401 || status === 403) {
    return "Brak autoryzacji do złożenia oferty — połączenie z Allegro mogło wygasnąć, spróbuj połączyć się ponownie w Ustawieniach.";
  }
  return `${raw}${code ? ` (kod: ${code})` : ""}`;
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
    const rawMessage =
      body?.errors?.[0]?.userMessage ??
      body?.errors?.[0]?.message ??
      `HTTP ${res.status}`;
    const code = body?.errors?.[0]?.code;
    const message = `Oferta NIE została złożona. ${explainBidError(res.status, code, rawMessage)}`;
    return { success: false, bid: null, message };
  }

  return { success: true, bid: parseMyBid(body), message: "Oferta złożona" };
}
