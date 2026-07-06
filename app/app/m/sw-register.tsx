"use client";

import { useEffect } from "react";

/** Регистрация service worker PWA техника (кеш + push). */
export function SwRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);
  return null;
}
