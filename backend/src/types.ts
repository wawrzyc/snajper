export type WatchStatus =
  | "scheduled"
  | "fired"
  | "won"
  | "lost"
  | "error"
  | "cancelled";

export interface Watch {
  id: string;
  offerId: string;
  url: string;
  title: string;
  maxAmount: number;
  snipeOffsetSeconds: number;
  /** Koniec aukcji podany przez użytkownika (Allegro nie udostępnia go w API dla kupującego) */
  endTime: string;
  currentPrice: number | null;
  highBidder: boolean | null;
  status: WatchStatus;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HistoryEntry {
  id: string;
  watchId: string;
  offerId: string;
  title: string;
  status: WatchStatus;
  amount: number | null;
  message: string;
  createdAt: string;
}

export interface AllegroTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  scope: string;
}

export interface AllegroAppConfig {
  clientId: string;
  clientSecret: string;
  sandbox: boolean;
}

export interface StoreData {
  allegroApp: AllegroAppConfig | null;
  allegroTokens: AllegroTokens | null;
  watches: Watch[];
  history: HistoryEntry[];
}
