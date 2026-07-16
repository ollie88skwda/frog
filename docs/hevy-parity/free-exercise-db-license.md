# free-exercise-db — license verification (M4 seed gate)

**Verdict: CLEARED to seed.** The dataset is dedicated to the **public domain**
under the **Unlicense**, which covers both the exercise JSON and the images
(all live in the same repository under the same license).

- **Source repo:** https://github.com/yuhonas/free-exercise-db
- **License file:** https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/LICENSE.md
- **Dataset used:** https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json (873 exercises)
- **Images:** hotlinked from the jsDelivr CDN mirror `https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/<path>`
- **Checked:** 2026-07-14

## License text (verbatim, `LICENSE.md`)

> This is free and unencumbered software released into the public domain.
>
> Anyone is free to copy, modify, publish, use, compile, sell, or distribute
> this software, either in source code form or as a compiled binary, for any
> purpose, commercial or non-commercial, and by any means.
>
> In jurisdictions that recognize copyright laws, the author or authors of this
> software dedicate any and all copyright interest in the software to the public
> domain. […] For more information, please refer to <https://unlicense.org>

The repo README additionally carries a `License: Unlicense` badge linking to
<http://unlicense.org/>.

## Scope of the grant

The Unlicense is a public-domain dedication with no attribution requirement.
The repository is a single unit: the JSON documents (`exercises/*.json`,
`dist/exercises.json`) and the accompanying images (`exercises/<slug>/N.jpg`)
are all committed to the same Unlicensed repo, so the dedication covers the
data **and** the imagery. The README explicitly encourages hotlinking the
images via the `raw.githubusercontent.com/.../exercises/` prefix.

We still record `image_attribution = 'free-exercise-db (Unlicense)'` on every
seeded row as a courtesy provenance marker (not a legal obligation).

## Note on image hosting (not a license issue — an ops decision)

Seeded rows hotlink images from the **jsDelivr** CDN mirror
(`https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/<path>`),
per the M4 plan (`implementation-plan.md` §E) and the team lead's 2026-07-15
decision. jsDelivr serves the same public-domain repo with proper CDN caching,
avoiding `raw.githubusercontent.com`'s `Cache-Control: no-cache` and GitHub's
throttling of high-volume hotlinking. The host is the single `IMAGE_BASE`
constant in `scripts/import-free-exercise-db.ts` — regenerate the migration to
change it.
