import { allegroAuthBase, config } from "../config.js";
import { store } from "../store.js";
import type { AllegroAppConfig } from "../types.js";

const DEVICE_CODE_PATH = "/auth/oauth/device";
const TOKEN_PATH = "/auth/oauth/token";
const DEVICE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";
const SCOPE = "allegro:api:bids";

export function getAllegroApp(): AllegroAppConfig {
  const app = store.get().allegroApp;
  if (!app) {
    throw new Error("Najpierw skonfiguruj dane aplikacji Allegro w Ustawieniach");
  }
  return app;
}

export function hasAllegroApp(): boolean {
  return store.get().allegroApp !== null;
}

function basicAuthHeader(app: AllegroAppConfig): string {
  const raw = `${app.clientId}:${app.clientSecret}`;
  return `Basic ${Buffer.from(raw).toString("base64")}`;
}

export interface DeviceCodeStart {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string | null;
  intervalSeconds: number;
  expiresInSeconds: number;
}

export async function startDeviceAuthorization(): Promise<DeviceCodeStart> {
  const app = getAllegroApp();
  const res = await fetch(`${allegroAuthBase(app.sandbox)}${DEVICE_CODE_PATH}`, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(app),
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": config.allegroUserAgent,
    },
    body: new URLSearchParams({ client_id: app.clientId, scope: SCOPE }),
  });
  if (!res.ok) {
    throw new Error(`Nie udało się rozpocząć autoryzacji Allegro: HTTP ${res.status}`);
  }
  const data = (await res.json()) as any;
  return {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    verificationUriComplete: data.verification_uri_complete ?? null,
    intervalSeconds: data.interval ?? 5,
    expiresInSeconds: data.expires_in ?? 600,
  };
}

async function requestToken(app: AllegroAppConfig, body: URLSearchParams) {
  const res = await fetch(`${allegroAuthBase(app.sandbox)}${TOKEN_PATH}`, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(app),
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": config.allegroUserAgent,
    },
    body,
  });
  const data = (await res.json().catch(() => null)) as any;
  return { ok: res.ok, status: res.status, data };
}

/**
 * Odpytuje token endpoint do skutku (albo wygaśnięcia / odmowy) i zapisuje
 * tokeny do store'a po sukcesie. Wołane w tle po wystartowaniu device flow.
 */
export async function pollDeviceAuthorization(
  start: DeviceCodeStart,
  onDone: (ok: boolean, error?: string) => void,
) {
  const app = getAllegroApp();
  const deadline = Date.now() + start.expiresInSeconds * 1000;
  let interval = start.intervalSeconds;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, interval * 1000));

    const { ok, data } = await requestToken(
      app,
      new URLSearchParams({
        grant_type: DEVICE_GRANT_TYPE,
        device_code: start.deviceCode,
      }),
    );

    if (ok) {
      saveTokens(data);
      onDone(true);
      return;
    }

    if (data?.error === "slow_down") {
      interval += 5;
      continue;
    }
    if (data?.error === "authorization_pending") {
      continue;
    }

    onDone(false, data?.error ?? "unknown_error");
    return;
  }
  onDone(false, "expired");
}

function saveTokens(data: any) {
  const expiresAt = new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString();
  store.update((draft) => {
    draft.allegroTokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt,
      scope: data.scope ?? "",
    };
  });
}

async function refreshAccessToken(): Promise<string> {
  const app = getAllegroApp();
  const tokens = store.get().allegroTokens;
  if (!tokens) throw new Error("Allegro nie jest połączone");

  const { ok, data } = await requestToken(
    app,
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tokens.refreshToken,
    }),
  );
  if (!ok) {
    throw new Error(`Nie udało się odświeżyć tokenu Allegro: ${data?.error ?? "unknown"}`);
  }
  saveTokens(data);
  return data.access_token;
}

export async function getValidAccessToken(): Promise<string> {
  const tokens = store.get().allegroTokens;
  if (!tokens) throw new Error("Allegro nie jest połączone");

  const marginMs = 60_000;
  if (new Date(tokens.expiresAt).getTime() - marginMs > Date.now()) {
    return tokens.accessToken;
  }
  return refreshAccessToken();
}

export function isConnected(): boolean {
  return store.get().allegroTokens !== null;
}
