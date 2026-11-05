import { Router } from "express";
import {
  hasAllegroApp,
  isConnected,
  pollDeviceAuthorization,
  startDeviceAuthorization,
} from "../allegro/oauth.js";

export const allegroRouter = Router();

let pending: { startedAt: number; done: boolean; error: string | null } | null = null;

allegroRouter.get("/status", (_req, res) => {
  res.json({
    configured: hasAllegroApp(),
    connected: isConnected(),
    pending: pending && !pending.done ? true : false,
    error: pending?.error ?? null,
  });
});

allegroRouter.post("/connect", async (_req, res) => {
  try {
    const start = await startDeviceAuthorization();
    pending = { startedAt: Date.now(), done: false, error: null };

    void pollDeviceAuthorization(start, (ok, error) => {
      if (pending) {
        pending.done = true;
        pending.error = ok ? null : error ?? "unknown_error";
      }
    });

    res.json({
      userCode: start.userCode,
      verificationUri: start.verificationUriComplete ?? start.verificationUri,
      expiresInSeconds: start.expiresInSeconds,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
