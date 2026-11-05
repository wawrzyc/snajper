import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cookieParser from "cookie-parser";
import { config } from "./config.js";
import { allegroRouter } from "./routes/allegro.js";
import { watchesRouter } from "./routes/watches.js";
import { bookmarkletRouter } from "./routes/bookmarklet.js";
import { settingsRouter } from "./routes/settings.js";
import { startScheduler } from "./scheduler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(__dirname, "../../frontend");

const app = express();
app.use(express.json());
app.use(cookieParser());

// Logowanie do panelu jest na razie wyłączone (patrz src/auth.ts i
// routes/auth.ts, żeby je przywrócić — podmontuj authRouter i requireAuth
// na trasach poniżej).
app.use("/api/allegro", allegroRouter);
app.use("/api/watches", watchesRouter);
app.use("/api/bookmarklet", bookmarkletRouter);
app.use("/api/settings", settingsRouter);

app.use(express.static(frontendDir));
app.get("*", (_req, res) => {
  res.sendFile(path.join(frontendDir, "index.html"));
});

startScheduler();

app.listen(config.port, () => {
  console.log(`Snajper backend działa na porcie ${config.port}`);
});
