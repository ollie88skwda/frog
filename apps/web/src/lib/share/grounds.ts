// Ground palettes — four grounds, replacing the old dark/light/transparent
// three (share redesign, report §5.3). Colors are sampled at render time from
// the real Radix `--sage-*`/`--grass-*` tokens under a forced light/dark
// class (preserved verbatim from the pre-redesign share-card.tsx — this
// technique is load-bearing, not incidental). Green is the one ground with a
// fixed palette: it's the shipped brand-tile palette (icon.svg), not a theme
// token, and ground + line work must move together (AGENTS.md).

export type Ground = "dark" | "light" | "photo" | "green";

export const GROUNDS: Ground[] = ["dark", "light", "photo", "green"];
export const GROUND_LABELS: Record<Ground, string> = {
  dark: "Dark",
  light: "Light",
  photo: "Photo",
  green: "Green",
};

export type Palette = {
  bg: string | null; // null = the photo ground paints its own background
  ink: string;
  soft: string;
  faint: string;
  hair: string;
  accent: string;
  shadow: boolean; // text shadow for legibility over a photo
  /** Fill for the brand mark's body — `accent` on every ground except Green,
   * where the tile spec (AGENTS.md "Brand mark") wants the body the SAME
   * green as the ground so only the black line work reads, not a solid
   * silhouette. Kept separate from `accent` because `accent` elsewhere on
   * the card (eyebrow text, heat-map highlight) needs to CONTRAST with the
   * green ground, which the tile's own green body deliberately does not. */
  markBody: string;
};

// Fixed brand-tile palette (must match GROUND/#ground in scripts/gen-pwa-icons.ts
// and apps/web/public/icon.svg — ground and line work move together).
const GREEN_BG = "#6AB347";
const GREEN_INK = "#131426";

/** Resolves a CSS custom property to a concrete color. Without `themeClass`
 * it samples the token as the app is currently themed; with one it forces a
 * theme so a ground can pin a palette the user isn't looking at. */
export function sampleToken(
  cssVar: string,
  fallback: string,
  themeClass?: "light" | "dark",
): string {
  if (typeof document === "undefined") return fallback;
  const el = document.createElement("span");
  if (themeClass) el.className = themeClass;
  el.style.display = "none";
  el.style.color = `var(${cssVar})`;
  document.body.appendChild(el);
  const c = getComputedStyle(el).color;
  el.remove();
  return c || fallback;
}

export function paletteFor(ground: Ground, accent: string): Palette {
  switch (ground) {
    case "light":
      return {
        bg: "#ffffff", // theme.css `:root { --bg: white }` — not sage-2
        ink: sampleToken("--sage-12", "#1a211e", "light"),
        soft: sampleToken("--sage-11", "#5f6563", "light"),
        faint: sampleToken("--sage-10", "#7c8481", "light"),
        // sage-6 on white is effectively invisible — sage-7 is the visible
        // hairline for the light ground specifically.
        hair: sampleToken("--sage-7", "#c1c6c4", "light"),
        accent,
        markBody: accent,
        shadow: false,
      };
    case "photo":
      return {
        bg: null,
        ink: "#ffffff",
        soft: "rgba(255,255,255,0.82)",
        faint: "rgba(255,255,255,0.62)",
        hair: "rgba(255,255,255,0.28)",
        accent,
        markBody: accent,
        shadow: true,
      };
    case "green":
      return {
        bg: GREEN_BG,
        ink: GREEN_INK,
        soft: "rgba(19,20,38,0.72)",
        faint: "rgba(19,20,38,0.55)",
        hair: "rgba(19,20,38,0.35)",
        accent: GREEN_INK,
        // Body = the ground's own green (AGENTS.md "Brand mark" — the tile's
        // body carries the same green as its ground); only the black line
        // work should read, not a solid silhouette.
        markBody: GREEN_BG,
        shadow: false,
      };
    default:
      return {
        // theme.css `:root.dark { --bg: var(--sage-1) }`
        bg: sampleToken("--sage-1", "#101211", "dark"),
        ink: sampleToken("--sage-12", "#eceeed", "dark"),
        soft: sampleToken("--sage-11", "#adb5b2", "dark"),
        faint: sampleToken("--sage-10", "#717d79", "dark"),
        hair: sampleToken("--sage-6", "#373b39", "dark"),
        accent,
        markBody: accent,
        shadow: false,
      };
  }
}
