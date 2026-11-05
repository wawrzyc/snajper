import { Router } from "express";
import { config } from "../config.js";
import { store } from "../store.js";

export const settingsRouter = Router();

settingsRouter.get("/bookmarklet-token", (_req, res) => {
  res.json({ token: config.bookmarkletToken });
});

settingsRouter.get("/allegro-app", (_req, res) => {
  const app = store.get().allegroApp;
  res.json({
    configured: app !== null,
    clientId: app?.clientId ?? "",
    sandbox: app?.sandbox ?? false,
  });
});

settingsRouter.post("/allegro-app", (req, res) => {
  const { clientId, clientSecret, sandbox } = req.body ?? {};

  if (typeof clientId !== "string" || !clientId.trim()) {
    res.status(400).json({ error: "Podaj Client ID" });
    return;
  }

  const existing = store.get().allegroApp;
  const newSecret = typeof clientSecret === "string" && clientSecret.trim() ? clientSecret.trim() : null;

  if (!newSecret && !existing?.clientSecret) {
    res.status(400).json({ error: "Podaj Client Secret" });
    return;
  }

  store.update((draft) => {
    draft.allegroApp = {
      clientId: clientId.trim(),
      clientSecret: newSecret ?? existing!.clientSecret,
      sandbox: Boolean(sandbox),
    };
    // Zmiana aplikacji unieważnia dotychczasowe tokeny — trzeba połączyć ponownie.
    draft.allegroTokens = null;
  });

  res.json({ ok: true });
});
