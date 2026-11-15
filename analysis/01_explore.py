#!/usr/bin/env python3
"""Phase 0 — profile the real workout CSV before any analysis."""
import sys, csv, io, statistics
from collections import Counter, defaultdict

PATH = "/Users/Ollie/Downloads/workout_data.csv"

# read raw
with open(PATH, "r", encoding="utf-8-sig", errors="replace") as f:
    raw = f.read()

# sniff delimiter
sample = raw[:5000]
try:
    dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
    delim = dialect.delimiter
except Exception:
    delim = ","
print(f"=== FILE ===\npath: {PATH}\nbytes: {len(raw)}\ndelimiter: {delim!r}\n")

rows = list(csv.reader(io.StringIO(raw), delimiter=delim))
if not rows:
    print("EMPTY"); sys.exit()

header = rows[0]
data = rows[1:]
print(f"columns ({len(header)}): {header}\n")
print(f"data rows: {len(data)}\n")

print("=== FIRST 12 ROWS ===")
for r in rows[:13]:
    print(r)
print()

print("=== LAST 5 ROWS ===")
for r in rows[-5:]:
    print(r)
print()

# per-column profile
print("=== COLUMN PROFILE ===")
ncol = len(header)
for i in range(ncol):
    vals = [r[i].strip() for r in data if i < len(r)]
    nonempty = [v for v in vals if v != ""]
    miss = len(vals) - len(nonempty)
    uniq = Counter(nonempty)
    # numeric?
    nums = []
    for v in nonempty:
        try:
            nums.append(float(v))
        except ValueError:
            pass
    is_num = len(nums) >= max(1, int(0.6 * len(nonempty))) and len(nonempty) > 0
    line = f"[{i}] {header[i]!r:28} miss={miss:<5} uniq={len(uniq):<6}"
    if is_num and nums:
        line += f" num min={min(nums):g} max={max(nums):g} mean={statistics.mean(nums):.2f}"
    else:
        common = uniq.most_common(6)
        line += " e.g. " + ", ".join(f"{k}({c})" for k, c in common)
    print(line)
print()

# try to find a date-ish and exercise-ish column
print("=== GUESSES ===")
for i, h in enumerate(header):
    hl = h.lower()
    if any(k in hl for k in ("date", "day", "time")):
        print(f"date-like col: [{i}] {h}")
    if any(k in hl for k in ("exercise", "lift", "movement", "workout")):
        print(f"exercise-like col: [{i}] {h}")
    if any(k in hl for k in ("weight", "load", "kg", "lb")):
        print(f"weight-like col: [{i}] {h}")
    if any(k in hl for k in ("rep",)):
        print(f"reps-like col: [{i}] {h}")
    if any(k in hl for k in ("rir", "rpe")):
        print(f"effort-like col: [{i}] {h}")
