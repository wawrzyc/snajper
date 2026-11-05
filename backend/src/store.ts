import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import type { StoreData } from "./types.js";

const filePath = path.join(config.dataDir, "store.json");

function emptyStore(): StoreData {
  return { allegroApp: null, allegroTokens: null, watches: [], history: [] };
}

function load(): StoreData {
  if (!fs.existsSync(filePath)) {
    return emptyStore();
  }
  const raw = fs.readFileSync(filePath, "utf-8");
  if (!raw.trim()) return emptyStore();
  return { ...emptyStore(), ...(JSON.parse(raw) as Partial<StoreData>) };
}

let data: StoreData = load();

function persist() {
  fs.mkdirSync(config.dataDir, { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmpPath, filePath);
}

export const store = {
  get(): StoreData {
    return data;
  },
  update(mutator: (draft: StoreData) => void) {
    mutator(data);
    persist();
  },
};
