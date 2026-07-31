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
};

// Fixed brand-tile palette (must match GROUND/#ground in scripts/gen-pwa-icons.ts
// and apps/web/public/icon.svg — ground and line work move together).
const GREEN_BG = "#6AB347";
const GREEN_INK = "#131426";

function sampleForcedToken(
  themeClass: "light" | "dark",
  cssVar: string,
  fallback: string,
): string {
  if (typeof document === "undefined") return fallback;
  const el = document.createElement("span");
  el.className = themeClass;
  el.style.display = "none";
  el.style.color = `var(${cssVar})`;
  document.body.appendChild(el);
  const c = getComputedStyle(el).color;
  el.remove();
  return c || fallback;
}

export function sampleLiveToken(cssVar: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const el = document.createElement("span");
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
        ink: sampleForcedToken("light", "--sage-12", "#1a211e"),
        soft: sampleForcedToken("light", "--sage-11", "#5f6563"),
        faint: sampleForcedToken("light", "--sage-10", "#7c8481"),
        // sage-6 on white is effectively invisible — sage-7 is the visible
        // hairline for the light ground specifically.
        hair: sampleForcedToken("light", "--sage-7", "#c1c6c4"),
        accent,
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
        shadow: false,
      };
    default:
      return {
        // theme.css `:root.dark { --bg: var(--sage-1) }`
        bg: sampleForcedToken("dark", "--sage-1", "#101211"),
        ink: sampleForcedToken("dark", "--sage-12", "#eceeed"),
        soft: sampleForcedToken("dark", "--sage-11", "#adb5b2"),
        faint: sampleForcedToken("dark", "--sage-10", "#717d79"),
        hair: sampleForcedToken("dark", "--sage-6", "#373b39"),
        accent,
        shadow: false,
      };
  }
}
