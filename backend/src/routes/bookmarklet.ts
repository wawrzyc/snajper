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

/**
 * Zamiast szyć całą logikę na stałe w link zakładki (który raz przeciągnięty
 * na pasek nigdy się już nie zaktualizuje), zakładka jest cienkim loaderem,
 * który przy KAŻDYM kliknięciu doczytuje świeży kod stąd. Dzięki temu
 * poprawki w ekstrakcji danych działają od razu, bez przeciągania zakładki
 * na nowo.
 */
bookmarkletRouter.get("/script", (req, res) => {
  const token = String(req.query.token ?? "");
  const expected = Buffer.from(config.bookmarkletToken);
  const actual = Buffer.from(token);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    res.status(401).type("application/javascript").send("console.error('Snajper: nieprawidłowy token bookmarkletu.');");
    return;
  }

  const apiBase = `${req.protocol}://${req.get("host")}`;
  const script = [
    "(function(){",
    "try {",
    "var scripts = document.querySelectorAll('script[type=\"application/ld+json\"]');",
    "var endTime = null, title = null, price = null, image = null;",
    "for (var i = 0; i < scripts.length; i++) {",
    "  try {",
    "    var data = JSON.parse(scripts[i].textContent);",
    "    var items = Array.isArray(data) ? data : [data];",
    "    for (var j = 0; j < items.length; j++) {",
    "      var it = items[j];",
    "      var offers = it && it.offers;",
    "      if (offers && offers.priceValidUntil) {",
    "        endTime = offers.priceValidUntil;",
    "        title = it.name || title;",
    "        price = offers.price || price;",
    "        if (it.image) {",
    "          var img = Array.isArray(it.image) ? it.image[0] : it.image;",
    "          image = (img && img.url) || (typeof img === 'string' ? img : null) || image;",
    "        }",
    "      }",
    "    }",
    "  } catch (e) {}",
    "}",
    "var m = location.href.match(/(\\d{6,})(?:[/?#]|$)/);",
    "var offerId = m ? m[1] : null;",
    "if (title) { title = title.replace(/\\\\u([0-9a-fA-F]{4})/g, function(_, h){ return String.fromCharCode(parseInt(h,16)); }); }",
    "if (!endTime || !offerId) { alert('Snajper: nie znalazłem danych aukcji na tej stronie.'); return; }",
    "var maxAmount = prompt('Dodaję: ' + (title || offerId) + '\\nKoniec: ' + endTime + '\\nAktualna cena: ' + (price || '?') + ' zł\\n\\nMaksymalna kwota (zł, musi być WYŻSZA niż aktualna cena):', price || '');",
    "if (!maxAmount) return;",
    `fetch('${apiBase}/api/bookmarklet/add', {`,
    "  method: 'POST',",
    `  headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ${token}' },`,
    "  body: JSON.stringify({ url: location.href, title: title, imageUrl: image, endTime: endTime, maxAmount: Number(maxAmount), knownPrice: price ? Number(price) : null })",
    "}).then(function(r){ return r.json(); }).then(function(data){",
    "  alert(data.error ? ('Błąd: ' + data.error) : 'Dodano do Snajpera!');",
    "}).catch(function(err){ alert('Błąd połączenia: ' + err.message); });",
    "} catch (e) { alert('Błąd: ' + e.message); }",
    "})();",
  ].join("\n");

  res.type("application/javascript").send(script);
});

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
