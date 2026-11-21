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
  onChange: (v: number) => void;
  onStart?: () => void;
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
    const { w, h, pos } = s.current;
    const p = live.current;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const css = getComputedStyle(cv);
    // Labels are 12px text (4.5:1), so step 11 like the major ticks; minor
    // ticks are non-text marks (3:1) on step 10. Step 9 (disabled) failed
    // both on the tinted well.
    const minor = css.getPropertyValue("--chart-tick").trim();
    const major = css.getPropertyValue("--color-text-secondary").trim();
    const faintInk = major;
    const accent = css.getPropertyValue("--color-accent-mark").trim();
    const half = Math.ceil(w / 2 / pps) + 2;
    const centre = Math.round(pos / p.step);
    ctx.lineCap = "round";
    ctx.textAlign = "center";
    ctx.font = "600 12px Geologica, system-ui, sans-serif";
    for (let k = centre - half; k <= centre + half; k++) {
      const val = k * p.step;
      if (val < p.min - 1e-9 || val > p.max + 1e-9) continue;
      const x = w / 2 + ((val - pos) / p.step) * pps;
      const isMajor = isMajorTick(k, p.majorEvery);
      const isMid =
        !isMajor && p.midEvery != null && isMajorTick(k, p.midEvery);
      const th = isMajor ? h * 0.7 : isMid ? h * 0.5 : h * 0.3;
      const d = Math.min(1, Math.abs(x - w / 2) / (w / 2));
      // Full strength across the middle 70%, so every tick and label a thumb
      // can reach reads at its token contrast; only the outer edges fade.
      const fade = Math.max(0, (d - 0.7) / 0.3);
      ctx.globalAlpha = Math.max(0.1, 1 - fade * fade * 0.9);
      ctx.strokeStyle = isMajor || isMid ? major : minor;
      ctx.lineWidth = isMajor ? 2 : isMid ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.lineTo(x, h - th);
      ctx.stroke();
      if (isMajor) {
        ctx.fillStyle = faintInk;
        ctx.fillText(String(Math.round(val * 100) / 100), x, h - th - 6);
      }
      ctx.globalAlpha = 1;
    }
    if (p.ghost != null) {
      const gx = w / 2 + ((p.ghost - pos) / p.step) * pps;
      if (gx > 6 && gx < w - 6) {
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(gx, h - 4, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Needle + pointer.
    ctx.strokeStyle = accent;
    ctx.fillStyle = accent;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(w / 2, 10);
    ctx.lineTo(w / 2, h - 4);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w / 2 - 6, 0);
    ctx.lineTo(w / 2 + 6, 0);
    ctx.lineTo(w / 2, 8);
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

  return (
    <canvas
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-orientation="horizontal"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={props.value}
      aria-valuetext={`${props.value}${unit ? ` ${unit}` : ""}`}
      data-testid={testId}
      className={cn(
        "block h-[clamp(40px,6.4dvh,56px)] w-full cursor-ew-resize rounded-sm outline-offset-2 select-none",
      )}
      style={{
        touchAction: "pan-y",
        WebkitMaskImage:
          "linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)",
        maskImage:
          "linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)",
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
  );
}
