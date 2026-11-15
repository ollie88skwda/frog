// Ground palettes — four grounds re-skinned to the Because green system
// (docs/brand/because-reference). Day = warm paper + ink, Night = Graphite,
// Green = Fern solid with ink. Values are the literal Because tokens (a canvas
// painter can't read CSS vars under a forced mode), so keep them in step with
// styles/theme.css [data-theme="green"].

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

const FERN = "#afcfab";
const INK = "#211816";
const PAPER = "#fcf9f4";

export function paletteFor(ground: Ground, accent: string): Palette {
  switch (ground) {
    case "light":
      return {
        bg: PAPER,
        ink: INK,
        soft: "#5d4f4a",
        faint: "#786c63",
        hair: "#dcd7ce",
        accent: "#386134",
        markBody: FERN,
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
        bg: FERN,
        ink: INK,
        soft: "rgba(33,24,22,0.78)",
        faint: "rgba(33,24,22,0.62)",
        hair: "rgba(33,24,22,0.28)",
        accent: INK,
        // Body = the ground's own green (AGENTS.md "Brand mark" — the tile's
        // body carries the same green as its ground); only the black line
        // work should read, not a solid silhouette.
        markBody: FERN,
        shadow: false,
      };
    default:
      return {
        bg: "#191513",
        ink: "#ece7df",
        soft: "#c4bcb4",
        faint: "#958e88",
        hair: "#383330",
        accent: "#99c195",
        markBody: accent,
        shadow: false,
      };
  }
}
