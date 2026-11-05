import { Router } from "express";
import { store } from "../store.js";
import { buildWatch } from "../watchInput.js";

export const watchesRouter = Router();

watchesRouter.get("/", (_req, res) => {
  res.json(store.get().watches);
});

watchesRouter.get("/history", (_req, res) => {
  res.json(store.get().history.slice(0, 200));
});

watchesRouter.post("/", (req, res) => {
  const result = buildWatch(req.body ?? {});
  if ("error" in result) {
    res.status(400).json({ error: result.error });
    return;
  }

  store.update((draft) => {
    draft.watches.unshift(result.watch);
  });

  res.status(201).json(result.watch);
});

watchesRouter.patch("/:id", (req, res) => {
  const { maxAmount, snipeOffsetSeconds, endTime, title } = req.body ?? {};
  let updated = false;

  store.update((draft) => {
    const watch = draft.watches.find((w) => w.id === req.params.id);
    if (!watch || watch.status !== "scheduled") return;
    if (maxAmount !== undefined) watch.maxAmount = Number(maxAmount);
    if (snipeOffsetSeconds !== undefined) watch.snipeOffsetSeconds = Number(snipeOffsetSeconds);
    if (endTime !== undefined) watch.endTime = new Date(endTime).toISOString();
    if (title !== undefined) watch.title = String(title);
    watch.updatedAt = new Date().toISOString();
    updated = true;
  });

  if (!updated) {
    res.status(404).json({ error: "Nie znaleziono lub nie można już edytować (strzał padł)" });
    return;
  }
  res.json(store.get().watches.find((w) => w.id === req.params.id));
});

watchesRouter.delete("/:id", (req, res) => {
  store.update((draft) => {
    draft.watches = draft.watches.filter((w) => w.id !== req.params.id);
  });
  res.json({ ok: true });
});
