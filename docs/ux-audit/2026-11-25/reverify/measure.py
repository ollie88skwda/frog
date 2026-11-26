"""Item 8 contrast from rendered pixels (not computed styles).

Usage: python3 -I measure.py <reverify dir>
For each side cell in 8-boxes-<w>.json it samples, from 8-<w>-<mode>.png:
  outline: median of the 1 CSS px border band on the cell's left and right
           edges (middle third of the height, inner device pixel of the band)
  bg:      median of a strip 3 CSS px outside the cell (the row/tile fill)
  tag:     median of the tag's left/right edge columns (avoids the letter)
  letter:  the pixel inside the tag farthest in luminance from the tag fill
and prints WCAG 2.x contrast ratios.
"""
import json
import statistics
import sys
from pathlib import Path

from PIL import Image

D = Path(sys.argv[1])


def lum(c):
    def ch(v):
        v /= 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4

    r, g, b = c[:3]
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)


def ratio(a, b):
    la, lb = lum(a), lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def med(px):
    return tuple(int(statistics.median(p[i] for p in px)) for i in range(3))


def hexc(c):
    return "#%02x%02x%02x" % c


out = {}
for w in (390, 360):
    boxes = json.loads((D / f"8-boxes-{w}.json").read_text())
    s = boxes["dpr"]
    for mode in ("day", "night"):
        im = Image.open(D / f"8-{w}-{mode}.png").convert("RGB")
        for where in ("list", "summary"):
            b = boxes.get(f"{where}-{mode}")
            if not b:
                continue
            for c in b["cells"]:
                x0, y0 = c["cell"]["x"] * s, c["cell"]["y"] * s
                x1 = x0 + c["cell"]["w"] * s
                y1 = y0 + c["cell"]["h"] * s
                ys = range(int(y0 + (y1 - y0) / 3), int(y0 + 2 * (y1 - y0) / 3))
                # Border band is s device px wide; sample its middle pixel.
                border = [im.getpixel((round(x0) + s // 2, y)) for y in ys] + [
                    im.getpixel((round(x1) - 1 - s // 2, y)) for y in ys
                ]
                bg = [im.getpixel((round(x0) - 3 * s, y)) for y in ys] + [
                    im.getpixel((round(x1) + 3 * s, y)) for y in ys
                ]
                t = c["tag"]
                tx0, ty0 = t["x"] * s, t["y"] * s
                tx1, ty1 = tx0 + t["w"] * s, ty0 + t["h"] * s
                tys = range(int(ty0 + t["h"] * s / 3), int(ty0 + 2 * t["h"] * s / 3))
                tagpx = [im.getpixel((round(tx0) + s, y)) for y in tys] + [
                    im.getpixel((round(tx1) - 1 - s, y)) for y in tys
                ]
                o, g, tg = med(border), med(bg), med(tagpx)
                inner = [
                    im.getpixel((x, y))
                    for x in range(round(tx0) + 2 * s, round(tx1) - 2 * s)
                    for y in range(round(ty0) + 2 * s, round(ty1) - 2 * s)
                ]
                letter = max(inner, key=lambda p: abs(lum(p) - lum(tg)))
                key = f"{w} {mode} {where} {c['side']}"
                out[key] = {
                    "outline": hexc(o),
                    "bg": hexc(g),
                    "tag": hexc(tg),
                    "letter": hexc(letter[:3]),
                    "outline_vs_bg": round(ratio(o, g), 2),
                    "tag_vs_bg": round(ratio(tg, g), 2),
                    "letter_vs_tag": round(ratio(letter, tg), 2),
                }
for k, v in out.items():
    print(k, v)
(D / "8-contrast.json").write_text(json.dumps(out, indent=2))
