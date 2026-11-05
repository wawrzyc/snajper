import { Router } from "express";
import type { Request } from "express";
import crypto from "node:crypto";
import { config } from "../config.js";
import { store } from "../store.js";
import { buildWatch } from "../watchInput.js";

export const bookmarkletRouter = Router();

// Bookmarklet biega w kontekście strony allegro.pl, więc zapytanie jest cross-origin —
// zezwalamy na nie tylko dla tego originu, a autoryzacja idzie przez token (nie cookie).
bookmarkletRouter.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin === "https://allegro.pl") {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  }
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

function hasValidToken(req: Request): boolean {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  const expected = Buffer.from(config.bookmarkletToken);
  const actual = Buffer.from(token);
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

bookmarkletRouter.post("/add", (req, res) => {
  if (!hasValidToken(req)) {
    res.status(401).json({ error: "Nieprawidłowy token" });
    return;
  }

  const result = buildWatch(req.body ?? {});
  if ("error" in result) {
    res.status(400).json({ error: result.error });
    return;
  }

  store.update((draft) => {
    draft.watches.unshift(result.watch);
  });

  res.status(201).json({ ok: true, watch: result.watch });
});
