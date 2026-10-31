import { useEffect, useRef, useState } from "react";
import { AnakinError, search, type SearchResult } from "../lib/anakin";
import { coordsFor } from "../lib/coords";
import type { SahaEvent } from "../data/events";
import { Button, Gap, KeyLine, Price, When } from "./ui";
import "./EventDetail.css";

type WebState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "done"; results: SearchResult[] }
  | { kind: "error"; message: string; needsKey: boolean };

/** What a pin's position actually means, stated rather than implied. */
const PRECISION_NOTE: Record<string, string> = {
  venue: "Pin is on the named venue.",
  area: "Pin is the locality centre — the source did not publish a precise address.",
  city: "Not pinned: the source published the city only.",
};

interface EventDetailProps {
  event: SahaEvent;
  today: string;
  onClose: () => void;
}

export function EventDetail({ event, today, onClose }: EventDetailProps) {
  const [web, setWeb] = useState<WebState>({ kind: "idle" });
  const abort = useRef<AbortController | null>(null);

  /* The parent keys this component on the event id, so a new selection mounts
     a fresh panel and the state resets without an effect. This only has to
     drop a request still in flight when the panel goes away. */
  useEffect(() => {
    const ctrl = abort;
    return () => ctrl.current?.abort();
  }, []);

  const c = coordsFor(event.id);

  const ask = async () => {
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setWeb({ kind: "loading" });

    const where = [event.venue.name, event.venue.area, event.venue.city]
      .filter(Boolean)
      .join(", ");
    try {
      const results = await search(
        `${event.title} ${where} ${event.startDate} — timings, tickets, what to expect`,
        6,
        ctrl.signal,
      );
      setWeb({ kind: "done", results });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      const e = err as AnakinError;
      setWeb({
        kind: "error",
        message: e.message ?? "Something went wrong.",
        needsKey: e.needsKey ?? false,
      });
    }
  };

  return (
    <aside className="detail" aria-label={`Details for ${event.title}`}>
      <header className="detail__head">
        <span className="detail__cat">{event.category}</span>
        <button type="button" className="detail__close" onClick={onClose}>
          <span className="sr">Close details</span>
          <span aria-hidden="true">×</span>
        </button>
      </header>

      <h3 className="detail__title">{event.title}</h3>
      <When
        startDate={event.startDate}
        endDate={event.endDate}
        startTime={event.startTime}
        today={today}
      />

      <p className="detail__desc">{event.description}</p>

      <div className="detail__facts">
        <KeyLine k="Venue" v={event.venueRaw} />
        <KeyLine k="Schedule" v={event.schedule} />
        <KeyLine k="Organizer" v={event.organizer} />
        <KeyLine k="Entry" v={event.price.raw} />
        <KeyLine k="Source" v={event.linkType} />
      </div>

      <p className="detail__precision">
        {c ? PRECISION_NOTE[c.precision] : "Not pinned — no location to place."}
        {c ? <span className="detail__matched"> Matched: {c.matched}</span> : null}
      </p>

      {event.dataGaps ? <Gap>{event.dataGaps}</Gap> : null}

      <div className="detail__actions">
        <Price free={event.price.free} fromINR={event.price.fromINR} raw={event.price.raw} />
        {event.link ? (
          <a className="detail__link" href={event.link} target="_blank" rel="noreferrer noopener">
            Open listing ↗
          </a>
        ) : (
          <span className="detail__nolink">No official page found</span>
        )}
      </div>

      {/* ── Ask the web ──────────────────────────────────────────────────
          Anakin's synchronous /search, so the answer arrives in seconds. It
          fills the gaps the listing left rather than replacing it. */}
      <section className="web">
        <div className="web__head">
          <p className="web__title">Ask the web about this</p>
          {web.kind === "idle" ? (
            <Button tone="secondary" onClick={ask}>
              Look it up
            </Button>
          ) : null}
        </div>

        {web.kind === "idle" ? (
          <p className="web__hint">
            Searches live pages for timings, tickets and reviews the listing did not carry.
          </p>
        ) : null}

        {web.kind === "loading" ? <p className="web__hint">Searching live sources…</p> : null}

        {web.kind === "error" ? (
          <div className="web__error">
            <p>{web.message}</p>
            {web.needsKey ? (
              <p className="web__hint">
                Add a free key from anakin.io to <code>.env</code> as{" "}
                <code>ANAKIN_API_KEY</code>, then restart the dev server.
              </p>
            ) : (
              <Button tone="secondary" onClick={ask}>
                Try again
              </Button>
            )}
          </div>
        ) : null}

        {web.kind === "done" ? (
          web.results.length === 0 ? (
            <p className="web__hint">No live pages found for this one.</p>
          ) : (
            <ul className="web__list">
              {web.results.map((r) => (
                <li key={r.url}>
                  <a
                    className="web__item"
                    href={r.url}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    <span className="web__item-title">{r.title}</span>
                    <span className="web__item-snippet">{r.snippet}</span>
                    <span className="web__item-host">
                      {new URL(r.url).hostname.replace(/^www\./, "")}
                      {r.date ? ` · ${r.date}` : ""}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </section>
    </aside>
  );
}
