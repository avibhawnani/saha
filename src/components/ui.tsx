import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import "./ui.css";

/* ── Button ────────────────────────────────────────────────────────────────
   primary   — saffron fill, ink text. One per view.
   secondary — surface with a hairline. The safe default.
   ghost     — text only until hovered.
   inverse   — for use on the plum footer. */

type Tone = "primary" | "secondary" | "ghost" | "inverse";
type Size = "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: Tone;
  size?: Size;
  children: ReactNode;
}

export function Button({ tone = "primary", size = "md", children, ...rest }: ButtonProps) {
  return (
    <button className={`btn btn--${tone} btn--${size}`} {...rest}>
      {children}
    </button>
  );
}

/* ── Pill ──────────────────────────────────────────────────────────────────
   A status badge. `dot` adds the pulsing jade marker for anything live. */

interface PillProps {
  children: ReactNode;
  dot?: boolean;
  tone?: "neutral" | "jade" | "saffron";
}

export function Pill({ children, dot = false, tone = "neutral" }: PillProps) {
  return (
    <span className={`pill pill--${tone}`}>
      {dot ? <span className="pill__dot" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

/* ── Chip ──────────────────────────────────────────────────────────────────*/

interface ChipProps {
  children: ReactNode;
  selected?: boolean;
  onClick?: () => void;
}

export function Chip({ children, selected = false, onClick }: ChipProps) {
  return (
    <button
      type="button"
      className={selected ? "chip chip--on" : "chip"}
      aria-pressed={selected}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/* ── Panel ─────────────────────────────────────────────────────────────────*/

interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** Lifts on hover — only for panels that are actually clickable. */
  interactive?: boolean;
}

export function Panel({ children, interactive = false, className, ...rest }: PanelProps) {
  return (
    <div
      className={["panel", interactive && "panel--interactive", className].filter(Boolean).join(" ")}
      {...rest}
    >
      {children}
    </div>
  );
}

/* ── Eyebrow ───────────────────────────────────────────────────────────────*/

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="eyebrow label">
      <span className="eyebrow__dot" aria-hidden="true" />
      {children}
    </p>
  );
}

/* ── Price ─────────────────────────────────────────────────────────────────
   Free entry is the one price worth colouring, because it is the thing people
   actually scan for. Everything else is shown as published — including
   "Not stated", which is information rather than an absence. */

export function Price({ free, fromINR, raw }: { free: boolean; fromINR: number | null; raw: string }) {
  if (free) return <span className="price price--free">Free entry</span>;
  if (fromINR !== null) {
    return <span className="price">From ₹{fromINR.toLocaleString("en-IN")}</span>;
  }
  return (
    <span className="price price--unknown" title={raw}>
      Price not stated
    </span>
  );
}

/* ── When ──────────────────────────────────────────────────────────────────
   Dates are spans here, not instants, and a start time is often genuinely not
   published. Rather than inventing one, the component says so. */

export function When({
  startDate,
  endDate,
  startTime,
  today,
}: {
  startDate: string;
  endDate: string;
  startTime: string | null;
  today: string;
}) {
  const on = startDate <= today && today <= endDate;
  const span = startDate !== endDate;
  const day = new Date(`${startDate}T00:00:00`).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  return (
    <span className="when">
      {on ? <span className="when__now">On now</span> : null}
      <span className="when__day">{day}</span>
      {span ? <span className="when__span">to {new Date(`${endDate}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span> : null}
      <span className={startTime ? "when__time" : "when__time when__time--none"}>
        {startTime ?? "time not published"}
      </span>
    </span>
  );
}

/* ── Gap ───────────────────────────────────────────────────────────────────
   The dataset records what it could not confirm. Showing that is a feature:
   it is the difference between a listing and a guess. */

export function Gap({ children }: { children: ReactNode }) {
  return (
    <p className="gap">
      <span className="gap__mark" aria-hidden="true">
        ?
      </span>
      {children}
    </p>
  );
}

/* ── KeyLine ───────────────────────────────────────────────────────────────
   A labelled fact. A null is rendered as "not published" rather than dropped,
   because an absent field is itself information about the source. */

export function KeyLine({ k, v }: { k: string; v: string | null }) {
  return (
    <div className="keyline">
      <dt className="keyline__k">{k}</dt>
      <dd className={v ? "keyline__v" : "keyline__v keyline__v--none"}>{v ?? "not published"}</dd>
    </div>
  );
}

/* ── Stat ──────────────────────────────────────────────────────────────────*/

export function Stat({ value, caption }: { value: string; caption: string }) {
  return (
    <div className="stat">
      <p className="stat__value">{value}</p>
      <p className="stat__caption">{caption}</p>
    </div>
  );
}
