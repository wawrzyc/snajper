import { Router } from "express";
import { store } from "../store.js";
import { buildWatch } from "../watchInput.js";
import { extractOfferId } from "../util/allegroUrl.js";

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
  const { url, maxAmount, snipeOffsetSeconds, endTime, title } = req.body ?? {};

  if (url !== undefined && !extractOfferId(String(url))) {
    res.status(400).json({ error: "Nie rozpoznano ID oferty w podanym linku" });
    return;
  }
  if (endTime !== undefined && Number.isNaN(new Date(endTime).getTime())) {
    res.status(400).json({ error: "Nieprawidłowa data/godzina zakończenia aukcji" });
    return;
  }

  let updated = false;
  let notFoundReason: string | null = null;

  store.update((draft) => {
    const watch = draft.watches.find((w) => w.id === req.params.id);
    if (!watch) {
      notFoundReason = "Nie znaleziono licytacji";
      return;
    }
    if (watch.status !== "scheduled") {
      notFoundReason = "Nie można już edytować — strzał już padł";
      return;
    }
    if (url !== undefined) {
      watch.url = String(url);
      watch.offerId = extractOfferId(String(url))!;
    }
    if (maxAmount !== undefined) watch.maxAmount = Number(maxAmount);
    if (snipeOffsetSeconds !== undefined) watch.snipeOffsetSeconds = Number(snipeOffsetSeconds);
    if (endTime !== undefined) watch.endTime = new Date(endTime).toISOString();
    if (title !== undefined) watch.title = String(title);
    watch.updatedAt = new Date().toISOString();
    updated = true;
  });

  if (!updated) {
    res.status(404).json({ error: notFoundReason ?? "Nie znaleziono" });
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
