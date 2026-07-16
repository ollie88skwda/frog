// Rest-timer / PR alert: a short two-oscillator WebAudio blip and the
// background attention-getters (tab-title flash + a local notification when the
// page is hidden). Browser-only, all behind capability guards so the SPA stays
// Capacitor-compatible. When a service worker is registered (M12 PWA) the
// notification is routed through registration.showNotification — required on
// Android and more reliable when the tab is backgrounded — falling back to the
// page-context Notification constructor.

import { swRegistration } from "./pwa";

/**
 * Plays a ~150ms two-tone blip at the given volume (0 = silent). Created lazily
 * inside a user gesture (set completion), so no AudioContext is spun up until a
 * sound actually fires.
 */
export function playRestBlip(volume: number): void {
  if (!(volume > 0)) return;
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    // Cap the peak well below 1.0 so a full-volume alert is firm, not painful.
    gain.gain.setValueAtTime(volume * 0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
    gain.connect(ctx.destination);
    for (const freq of [880, 1320]) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + 0.15);
    }
    window.setTimeout(() => void ctx.close(), 300);
  } catch {
    // AudioContext blocked (autoplay policy / unsupported) — silent no-op.
  }
}

/**
 * Flashes the tab title a few times, and — when the page is hidden and
 * notification permission is already granted — posts a local notification.
 * Never prompts for permission here; the settings hub (M12) owns the ask.
 */
export function alertRestDone(message: string): void {
  flashTitle(message);
  if (
    typeof Notification === "undefined" ||
    !document.hidden ||
    Notification.permission !== "granted"
  ) {
    return;
  }
  void (async () => {
    try {
      const reg = await swRegistration();
      if (reg) {
        await reg.showNotification(message, { tag: "sbl-rest" });
      } else {
        new Notification(message);
      }
    } catch {
      // Notification unsupported / blocked — the title flash still fired.
    }
  })();
}

function flashTitle(message: string): void {
  const original = document.title;
  let flips = 0;
  const id = window.setInterval(() => {
    document.title = flips % 2 === 0 ? message : original;
    flips += 1;
    if (flips >= 6) {
      window.clearInterval(id);
      document.title = original;
    }
  }, 700);
}
