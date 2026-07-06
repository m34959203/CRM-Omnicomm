/**
 * Генерация версии service worker на каждый билд (npm prebuild).
 * Пишет public/sw-version.js — sw.js подключает его через importScripts,
 * так браузер видит изменение SW и инвалидирует старый кеш
 * (гоча feedback_pwa_sw_cache_versioning: версия кеша на каждую сборку).
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(dir, "..", "public", "sw-version.js");
const version = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
writeFileSync(out, `self.SW_VERSION = "${version}";\n`);
console.log(`sw-version: ${version}`);
