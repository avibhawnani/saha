import { useEffect, useRef, useState } from "react";
import "./AskBar.css";

/** A single input event adding this many characters is dictation or a paste,
 *  not typing. Used only to acknowledge the voice. */
const BURST_CHARS = 25;

/** The nav's search action focuses this field, so the id is shared. */
export const ASK_FIELD_ID = "saha-ask";

/** Quiet period before a search fires. Long enough that a dictated sentence
 *  lands as one query rather than one per word. */
const DEBOUNCE_MS = 400;

/** Below this, a query is too vague to be worth running. */
const MIN_CHARS = 3;

interface AskBarProps {
  onAsk?: (utterance: string) => void;
  onClear?: () => void;
  /** Result count for the live readout, or null when nothing has run. */
  resultCount?: number | null;
}

/**
 * Saha's front door, built for a spoken sentence rather than keywords.
 *
 * Desktop dictation runs at OS level, so a page cannot detect it directly — a
 * dictated sentence arrives looking exactly like a paste. Three consequences
 * shape this component:
 *
 *  1. It focuses itself on mount. Dictation goes to whatever has focus, so an
 *     unfocused field means holding the hotkey and watching nothing happen.
 *  2. It searches as the text arrives, debounced. There is no submit button to
 *     reach for, because reaching for a button defeats talking to it.
 *  3. It keeps autocorrect out of the way and acknowledges a burst insert.
 */
export function AskBar({ onAsk, onClear, resultCount }: AskBarProps) {
  const [value, setValue] = useState("");
  const [heard, setHeard] = useState(false);
  const [pending, setPending] = useState(false);
  const timer = useRef<number | null>(null);
  /* Refs keep the debounce callback off the effect's dependency list, so a new
     handler identity each render cannot cancel an in-flight search. */
  const ask = useRef(onAsk);
  const clear = useRef(onClear);

  useEffect(() => {
    ask.current = onAsk;
    clear.current = onClear;
  }, [onAsk, onClear]);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  const schedule = (next: string) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    const text = next.trim();

    if (text.length < MIN_CHARS) {
      setPending(false);
      clear.current?.();
      return;
    }

    setPending(true);
    timer.current = window.setTimeout(() => {
      setPending(false);
      ask.current?.(text);
    }, DEBOUNCE_MS);
  };

  const runNow = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setPending(false);
    const text = value.trim();
    if (text.length >= MIN_CHARS) ask.current?.(text);
  };

  const reset = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setValue("");
    setHeard(false);
    setPending(false);
    clear.current?.();
    document.getElementById(ASK_FIELD_ID)?.focus();
  };

  const state = pending ? "Listening…" : heard ? "Heard you" : "Say it however you'd say it";

  return (
    <div className={heard ? "ask ask--heard" : "ask"}>
      <div className="ask__head">
        <span className="ask__mic" aria-hidden="true">
          <svg viewBox="0 0 16 16" width="13" height="13">
            <path d="M8 1.75a2 2 0 0 1 2 2v4a2 2 0 0 1-4 0v-4a2 2 0 0 1 2-2Z" fill="currentColor" />
            <path
              d="M3.75 7.25a4.25 4.25 0 0 0 8.5 0M8 11.5v2.75"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        </span>
        <span className="ask__state">{state}</span>
        {/* Wispr Flow wordmark drops in here once we have the asset. */}
        <span className="ask__via" aria-hidden="true">
          Dictate with Flow
        </span>
      </div>

      <textarea
        id={ASK_FIELD_ID}
        className="ask__box"
        value={value}
        rows={2}
        /* Dictation needs a focused target, so the page hands it one. */
        autoFocus
        placeholder="anything on tonight under ₹500, nothing too loud…"
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        aria-label="Describe what you feel like doing"
        aria-describedby="ask-readout"
        onChange={(e) => {
          if (e.target.value.length - value.length > BURST_CHARS) setHeard(true);
          setValue(e.target.value);
          schedule(e.target.value);
          e.target.style.height = "auto";
          e.target.style.height = `${Math.min(e.target.scrollHeight, 176)}px`;
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            runNow();
          }
          if (e.key === "Escape") reset();
        }}
      />

      <div className="ask__foot">
        <p className="ask__hint" id="ask-readout" aria-live="polite">
          {resultCount === null || resultCount === undefined
            ? "Results update as you speak — no need to press anything"
            : `${resultCount} ${resultCount === 1 ? "event" : "events"} match`}
        </p>
        {value.length > 0 ? (
          <button type="button" className="ask__reset" onClick={reset}>
            Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}
