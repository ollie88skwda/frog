import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { isMajorTick, snapToStep } from "./entry";

// Horizontal ruler for the live set entry (2026-11-17): ticks scroll under a
// fixed needle, drag with momentum, snap to the step. Hand-written (~150
// lines) rather than a dependency: no maintained, small ruler picker also
// gives role=slider, a last-time marker and reduced-motion handling.

const REDUCED = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function buzz() {
  if (REDUCED()) return;
  try {
    navigator.vibrate?.(6);
  } catch {
    /* haptics are an enhancement only */
  }
}

type Props = {
  value: number;
  min: number;
  max: number;
  step: number;
  /** A major (taller, labelled) tick every N steps. */
  majorEvery: number;
  /** A mid-height tick every N steps (optional). */
  midEvery?: number;
  /** Pixels between adjacent ticks. */
  pxPerStep?: number;
  /** Last time's value, drawn as a small dot on the ruler. */
  ghost?: number | null;
  label: string;
  unit?: string;
  testId: string;
  /** Big exact-value readout above the needle (default on). */
  readout?: boolean;
  /** Jump buttons either side for big moves, e.g. a plate (2.5 kg / 5 lb). */
  jump?: number;
  onChange: (v: number) => void;
  onStart?: () => void;
  /** Readout and tick-label text for a value, e.g. 5 → "5+", -1 → "–". */
  format?: (v: number) => string;
  /** Readout while the value is still unset (RIR never prefills); a tap on
   * the ruler then picks the value under the needle. */
  emptyText?: string;
};

export function Ruler(props: Props) {
  const { min, max, label, unit, testId } = props;
  const pps = props.pxPerStep ?? 12;
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef(props);
  live.current = props;
  const s = useRef({
    pos: props.value,
    vel: 0,
    drag: false,
    lastX: 0,
    lastT: 0,
    moved: 0,
    emitted: props.value,
    raf: 0,
    w: 320,
    h: 56,
  });

  function draw() {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const { w, h } = s.current;
    const p = live.current;
    // Ticks always sit on the grid: while dragging the ruler hops tick to
    // tick (like a notched dial) instead of sliding between them, so the
    // tick under the needle is the selected value, never "somewhere between".
    const pos = Math.round(s.current.pos / p.step) * p.step;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const css = getComputedStyle(cv);
    // Minimal scale (2026-11-24): one hairline baseline, ticks only where
    // they carry information (labelled majors, a quiet mid tick, step
    // hairlines only when there is room), and one slim accent needle. The
    // CSS mask on the canvas fades both ends so it reads as a continuous
    // scale. Labels are text (4.5:1, text-secondary); hairlines are
    // non-text marks on --chart-tick.
    const hair = css.getPropertyValue("--chart-tick").trim();
    const ink = css.getPropertyValue("--color-text-secondary").trim();
    const accent = css.getPropertyValue("--color-accent-mark").trim();
    const base = h - 6;
    const majorH = Math.round(h * 0.3);
    const midH = Math.round(h * 0.18);
    const minorH = Math.round(h * 0.1);
    // Thin the scale out so marks never crowd: step hairlines only with
    // 14px+ between them, a mid tick only with 28px+.
    const showMinor = pps >= 14;
    const showMid = p.midEvery != null && p.midEvery * pps >= 28;
    const half = Math.ceil(w / 2 / pps) + 2;
    const centre = Math.round(pos / p.step);
    ctx.lineCap = "butt";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.font = "500 11px Geologica, system-ui, sans-serif";
    // Baseline.
    const x0 = Math.max(0, w / 2 + ((p.min - pos) / p.step) * pps);
    const x1 = Math.min(w, w / 2 + ((p.max - pos) / p.step) * pps);
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = hair;
    ctx.fillRect(x0, base, x1 - x0, 1);
    ctx.globalAlpha = 1;
    for (let k = centre - half; k <= centre + half; k++) {
      const val = k * p.step;
      if (val < p.min - 1e-9 || val > p.max + 1e-9) continue;
      const x = Math.round(w / 2 + ((val - pos) / p.step) * pps);
      const isMajor = isMajorTick(k, p.majorEvery);
      const isMid = !isMajor && showMid && isMajorTick(k, p.midEvery as number);
      if (!isMajor && !isMid && !showMinor) continue;
      const th = isMajor ? majorH : isMid ? midH : minorH;
      ctx.fillStyle = isMajor ? ink : hair;
      ctx.globalAlpha = isMajor ? 0.55 : isMid ? 0.6 : 0.3;
      ctx.fillRect(x, base - th, 1, th);
      if (isMajor) {
        // The readout already shows the value under the needle, so the
        // label there fades out instead of colliding with the needle.
        const near = Math.abs(x - w / 2);
        const a = Math.min(1, Math.max(0, (near - 10) / 14));
        if (a > 0) {
          ctx.globalAlpha = a;
          ctx.fillStyle = ink;
          const v = Math.round(val * 100) / 100;
          ctx.fillText(
            p.format ? p.format(v) : String(v),
            x + 0.5,
            base - majorH - 6,
          );
        }
      }
      ctx.globalAlpha = 1;
    }
    if (p.ghost != null) {
      const gx = w / 2 + ((p.ghost - pos) / p.step) * pps;
      if (gx > 6 && gx < w - 6) {
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(gx, base + 0.5, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    // Needle: one 1px accent line with a small dot cap.
    const nx = Math.round(w / 2);
    ctx.fillStyle = accent;
    ctx.fillRect(nx, 6, 1, base - 6 + 1);
    ctx.beginPath();
    ctx.arc(nx + 0.5, 5, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  function emit(raw: number) {
    const p = live.current;
    const snapped = snapToStep(raw, p.step, p.min, p.max);
    if (snapped !== s.current.emitted) {
      s.current.emitted = snapped;
      buzz();
      p.onChange(snapped);
    }
  }

  function setPos(next: number) {
    const p = live.current;
    s.current.pos = Math.min(p.max, Math.max(p.min, next));
    emit(s.current.pos);
    draw();
  }

  function settle() {
    const st = s.current;
    const p = live.current;
    cancelAnimationFrame(st.raf);
    const frame = () => {
      if (st.drag) return;
      if (Math.abs(st.vel) > 0.02 && !REDUCED()) {
        setPos(st.pos + ((st.vel * 16) / pps) * p.step);
        st.vel *= 0.9;
        if (st.pos <= p.min || st.pos >= p.max) st.vel = 0;
        st.raf = requestAnimationFrame(frame);
        return;
      }
      const target = snapToStep(st.pos, p.step, p.min, p.max);
      const d = target - st.pos;
      if (Math.abs(d) > p.step * 0.01 && !REDUCED()) {
        setPos(st.pos + d * 0.25);
        st.raf = requestAnimationFrame(frame);
        return;
      }
      st.pos = target;
      emit(target);
      draw();
    };
    st.raf = requestAnimationFrame(frame);
  }

  // Keep canvas pixel size in step with layout; redraw on theme changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: draw reads refs only
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const measure = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = cv.clientWidth || 320;
      const h = cv.clientHeight || 56;
      s.current.w = w;
      s.current.h = h;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      draw();
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(cv);
    const mo = new MutationObserver(draw);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-mode", "data-theme", "class"],
    });
    return () => {
      ro.disconnect();
      mo.disconnect();
      cancelAnimationFrame(s.current.raf);
    };
  }, []);

  // External value changes (typing, reset, other field) move the ruler.
  // biome-ignore lint/correctness/useExhaustiveDependencies: draw reads refs only
  useEffect(() => {
    const st = s.current;
    if (st.drag) return;
    if (props.value !== st.emitted) {
      cancelAnimationFrame(st.raf);
      st.vel = 0;
      st.pos = props.value;
      st.emitted = props.value;
    }
    draw();
  }, [props.value, props.min, props.max, props.step, props.ghost]);

  function nudge(steps: number) {
    const p = live.current;
    const base = snapToStep(s.current.pos, p.step, p.min, p.max);
    const next = snapToStep(base + steps * p.step, p.step, p.min, p.max);
    s.current.pos = next;
    emit(next);
    draw();
  }

  const rounded = Math.round(props.value * 100) / 100;
  const shown =
    props.emptyText ?? (props.format ? props.format(rounded) : rounded);
  const jumpBy = (dir: 1 | -1) => {
    const p = live.current;
    const next = snapToStep(
      s.current.emitted + dir * (p.jump ?? p.step),
      p.step,
      p.min,
      p.max,
    );
    cancelAnimationFrame(s.current.raf);
    s.current.vel = 0;
    s.current.pos = next;
    p.onStart?.();
    emit(next);
    draw();
  };
  const jumpBtn =
    "num flex h-11 min-w-11 shrink-0 items-center justify-center rounded-sm bg-secondary px-2 text-sm font-bold text-ink transition-colors duration-100 hover:bg-active";
  return (
    <div className="flex flex-col" data-testid={`${testId}-wrap`}>
      {props.readout !== false && (
        <div
          className="num flex items-baseline justify-center gap-1.5 pt-1 pb-0.5 leading-none"
          aria-hidden="true"
          data-testid={`${testId}-readout`}
        >
          <span
            className={cn(
              "text-[clamp(22px,3.4dvh,28px)] font-semibold tracking-tight",
              props.emptyText != null ? "text-soft" : "text-ink",
            )}
          >
            {shown}
          </span>
          {unit && (
            <span className="text-xs font-medium text-soft">{unit}</span>
          )}
        </div>
      )}
      <div className="flex items-center gap-1">
        {props.jump != null && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => jumpBy(-1)}
            className={jumpBtn}
            aria-label={`${label} minus ${props.jump}`}
            data-testid={`${testId}-minus`}
          >
            −{props.jump}
          </button>
        )}
        <div className="min-w-0 flex-1">
          <canvas
            ref={ref}
            role="slider"
            tabIndex={0}
            aria-label={label}
            aria-orientation="horizontal"
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={props.value}
            aria-valuetext={`${shown}${unit ? ` ${unit}` : ""}`}
            data-testid={testId}
            data-ruler=""
            className={cn(
              "block h-[clamp(40px,6.4dvh,56px)] w-full cursor-ew-resize rounded-sm outline-offset-2 select-none",
            )}
            style={{
              touchAction: "pan-y",
              WebkitMaskImage:
                "linear-gradient(90deg, transparent, #000 20%, #000 80%, transparent)",
              maskImage:
                "linear-gradient(90deg, transparent, #000 20%, #000 80%, transparent)",
            }}
            onKeyDown={(e) => {
              const k = e.key;
              if (k === "ArrowRight" || k === "ArrowUp") nudge(1);
              else if (k === "ArrowLeft" || k === "ArrowDown") nudge(-1);
              else if (k === "PageUp") nudge(10);
              else if (k === "PageDown") nudge(-10);
              else return;
              e.preventDefault();
            }}
            onPointerDown={(e) => {
              const st = s.current;
              cancelAnimationFrame(st.raf);
              st.drag = true;
              st.vel = 0;
              st.moved = 0;
              st.lastX = e.clientX;
              st.lastT = performance.now();
              e.currentTarget.setPointerCapture(e.pointerId);
              live.current.onStart?.();
            }}
            onPointerMove={(e) => {
              const st = s.current;
              if (!st.drag) return;
              const now = performance.now();
              const dx = e.clientX - st.lastX;
              if (st.moved < 4 && Math.abs(dx) < 4) return;
              const dt = Math.max(1, now - st.lastT);
              st.moved += Math.abs(dx);
              setPos(st.pos - (dx / pps) * live.current.step);
              st.vel = st.vel * 0.6 + (-dx / dt) * 0.4;
              st.lastX = e.clientX;
              st.lastT = now;
            }}
            onPointerUp={() => {
              const st = s.current;
              if (!st.drag) return;
              st.drag = false;
              if (st.moved < 4) {
                st.pos = st.emitted;
                draw();
                if (live.current.emptyText != null)
                  live.current.onChange(st.emitted);
                return;
              }
              if (performance.now() - st.lastT > 80) st.vel = 0;
              settle();
            }}
            onPointerCancel={() => {
              const st = s.current;
              st.drag = false;
              if (st.moved < 4) {
                st.pos = st.emitted;
                draw();
                return;
              }
              settle();
            }}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
          />
        </div>
        {props.jump != null && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => jumpBy(1)}
            className={jumpBtn}
            aria-label={`${label} plus ${props.jump}`}
            data-testid={`${testId}-plus`}
          >
            +{props.jump}
          </button>
        )}
      </div>
    </div>
  );
}
