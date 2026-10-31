import { useEffect, useRef, useState } from "react";
import { Eyebrow, Gap, Pill } from "./ui";
import "./Demo.css";

/** What the demo "hears". Long on purpose — the point is that saha takes a
 *  whole spoken sentence rather than a keyword. */
const PHRASE = "anything on tonight under ₹500, nothing too loud";

const SOURCES = [
  "BookMyShow",
  "District",
  "RA",
  "Meetup",
  "Luma",
  "Insider",
  "Time Out",
  "Zomato",
  "Eventbrite",
  "Skiddle",
];

const RESULTS = [
  { id: "a", title: "Dub and ambient on vinyl", place: "Hauz Khas", when: "9:00 PM", price: "Free entry" },
  { id: "b", title: "Qawwali in the courtyard", place: "Nizamuddin", when: "8:30 PM", price: "Free entry" },
  { id: "c", title: "Listening room, side B", place: "Shahpur Jat", when: "9:30 PM", price: "₹300" },
];

const STAGES = [
  { key: "say", label: "You say it", note: "One ordinary sentence, spoken. No filters, no keywords." },
  { key: "sweep", label: "Saha sweeps", note: "A thousand wired sources, read live as you wait." },
  { key: "narrow", label: "It narrows", note: "Everything on tonight, cut to the three that actually fit." },
  { key: "see", label: "You see the detail", note: "Everything the source published — and, plainly, what it left out." },
] as const;

const DURATIONS = [3400, 2600, 2400, 3200];
const TYPE_MS = 44;

const prefersReduced = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function Demo() {
  /* Whether to animate is knowable at first render, so it initialises state
     rather than being applied by an effect after the fact. Reduced motion
     lands straight on the final stage with the sentence already in. */
  const [reduced] = useState(prefersReduced);
  const [stage, setStage] = useState(reduced ? STAGES.length - 1 : 0);
  const [typed, setTyped] = useState(reduced ? PHRASE : "");
  const [playing, setPlaying] = useState(false);
  const [done, setDone] = useState(reduced);
  const root = useRef<HTMLDivElement>(null);

  /* Start only once the demo is actually on screen — an animation nobody can
     see is just battery. */
  useEffect(() => {
    const el = root.current;
    if (!el || reduced || playing || done) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setPlaying(true);
          io.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [playing, done, reduced]);

  /* Stage clock. */
  useEffect(() => {
    if (!playing) return;
    if (stage >= STAGES.length - 1) {
      const t = setTimeout(() => {
        setPlaying(false);
        setDone(true);
      }, DURATIONS[stage]);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setStage((s) => s + 1), DURATIONS[stage]);
    return () => clearTimeout(t);
  }, [playing, stage]);

  /* Typewriter, standing in for dictation arriving. */
  useEffect(() => {
    if (!playing || stage !== 0) return;
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setTyped(PHRASE.slice(0, i));
      if (i >= PHRASE.length) clearInterval(id);
    }, TYPE_MS);
    return () => clearInterval(id);
  }, [playing, stage]);

  const replay = () => {
    setStage(0);
    setTyped("");
    setDone(false);
    setPlaying(true);
  };

  const goTo = (i: number) => {
    setPlaying(false);
    setDone(true);
    setStage(i);
    setTyped(PHRASE);
  };

  return (
    <div className="demo" ref={root}>
      <header className="demo__head">
        <Eyebrow>See it work</Eyebrow>
        <h2 className="demo__title">Four seconds, spoken to placed.</h2>
        <p className="demo__sub lede">
          No sign-up, no form. This is the whole product — watch it, or click a step to jump.
        </p>
      </header>

      <div className="demo__body">
        {/* ── Narration rail ─────────────────────────────────────────── */}
        <ol className="rail">
          {STAGES.map((s, i) => (
            <li key={s.key} className={i === stage ? "rail__item rail__item--on" : "rail__item"}>
              <button type="button" className="rail__btn" onClick={() => goTo(i)}>
                <span className="rail__n">{String(i + 1).padStart(2, "0")}</span>
                <span className="rail__text">
                  <span className="rail__label">{s.label}</span>
                  <span className="rail__note">{s.note}</span>
                </span>
              </button>
              {i === stage && playing ? (
                <span
                  className="rail__tick"
                  style={{ animationDuration: `${DURATIONS[i]}ms` }}
                  aria-hidden="true"
                />
              ) : null}
            </li>
          ))}
        </ol>

        {/* ── Screen ─────────────────────────────────────────────────────
            Fixed height, so advancing a stage never shifts the page. */}
        <div className="screen" aria-live="polite">
          <div className="screen__bar">
            <span className="screen__dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span className="screen__url">saha.app · Delhi NCR</span>
          </div>

          <div className="screen__stage">
            {stage === 0 ? (
              <div className="say">
                <span className="say__mic" aria-hidden="true" />
                <p className="say__text">
                  {typed}
                  <span className="say__caret" aria-hidden="true" />
                </p>
                <p className="say__hint">Dictated with Flow — not typed</p>
              </div>
            ) : null}

            {stage === 1 ? (
              <div className="sweep">
                <div className="sweep__chips">
                  {SOURCES.map((s, i) => (
                    <span
                      key={s}
                      className="sweep__chip"
                      style={{ animationDelay: `${i * 90}ms` }}
                    >
                      {s}
                    </span>
                  ))}
                </div>
                <p className="sweep__count">
                  <strong>1,007</strong> sources read · <strong>184</strong> listings on tonight
                </p>
              </div>
            ) : null}

            {stage === 2 ? (
              <ul className="narrow">
                {RESULTS.map((r, i) => (
                  <li key={r.id} className="narrow__row" style={{ animationDelay: `${i * 140}ms` }}>
                    <span className="narrow__when">{r.when}</span>
                    <span className="narrow__body">
                      <span className="narrow__title">{r.title}</span>
                      <span className="narrow__place">{r.place}</span>
                    </span>
                    <span className="narrow__price">{r.price}</span>
                  </li>
                ))}
              </ul>
            ) : null}

            {stage === 3 ? (
              <div className="sit">
                <div className="sit__card">
                  <div className="sit__top">
                    <span className="sit__when">Fri 6 Nov · 21:00</span>
                    <Pill dot tone="jade">
                      Free entry
                    </Pill>
                  </div>
                  <p className="sit__title">Dub and ambient on vinyl</p>
                  <p className="sit__place">Summer House Cafe, Hauz Khas, New Delhi</p>
                  <Gap>End time not published by the source.</Gap>
                  <div className="sit__foot">
                    <span className="sit__src">via Resident Advisor</span>
                    <span className="sit__open">Open listing ↗</span>
                  </div>
                </div>
                <p className="sit__note">
                  saha displays listings. It does not host events or take bookings.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <footer className="demo__foot">
        <div className="demo__pips" role="tablist" aria-label="Demo steps">
          {STAGES.map((s, i) => (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={i === stage}
              aria-label={s.label}
              className={i === stage ? "pip pip--on" : "pip"}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
        {done ? (
          <button type="button" className="demo__replay" onClick={replay}>
            Replay
          </button>
        ) : null}
      </footer>
    </div>
  );
}
