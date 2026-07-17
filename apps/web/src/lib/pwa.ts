import type { Repo } from "@sbl/core";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { voice } from "./voice";

// PWA plumbing: service-worker registration, the install prompt, notification
// permission, and thin web-push subscription. Everything is behind capability
// guards so the SPA stays Capacitor-compatible (browser-only APIs no-op in a
// native shell) and safe to import in non-secure/older contexts.

// ── Service worker ─────────────────────────────────────────────────────────

/** Registers /sw.js. Called once from main.tsx behind a prod guard — the SW is
 * an app-shell asset cache only (no offline-data promises). */
export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registration failure is non-fatal — the app runs fine without the SW.
    });
  });
}

/** The active SW registration, if any (for showNotification routing). */
export async function swRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return (await navigator.serviceWorker.getRegistration()) ?? null;
  } catch {
    return null;
  }
}

// ── Install prompt (Android/desktop Chromium) ───────────────────────────────

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const installListeners = new Set<() => void>();
function emitInstall() {
  for (const l of installListeners) l();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // stop Chrome's mini-infobar; we drive the prompt
    deferredPrompt = e as BeforeInstallPromptEvent;
    emitInstall();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    emitInstall();
  });
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/** Install affordance: whether a native install prompt is available, a trigger
 * for it, and iOS/standalone flags so the UI can fall back to instructions. */
export function useInstallPrompt(): {
  canInstall: boolean;
  promptInstall: () => Promise<"accepted" | "dismissed" | "unavailable">;
  installed: boolean;
  ios: boolean;
} {
  const canInstall = useSyncExternalStore(
    (cb) => {
      installListeners.add(cb);
      return () => installListeners.delete(cb);
    },
    () => deferredPrompt !== null,
    () => false,
  );
  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return "unavailable" as const;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    emitInstall();
    return outcome;
  }, []);
  return { canInstall, promptInstall, installed: isStandalone(), ios: isIOS() };
}

// ── Notification permission ─────────────────────────────────────────────────

export type NotifPermission = "granted" | "denied" | "default" | "unsupported";

function notifPermission(): NotifPermission {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

export function useNotificationPermission(): {
  permission: NotifPermission;
  request: () => Promise<NotifPermission>;
} {
  const [permission, setPermission] =
    useState<NotifPermission>(notifPermission);
  const request = useCallback(async () => {
    if (typeof Notification === "undefined") return "unsupported" as const;
    const result = await Notification.requestPermission();
    setPermission(result);
    return result;
  }, []);
  return { permission, request };
}

// ── Web push (thin) ─────────────────────────────────────────────────────────

// The server VAPID public key, exposed to the client at build time. Absent →
// push is not configured; the UI degrades to in-page audio + SW-local
// notifications (plan §F: the guaranteed path).
const VAPID_PUBLIC_KEY: string =
  (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ?? "";

export const pushConfigured = VAPID_PUBLIC_KEY.length > 0;

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await swRegistration();
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

/** Subscribes this device to push and persists the subscription (repo). Throws
 * if push isn't configured/supported — the caller gates on pushConfigured. */
export async function subscribeToPush(repo: Repo): Promise<void> {
  // These messages surface verbatim in the settings UI (setError(e.message)),
  // so they carry the voice register.
  if (!pushConfigured || !pushSupported()) {
    throw new Error(
      voice(
        "Push is not configured on this device.",
        "The frog is annoyed (your data is safe). Push is not configured on this device.",
      ),
    );
  }
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(
      VAPID_PUBLIC_KEY,
    ) as BufferSource,
  });
  const json = sub.toJSON();
  const keys = json.keys as { p256dh: string; auth: string } | undefined;
  if (!json.endpoint || !keys)
    throw new Error(
      voice(
        "The push subscription came back without keys.",
        "The frog is annoyed (your data is safe). The push subscription came back without keys.",
      ),
    );
  await repo.savePushSubscription(json.endpoint, keys);
}

/** Unsubscribes this device and removes the stored subscription. */
export async function unsubscribeFromPush(repo: Repo): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe().catch(() => {});
  await repo.deletePushSubscription(endpoint);
}

/** Reflects whether this device currently holds a push subscription. */
export function usePushSubscribed(): {
  subscribed: boolean;
  loading: boolean;
  refresh: () => void;
} {
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(() => {
    if (!pushSupported()) {
      setSubscribed(false);
      setLoading(false);
      return;
    }
    void currentSubscription().then((sub) => {
      setSubscribed(sub !== null);
      setLoading(false);
    });
  }, []);
  useEffect(refresh, [refresh]);
  return { subscribed, loading, refresh };
}
