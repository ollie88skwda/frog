// Radix Themes scopes its design tokens — radius, panel backgrounds, the
// accent/gray alias scales — to the `.radix-themes` element. Radix primitives
// (Dialog, DropdownMenu, Popover, Tooltip, the cmdk palette) portal to
// document.body by DEFAULT, which lands them OUTSIDE `.radix-themes`, so those
// scoped vars go unresolved and overlays render square-cornered and unstyled
// while the rest of the app is themed.
//
// Portaling overlays into the theme root instead lets them inherit the full
// token set (the :root bridge tokens still cascade down too). `.radix-themes`
// is the top-level app div (a direct child of <body> with no transform), so
// fixed-positioned overlays position against the viewport exactly as before.
//
// SPA-only (no SSR): document is always available, and by the time any overlay
// opens the <Theme> root is mounted. Returns undefined only in the impossible
// pre-mount case, where the primitive falls back to body.
export function themePortalContainer(): HTMLElement | undefined {
  if (typeof document === "undefined") return undefined;
  return document.querySelector<HTMLElement>(".radix-themes") ?? undefined;
}
