// Share-card taglines — frog-sass in the spirit of "a live frog for every
// single one." A handful of templates × word-bank slots combine into many
// distinct-feeling variants from a small amount of code, rather than
// hand-authoring hundreds of one-off lines. See docs/DECISIONS.md 2026-07-30.
// Cosmetic caption only — one `Math.random()` pick per share, no rigor needed.

type Tone = "strong" | "normal";

// "Strong" fires only on the one session-quality signal that already exists
// in the data — a PR landed this session (post-save-summary.tsx's prLines) —
// rather than inventing a new "workout quality" score for a caption.
const ADJECTIVES: Record<Tone, string[]> = {
  strong: [
    "record-breaking",
    "legendary",
    "unstoppable",
    "certified",
    "victorious",
    "PR-hungry",
  ],
  normal: [
    "live",
    "genuine",
    "off-brand",
    "caffeinated",
    "card-carrying",
    "amphibious",
    "moderately damp",
  ],
};

const NOUNS = [
  "single rep",
  "logged set",
  "drop of sweat",
  "warm-up",
  "training day",
  "PR attempt",
  "line of data",
  "workout logged",
];

// `phrase` = "a live" / "an unstoppable" (article + adjective, lowercase).
type Template = (phrase: string, noun: string) => string;

const TEMPLATES: Template[] = [
  (phrase, noun) => `${cap(phrase)} frog for every ${noun}.`,
  (phrase, noun) => `${cap(phrase)} frog, logged with every ${noun}.`,
  (phrase, noun) => `Somewhere, ${phrase} frog approves of this ${noun}.`,
  (phrase, noun) => `This ${noun} just earned ${phrase} frog.`,
];

function article(word: string): "a" | "an" {
  return /^[aeiou]/i.test(word) ? "an" : "a";
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

export function randomTagline(tone: Tone = "normal"): string {
  const adjective = pick(ADJECTIVES[tone]);
  const noun = pick(NOUNS);
  const phrase = `${article(adjective)} ${adjective}`;
  return pick(TEMPLATES)(phrase, noun);
}
