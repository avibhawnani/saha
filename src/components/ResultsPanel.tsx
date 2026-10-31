import type { SahaEvent } from "../data/events";
import { isOn } from "../data/events";
import { isPinnable, offMapReason } from "../lib/coords";
import "./ResultsPanel.css";

interface ResultsPanelProps {
  /** Everything the current query or filter matched, already sorted. */
  events: SahaEvent[];
  /** The spoken sentence, when there was one. */
  queryText: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function whenShort(e: SahaEvent, today: string): string {
  if (isOn(e, today)) return e.startTime ? `On now · ${e.startTime}` : "On now";
  const d = new Date(`${e.startDate}T00:00:00`).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  return e.startTime ? `${d} · ${e.startTime}` : d;
}

function where(e: SahaEvent): string {
  if (e.placement === "remote") return "Online";
  return e.venue.area ?? e.venue.city ?? e.venue.name ?? e.venueRaw;
}

/**
 * The map's right-hand rail: every match, pinned or not.
 *
 * Listing the unpinnable ones is the point. A third of any real listing set
 * resolves only to a city or has no venue at all, and a map that silently
 * drops them is worse than one that says why they are missing.
 */
export function ResultsPanel({
  events,
  queryText,
  selectedId,
  onSelect,
  today,
}: ResultsPanelProps & { today: string }) {
  const pinnedCount = events.filter((e) => isPinnable(e.id)).length;

  return (
    <div className="results">
      <header className="results__head">
        <p className="results__count">
          {events.length} {events.length === 1 ? "match" : "matches"}
        </p>
        <p className="results__sub label">
          {pinnedCount} on the map · {events.length - pinnedCount} not placeable
        </p>
        {queryText ? <p className="results__query">for “{queryText}”</p> : null}
      </header>

      {events.length === 0 ? (
        <p className="results__empty">
          Nothing in this window matches. Try fewer words, or clear the search.
        </p>
      ) : (
        <ul className="results__list">
          {events.map((e) => {
            const reason = offMapReason(e);
            return (
              <li key={e.id}>
                <button
                  type="button"
                  className={
                    e.id === selectedId ? "result result--on" : "result"
                  }
                  onClick={() => onSelect(e.id)}
                  aria-current={e.id === selectedId ? "true" : undefined}
                >
                  <span className="result__when">{whenShort(e, today)}</span>
                  <span className="result__title">{e.title}</span>
                  <span className="result__meta">
                    <span className="result__cat">{e.category}</span>
                    <span className="result__where">{where(e)}</span>
                    {e.price.free ? <span className="result__free">Free</span> : null}
                  </span>
                  {reason ? <span className="result__why">Not on the map — {reason}</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
