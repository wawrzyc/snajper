import path from "node:path";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Brak wymaganej zmiennej środowiskowej: ${name}`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  dataDir: process.env.DATA_DIR ?? path.resolve(process.cwd(), "data"),
  // Logowanie do panelu jest obecnie wyłączone (patrz index.ts), więc te dwie
  // zmienne nie są wymagane — mają nieużywane wartości domyślne, póki auth.ts
  // nie zostanie z powrotem podłączony.
  sessionSecret: process.env.SESSION_SECRET ?? "unused-auth-disabled",
  panelPasswordHash: process.env.PANEL_PASSWORD_HASH ?? "",
  bookmarkletToken: required("BOOKMARKLET_TOKEN"),
  // Allegro wymaga, żeby każde zapytanie do API niosło nagłówek User-Agent
  // identyfikujący aplikację (regulamin REST API, pkt 3.4.c) — można nadpisać
  // własnym opisem/linkiem przez zmienną środowiskową.
  allegroUserAgent: process.env.ALLEGRO_USER_AGENT ?? "Snajper/1.0 (prywatny snajper do licytacji, uzytek niekomercyjny)",
};

export function allegroAuthBase(sandbox: boolean): string {
  return sandbox ? "https://allegro.pl.allegrosandbox.pl" : "https://allegro.pl";
}

export function allegroApiBase(sandbox: boolean): string {
  return sandbox ? "https://api.allegro.pl.allegrosandbox.pl" : "https://api.allegro.pl";
}
