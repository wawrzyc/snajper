import { Router } from "express";
import { clearSessionCookie, issueSessionCookie, verifyPassword } from "../auth.js";

export const authRouter = Router();

authRouter.post("/login", (req, res) => {
  const { password } = req.body ?? {};
  if (typeof password !== "string" || !verifyPassword(password)) {
    res.status(401).json({ error: "Nieprawidłowe hasło" });
    return;
  }
  issueSessionCookie(res);
  res.json({ ok: true });
});

authRouter.post("/logout", (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});
