#!/usr/bin/env python3
"""Phase 0 — holistic progression + edge-case review on real Hevy data.
Stdlib only. Validates: (a) progression detection per exercise,
(b) off/light-day detection, (c) data-quality / edge-case catching."""
import csv, io, math, statistics as st
from collections import defaultdict, Counter
from datetime import datetime

PATH = "/Users/Ollie/Downloads/workout_data.csv"
DATEFMT = "%d %b %Y, %H:%M"

def parse_date(s):
    try: return datetime.strptime(s.strip(), DATEFMT)
    except Exception: return None

def epley(w, r):  # estimated 1RM
    return w * (1 + r / 30.0) if (w and r) else None

def linreg(xs, ys):
    n = len(xs)
    if n < 2: return 0.0, 0.0, 0.0
    mx, my = sum(xs)/n, sum(ys)/n
    sxx = sum((x-mx)**2 for x in xs); sxy = sum((x-mx)*(y-my) for x,y in zip(xs,ys))
    if sxx == 0: return 0.0, my, 0.0
    slope = sxy/sxx; inter = my - slope*mx
    syy = sum((y-my)**2 for y in ys)
    r2 = (sxy**2/(sxx*syy)) if syy else 0.0
    return slope, inter, r2

# ---- load ----
with open(PATH, encoding="utf-8-sig", errors="replace") as f:
    rows = list(csv.DictReader(f))

# build set records
sets = []
for r in rows:
    d = parse_date(r["start_time"])
    try: w = float(r["weight_lbs"]) if r["weight_lbs"].strip() else None
    except ValueError: w = None
    try: reps = int(float(r["reps"])) if r["reps"].strip() else None
    except ValueError: reps = None
    sets.append({"date": d, "title": r["title"].strip(), "ex": r["exercise_title"].strip(),
                 "set_type": r["set_type"].strip(), "w": w, "reps": reps,
                 "e1rm": epley(w, reps), "raw": r})

dates = [s["date"] for s in sets if s["date"]]
span0, span1 = min(dates), max(dates)
sessions = sorted({s["date"] for s in sets if s["date"]})
print("="*64)
print("HOLISTIC REVIEW —", PATH.split("/")[-1])
print("="*64)
print(f"span: {span0:%d %b %Y} -> {span1:%d %b %Y}  ({(span1-span0).days} days)")
print(f"sets: {len(sets)} | sessions: {len(sessions)} | exercises: {len(set(s['ex'] for s in sets))}")
weeks = max(1,(span1-span0).days/7)
print(f"avg frequency: {len(sessions)/weeks:.2f} sessions/week")

# training gaps
gaps = [(sessions[i]-sessions[i-1]).days for i in range(1,len(sessions))]
biggaps = sorted([(sessions[i-1],sessions[i],(sessions[i]-sessions[i-1]).days)
                  for i in range(1,len(sessions))], key=lambda x:-x[2])[:5]
print(f"median gap between sessions: {st.median(gaps)} days | longest layoffs:")
for a,b,g in biggaps:
    if g>=7: print(f"   {g:>3}d  {a:%d %b %Y} -> {b:%d %b %Y}")

# set_type composition
comp = Counter(s["set_type"] for s in sets)
fail_ratio = comp.get("failure",0)/len(sets)
print(f"\nset types: {dict(comp)}  -> {fail_ratio*100:.0f}% logged to FAILURE")

# ================= PER-EXERCISE PROGRESSION =================
print("\n"+"="*64); print("PER-EXERCISE PROGRESSION (working sets, by top e1RM/session)"); print("="*64)
by_ex = defaultdict(lambda: defaultdict(list))   # ex -> date -> [e1rm]
for s in sets:
    if s["set_type"]=="warmup" or not s["date"] or s["e1rm"] is None: continue
    by_ex[s["ex"]][s["date"]].append(s["e1rm"])

results=[]
for ex, byd in by_ex.items():
    ses = sorted(byd)
    tops = [max(byd[d]) for d in ses]
    n=len(ses)
    if n<5: continue
    x0=ses[0]
    xs=[(d-x0).days for d in ses]
    slope,inter,r2 = linreg(xs, tops)
    first = st.median(tops[:3]); last = st.median(tops[-3:])
    pct = (last-first)/first*100 if first else 0
    slope30 = slope*30
    if pct>=5 and slope>0: verdict="PROGRESSING"
    elif pct<=-5: verdict="REGRESSING"
    else: verdict="PLATEAU"
    results.append((n,ex,first,last,pct,slope30,r2,verdict))

results.sort(key=lambda t:-t[0])
print(f"{'n':>3} {'exercise':32} {'first':>7} {'last':>7} {'chg%':>6} {'/30d':>6} {'r2':>4}  verdict")
for n,ex,first,last,pct,s30,r2,v in results[:18]:
    print(f"{n:>3} {ex[:32]:32} {first:>7.0f} {last:>7.0f} {pct:>+6.1f} {s30:>+6.1f} {r2:>4.2f}  {v}")

prog=[r for r in results if r[7]=="PROGRESSING"]; plat=[r for r in results if r[7]=="PLATEAU"]; reg=[r for r in results if r[7]=="REGRESSING"]
print(f"\nsummary: {len(prog)} progressing | {len(plat)} plateau | {len(reg)} regressing (of {len(results)} w/ >=5 sessions)")

# ================= OFF / LIGHT DAY DETECTION =================
print("\n"+"="*64); print("OFF / LIGHT-DAY DETECTION (whole-session dips vs recent norm)"); print("="*64)
# per exercise trailing median (prev up to 4 sessions); per session avg deviation across exercises
exseq=defaultdict(list)  # ex -> list of (date, top)
for ex,byd in by_ex.items():
    for d in sorted(byd): exseq[ex].append((d,max(byd[d])))
sess_dev=defaultdict(list)
sess_title={}
for ex,seq in exseq.items():
    for i,(d,top) in enumerate(seq):
        prev=[t for (_,t) in seq[max(0,i-4):i]]
        if len(prev)>=2:
            base=st.median(prev)
            if base: sess_dev[d].append((top-base)/base*100)
for s in sets:
    if s["date"]: sess_title[s["date"]]=s["title"]
flag=[]
for d,devs in sess_dev.items():
    if len(devs)>=3:
        m=st.mean(devs)
        if m<=-7: flag.append((d,m,len(devs)))
flag.sort()
if flag:
    print("flagged sessions where most lifts dropped vs your recent norm (possible off/light/extenuating day):")
    for d,m,k in flag:
        print(f"   {d:%d %b %Y}  {sess_title.get(d,'')[:22]:22} avg {m:>+5.1f}% across {k} lifts")
else:
    print("none above threshold.")
print(f"\n({len(flag)} sessions flagged for human/AI review — the kind of day to annotate with 'felt off / deload / sick')")

# ================= DATA-QUALITY / EDGE CASES =================
print("\n"+"="*64); print("DATA-QUALITY & EDGE CASES (old data may be wrong)"); print("="*64)
miss_w=[s for s in sets if s["w"] is None]
zero_r=[s for s in sets if s["reps"]==0]
print(f"missing weight: {len(miss_w)} sets  e.g. " + ", ".join(sorted(set(s['ex'] for s in miss_w))[:5]))
print(f"zero reps:      {len(zero_r)} sets  e.g. " + ", ".join(f"{s['ex'][:18]}@{s['w']}" for s in zero_r[:5]))

# per-exercise weight outliers via MAD (likely typos / unit slips)
print("\nweight outliers (>5 MAD from exercise median — likely typos/misentries):")
out_n=0
for ex in set(s["ex"] for s in sets):
    ws=[s["w"] for s in sets if s["ex"]==ex and s["w"]]
    if len(ws)<8: continue
    med=st.median(ws); mad=st.median([abs(w-med) for w in ws]) or 1
    for s in sets:
        if s["ex"]==ex and s["w"]:
            z=abs(s["w"]-med)/(1.4826*mad)
            if z>5:
                out_n+=1
                if out_n<=10:
                    print(f"   {s['date']:%d %b %Y}  {ex[:26]:26} {s['w']:>5.0f}lb (median {med:.0f}, z={z:.1f})")
print(f"   ... {out_n} total outliers flagged")

# implausible session-over-session e1rm spikes that revert (typo signature)
print("\nspike-then-revert on top e1RM (single-session anomaly, likely bad entry):")
spk=0
for ex,seq in exseq.items():
    for i in range(1,len(seq)-1):
        a,b,c=seq[i-1][1],seq[i][1],seq[i+1][1]
        if a and c and b> a*1.4 and b> c*1.4:
            spk+=1
            if spk<=8: print(f"   {seq[i][0]:%d %b %Y}  {ex[:24]:24} {a:.0f} -> {b:.0f} -> {c:.0f}")
print(f"   ... {spk} spike-revert anomalies")

# ================= RECENT BLOCK (FBEOD) =================
print("\n"+"="*64); print("RECENT BLOCK FOCUS: 'fbeod' (most locked-in / scientific)"); print("="*64)
fb=[s for s in sets if "fbeod" in s["title"].lower()]
if fb:
    fbd=sorted({s["date"] for s in fb})
    print(f"fbeod sessions: {len(fbd)}  ({min(fbd):%d %b} -> {max(fbd):%d %b %Y})")
    fbex=defaultdict(lambda:defaultdict(list))
    for s in fb:
        if s["e1rm"] and s["set_type"]!="warmup": fbex[s["ex"]][s["date"]].append(s["e1rm"])
    print("  exercise progression within fbeod block:")
    for ex,byd in sorted(fbex.items(), key=lambda kv:-len(kv[1])):
        ses=sorted(byd);
        if len(ses)<2: continue
        tops=[max(byd[d]) for d in ses]
        pct=(tops[-1]-tops[0])/tops[0]*100 if tops[0] else 0
        print(f"     {ex[:30]:30} {len(ses)} sess  {tops[0]:.0f} -> {tops[-1]:.0f}  ({pct:+.0f}%)")
