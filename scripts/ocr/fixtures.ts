// Synthetic workout-screenshot fixtures (no real data). Each fixture is a
// phone-sized HTML page imitating one app's layout plus the ground truth the
// OCR + parser pipeline is measured against. `render-fixtures.ts` turns them
// into the small PNGs committed under packages/core/src/import/ocr/fixtures/.

export type Truth = {
  title: string | null;
  date: string | null;
  durationMin: number | null;
  unit: "kg" | "lb" | null;
  exercises: {
    name: string;
    sets: { reps: number; weight: number | null; warmup?: boolean }[];
  }[];
};

export type Fixture = {
  id: string;
  app: "hevy" | "strong" | "fitbod" | "jefit" | "apple" | "generic";
  dark: boolean;
  /** Degraded capture: 1x scale + blur, like a re-compressed chat screenshot. */
  lowres?: boolean;
  html: string;
  truth: Truth;
};

const FONT = "-apple-system, 'Helvetica Neue', Arial, sans-serif";

function page(dark: boolean, body: string, extra = ""): string {
  const bg = dark ? "#0e0f12" : "#ffffff";
  const fg = dark ? "#f2f3f5" : "#111214";
  return `<html><body style="margin:0;width:390px;height:844px;background:${bg};color:${fg};font-family:${FONT};padding:56px 20px 0;box-sizing:border-box">${body}<style>${extra}
  .mute{color:${dark ? "#9aa0a8" : "#6b7078"}} .row{display:flex;gap:12px;padding:7px 0;font-size:17px} h1{font-size:26px;margin:0 0 6px} h2{font-size:19px;margin:22px 0 6px;color:${dark ? "#6cb2ff" : "#1769d1"}}</style></body></html>`;
}

type S = { reps: number; weight: number | null; warmup?: boolean };

function hevy(dark: boolean): Fixture {
  const ex: { name: string; sets: S[] }[] = [
    {
      name: "Bench Press (Barbell)",
      sets: [
        { reps: 8, weight: 60, warmup: true },
        { reps: 8, weight: 100 },
        { reps: 6, weight: 102.5 },
      ],
    },
    {
      name: "Incline Dumbbell Press",
      sets: [
        { reps: 10, weight: 32 },
        { reps: 9, weight: 32 },
      ],
    },
    {
      name: "Triceps Pushdown",
      sets: [
        { reps: 12, weight: 35 },
        { reps: 12, weight: 35 },
      ],
    },
  ];
  const rows = ex
    .map(
      (e) =>
        `<h2>${e.name}</h2><div class="row mute" style="font-size:13px"><span style="width:50px">SET</span><span>WEIGHT &amp; REPS</span></div>` +
        e.sets
          .map(
            (s, i) =>
              `<div class="row"><span style="width:50px">${s.warmup ? "W" : i + (e.sets[0].warmup ? 0 : 1)}</span><span>${s.weight} kg × ${s.reps}</span></div>`,
          )
          .join(""),
    )
    .join("");
  return {
    id: `hevy-${dark ? "dark" : "light"}`,
    app: "hevy",
    dark,
    html: page(
      dark,
      `<h1>Push Day</h1><div class="mute" style="font-size:15px">Nov 3, 2026 · 1h 12m</div>${rows}`,
    ),
    truth: {
      title: "Push Day",
      date: "2026-11-03",
      durationMin: 72,
      unit: "kg",
      exercises: ex,
    },
  };
}

function strong(dark: boolean): Fixture {
  const ex: { name: string; sets: S[] }[] = [
    {
      name: "Squat (Barbell)",
      sets: [
        { reps: 5, weight: 135, warmup: true },
        { reps: 5, weight: 225 },
        { reps: 5, weight: 225 },
        { reps: 4, weight: 230 },
      ],
    },
    {
      name: "Romanian Deadlift (Barbell)",
      sets: [
        { reps: 8, weight: 185 },
        { reps: 8, weight: 185 },
      ],
    },
    {
      name: "Leg Press",
      sets: [
        { reps: 12, weight: 360 },
        { reps: 10, weight: 380 },
      ],
    },
  ];
  const rows = ex
    .map(
      (e) =>
        `<h2>${e.name}</h2><div class="row mute" style="font-size:13px"><span style="width:40px">SET</span><span style="width:110px">PREVIOUS</span><span style="width:70px">LBS</span><span>REPS</span></div>` +
        e.sets
          .map(
            (s, i) =>
              `<div class="row"><span style="width:40px">${s.warmup ? "W" : i + (e.sets[0].warmup ? 0 : 1)}</span><span class="mute" style="width:110px">${s.weight} lb x ${s.reps}</span><span style="width:70px">${s.weight}</span><span>${s.reps}</span></div>`,
          )
          .join(""),
    )
    .join("");
  return {
    id: `strong-${dark ? "dark" : "light"}`,
    app: "strong",
    dark,
    html: page(
      dark,
      `<h1>Leg Day</h1><div class="mute" style="font-size:15px">Friday, Nov 6, 2026 · 58min</div>${rows}`,
    ),
    truth: {
      title: "Leg Day",
      date: "2026-11-06",
      durationMin: 58,
      unit: "lb",
      exercises: ex,
    },
  };
}

function fitbod(): Fixture {
  const ex: { name: string; sets: S[] }[] = [
    {
      name: "Barbell Bench Press",
      sets: [
        { reps: 10, weight: 135 },
        { reps: 8, weight: 155 },
        { reps: 6, weight: 175 },
      ],
    },
    {
      name: "Lat Pulldown",
      sets: [
        { reps: 12, weight: 120 },
        { reps: 10, weight: 130 },
      ],
    },
    {
      name: "Seated Cable Row",
      sets: [
        { reps: 12, weight: 110 },
        { reps: 12, weight: 110 },
      ],
    },
  ];
  const rows = ex
    .map(
      (e) =>
        `<h2 style="color:${"#f2f3f5"}">${e.name}</h2>` +
        e.sets
          .map(
            (s, i) =>
              `<div class="row" style="font-size:17px"><span style="width:70px" class="mute">Set ${i + 1}</span><span>${s.reps} reps × ${s.weight} lb</span></div>`,
          )
          .join(""),
    )
    .join("");
  return {
    id: "fitbod-dark",
    app: "fitbod",
    dark: true,
    html: page(
      true,
      `<h1>Upper Body</h1><div class="mute" style="font-size:15px">Nov 9, 2026 · 51 min</div>${rows}`,
    ),
    truth: {
      title: "Upper Body",
      date: "2026-11-09",
      durationMin: 51,
      unit: "lb",
      exercises: ex,
    },
  };
}

function jefit(): Fixture {
  const ex: { name: string; sets: S[] }[] = [
    {
      name: "Barbell Curl",
      sets: [
        { reps: 10, weight: 60 },
        { reps: 10, weight: 65 },
        { reps: 8, weight: 70 },
      ],
    },
    {
      name: "Hammer Curl",
      sets: [
        { reps: 12, weight: 25 },
        { reps: 12, weight: 25 },
      ],
    },
    {
      name: "Cable Crunch",
      sets: [
        { reps: 15, weight: 80 },
        { reps: 15, weight: 80 },
      ],
    },
  ];
  const rows = ex
    .map(
      (e) =>
        `<h2>${e.name}</h2>` +
        e.sets
          .map(
            (s, i) =>
              `<div class="row"><span>Set ${i + 1}: ${s.weight} lbs x ${s.reps}</span></div>`,
          )
          .join(""),
    )
    .join("");
  return {
    id: "jefit-light",
    app: "jefit",
    dark: false,
    html: page(
      false,
      `<h1>Arms &amp; Abs</h1><div class="mute" style="font-size:15px">11/10/2026 · 44 min</div>${rows}`,
    ),
    truth: {
      title: "Arms & Abs",
      date: "2026-11-10",
      durationMin: 44,
      unit: "lb",
      exercises: ex,
    },
  };
}

function apple(): Fixture {
  return {
    id: "apple-dark",
    app: "apple",
    dark: true,
    html: page(
      true,
      `<h1 style="font-size:30px">Traditional Strength Training</h1><div class="mute" style="font-size:15px;margin-bottom:30px">Nov 11, 2026</div>
       <div style="font-size:15px" class="mute">Workout Time</div><div style="font-size:40px;color:#f5e84a;margin-bottom:18px">0:46:08</div>
       <div style="font-size:15px" class="mute">Active Calories</div><div style="font-size:40px;color:#ff375f;margin-bottom:18px">312CAL</div>
       <div style="font-size:15px" class="mute">Avg. Heart Rate</div><div style="font-size:40px;color:#ff375f">128BPM</div>`,
    ),
    truth: {
      title: "Traditional Strength Training",
      date: "2026-11-11",
      durationMin: 46,
      unit: null,
      exercises: [],
    },
  };
}

function notes(): Fixture {
  const ex: { name: string; sets: S[] }[] = [
    {
      name: "Bench press",
      sets: [100, 100, 100].map((w) => ({ reps: 8, weight: w })),
    },
    {
      name: "Overhead press",
      sets: [60, 60, 60].map((w) => ({ reps: 10, weight: w })),
    },
    {
      name: "Pull ups",
      sets: [0, 0, 0, 0].map(() => ({ reps: 8, weight: null })),
    },
  ];
  return {
    id: "notes-light",
    app: "generic",
    dark: false,
    html: page(
      false,
      `<h1 style="font-family:Georgia,serif">Gym 11/12/2026</h1>
       <div style="font-size:19px;line-height:2;font-family:Georgia,serif">Bench press 3x8 @ 100kg<br>Overhead press 3x10 @ 60kg<br>Pull ups 4x8</div>`,
    ),
    truth: {
      title: "Gym",
      date: "2026-11-12",
      durationMin: null,
      unit: "kg",
      exercises: ex,
    },
  };
}

const lowres = (f: Fixture): Fixture => ({
  ...f,
  id: `${f.id}-lowres`,
  lowres: true,
  html: f.html
    .replace("<body ", '<body class="lr" ')
    .replace("</style>", ".lr{filter:blur(0.7px)}</style>"),
});

export const FIXTURES: Fixture[] = [
  hevy(false),
  hevy(true),
  strong(false),
  strong(true),
  fitbod(),
  jefit(),
  apple(),
  notes(),
  lowres(hevy(true)),
  lowres(strong(false)),
  lowres(fitbod()),
  lowres(jefit()),
];
