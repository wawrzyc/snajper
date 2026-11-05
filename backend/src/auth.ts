import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { config } from "./config.js";

const COOKIE_NAME = "snajper_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dni

export function verifyPassword(password: string): boolean {
  const [salt, storedHash] = config.panelPasswordHash.split(":");
  if (!salt || !storedHash) return false;
  const computed = Buffer.from(crypto.scryptSync(password, salt, 64).toString("hex"));
  const stored = Buffer.from(storedHash);
  if (computed.length !== stored.length) return false;
  return crypto.timingSafeEqual(stored, computed);
}

function sign(value: string): string {
  const mac = crypto.createHmac("sha256", config.sessionSecret).update(value).digest("hex");
  return `${value}.${mac}`;
}

function unsign(signed: string): string | null {
  const idx = signed.lastIndexOf(".");
  if (idx === -1) return null;
  const value = signed.slice(0, idx);
  const expected = Buffer.from(sign(value));
  const actual = Buffer.from(signed);
  if (expected.length !== actual.length) return null;
  return crypto.timingSafeEqual(expected, actual) ? value : null;
}

export function issueSessionCookie(res: Response) {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const token = sign(String(expiresAt));
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: SESSION_TTL_MS,
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(COOKIE_NAME);
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const raw = req.cookies?.[COOKIE_NAME];
  const value = typeof raw === "string" ? unsign(raw) : null;
  if (!value || Number(value) < Date.now()) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
}
