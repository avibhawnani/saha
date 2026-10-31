import { useState } from "react";
import "./AskBar.css";

/** A single input event adding this many characters is dictation or a paste,
 *  not typing. Used only to acknowledge the voice. */
const BURST_CHARS = 25;

/** The nav's search action focuses this field, so the id is shared. */
export const ASK_FIELD_ID = "saha-ask";

interface AskBarProps {
  onAsk?: (utterance: string) => void;
}

/**
 * SAHA's front door, built for a spoken sentence rather than keywords.
 *
 * Desktop dictation runs at OS level, so a page cannot detect it directly — a
 * dictated sentence arrives looking exactly like a paste. We lean into that:
 * the field takes long natural language, keeps autocorrect out of the way, and
 * acknowledges a burst insert so talking to it feels answered.
 */
export function AskBar({ onAsk }: AskBarProps) {
  const [value, setValue] = useState("");
  const [heard, setHeard] = useState(false);

  const submit = () => {
    if (value.trim()) onAsk?.(value.trim());
  };

  return (
    <form
      className={heard ? "ask ask--heard" : "ask"}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="ask__head">
        <span className="ask__mic" aria-hidden="true">
          <svg viewBox="0 0 16 16" width="13" height="13">
            <path
              d="M8 1.75a2 2 0 0 1 2 2v4a2 2 0 0 1-4 0v-4a2 2 0 0 1 2-2Z"
              fill="currentColor"
            />
            <path
              d="M3.75 7.25a4.25 4.25 0 0 0 8.5 0M8 11.5v2.75"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        </span>
        <span className="ask__state">{heard ? "Heard you" : "Say it however you'd say it"}</span>
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
        placeholder="anything on tonight under ₹500, nothing too loud…"
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        aria-label="Describe what you feel like doing"
        onChange={(e) => {
          if (e.target.value.length - value.length > BURST_CHARS) setHeard(true);
          setValue(e.target.value);
          e.target.style.height = "auto";
          e.target.style.height = `${Math.min(e.target.scrollHeight, 176)}px`;
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
      />

      <div className="ask__foot">
        <p className="ask__hint">
          Hold your dictation key, or press <kbd className="ask__kbd">Return</kbd>
        </p>
        <button type="submit" className="ask__go" disabled={!value.trim()}>
          Search
        </button>
      </div>
    </form>
  );
}
