import { lazy, Suspense, useMemo, useState } from "react";
import { Navbar } from "./components/Navbar";
import { Footer } from "./components/Footer";
import { AskBar } from "./components/AskBar";
import { Tonight } from "./components/Tonight";
import { Demo } from "./components/Demo";
/* maplibre-gl is ~1 MB of the bundle on its own, and nobody needs it until
   the map section is reached — so it is split out and loaded on demand. */
const MapView = lazy(() => import("./components/MapView"));
import { EventDetail } from "./components/EventDetail";
import { ResultsPanel } from "./components/ResultsPanel";
import { MapBoundary } from "./components/MapBoundary";
import { Chip, Eyebrow, Pill, Stat } from "./components/ui";
import { CATEGORIES, DATASET, EVENTS, isOn, type SahaEvent } from "./data/events";
import { isPinnable } from "./lib/coords";
import { describe, parse, resolveQuery, type Query } from "./lib/ask";
import { todayISO } from "./lib/date";
import "./App.css";

/* Placeholder until the city list comes from the backend. It is on the first
   screen to say that the selected city scopes what is shown — it does not
   define the product. */
const CITIES = ["Delhi NCR", "Mumbai", "Bengaluru", "Hyderabad", "Pune", "Kolkata"];
const MORE_CITIES = 36;

const FILTERS = ["All", "On now", "Free", ...CATEGORIES];

export default function App() {
  const [filter, setFilter] = useState("All");
  const [city, setCity] = useState("Delhi NCR");
  const [query, setQuery] = useState<Query | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const today = todayISO();

  const { shown, dropped } = useMemo(() => {
    const byStartSoonest = (a: SahaEvent, b: SahaEvent) => {
      const on = Number(isOn(b, today)) - Number(isOn(a, today));
      return on !== 0 ? on : a.startDate.localeCompare(b.startDate);
    };

    if (query !== null) {
      /* resolveQuery already ranks by relevance; re-sorting by date here would
         throw that away and put a random event at the top of a search. */
      const r = resolveQuery(query, EVENTS, today);
      return { shown: r.events, dropped: r.dropped };
    }

    const chip = (e: SahaEvent) => {
      if (filter === "All") return true;
      if (filter === "On now") return isOn(e, today);
      if (filter === "Free") return e.price.free;
      return e.category === filter;
    };
    return { shown: EVENTS.filter(chip).sort(byStartSoonest), dropped: [] as string[] };
  }, [filter, query, today]);

  const pinned = shown.filter((e) => isPinnable(e.id));
  const selected = shown.find((e) => e.id === selectedId) ?? null;
  const understood = query ? describe(query) : [];

  /**
   * A spoken sentence replaces the chip filter rather than stacking with it —
   * two competing filters silently returning nothing is the worst outcome.
   *
   * Deliberately does NOT scroll. Search now runs while dictation is still
   * arriving, and moving the page mid-sentence pulls the field out from under
   * the speaker. The top match appears beside the field instead.
   */
  const onAsk = (utterance: string) => {
    /* First result of a session brings the map into view. Only the first:
       the field keeps running searches as more words arrive, and re-scrolling
       on every one would fight the speaker. Focus stays in the field, so
       dictation continues to land even once it is above the fold. */
    const firstOfSession = query === null;
    setQuery(parse(utterance, EVENTS));
    setFilter("All");
    setSelectedId(null);
    if (firstOfSession) {
      document.getElementById("map")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const clearQuery = () => {
    setQuery(null);
    setSelectedId(null);
  };

  return (
    <>
      <Navbar />

      <main id="main">
        {/* ── Hero ───────────────────────────────────────────────────────── */}
        <section className="hero" id="top">
          <div className="hero__aura" aria-hidden="true">
            <span className="hero__orb hero__orb--saffron" />
            <span className="hero__orb hero__orb--clay" />
            <span className="hero__orb hero__orb--jade" />
          </div>

          <div className="shell hero__grid">
            <div className="hero__copy">
              <Pill tone="saffron">सह · 42 cities</Pill>

              <h1 className="hero__title">
                Say what you feel like.
                <br />
                <em className="hero__title-em">See what is actually on.</em>
              </h1>

              <p className="hero__lede lede">
                Anywhere in India, describe the evening you want in one ordinary sentence. Saha
                listens to the whole thing and puts everything genuinely on tonight on a map — read
                live from public listings, with the gaps left visible.
              </p>

              <div className="hero__ask">
                <AskBar
                  onAsk={onAsk}
                  onClear={clearQuery}
                  resultCount={query === null ? null : shown.length}
                />
              </div>

              <div className="hero__cities">
                <span className="hero__cities-label label">Looking in</span>
                <div className="hero__cities-row">
                  {CITIES.map((c) => (
                    <Chip key={c} selected={city === c} onClick={() => setCity(c)}>
                      {c}
                    </Chip>
                  ))}
                  <button type="button" className="hero__cities-more">
                    +{MORE_CITIES} more
                  </button>
                </div>
              </div>

              <p className="hero__source">
                Reading <strong>1,007</strong> wired sources · this window covers{" "}
                <strong>{DATASET.window}</strong>
              </p>
            </div>

            <div className="hero__preview">
              <Tonight />
            </div>
          </div>
        </section>

        {/* ── Map ────────────────────────────────────────────────────────── */}
        <section className="band" id="map">
          <div className="shell">
            <header className="section section--stacked">
              <Eyebrow>{DATASET.region}</Eyebrow>
              <h2 className="section__title">Everything on in {city}, placed</h2>
              <p className="lede section__lede">
                A pin only appears where a venue actually resolved. Where the source published a
                locality or nothing at all, the event is listed beside the map rather than dropped
                on a guess.
              </p>
            </header>

            <div className="filters" role="group" aria-label="Filter events">
              {FILTERS.map((f) => (
                <Chip
                  key={f}
                  selected={filter === f && query === null}
                  onClick={() => {
                    setFilter(f);
                    setQuery(null);
                    setSelectedId(null);
                  }}
                >
                  {f}
                </Chip>
              ))}
              <span className="filters__count label">
                {shown.length} of {EVENTS.length}
              </span>
            </div>

            {query ? (
              <div className="heard">
                <span className="heard__label label">Heard</span>
                <p className="heard__text">“{query.text}”</p>
                <div className="heard__tags">
                  {understood.length > 0 ? (
                    understood.map((u) => (
                      <span key={u} className="heard__tag">
                        {u}
                      </span>
                    ))
                  ) : (
                    <span className="heard__tag heard__tag--none">no filters matched</span>
                  )}
                </div>
                {dropped.length > 0 ? (
                  <p className="heard__relaxed">
                    Nothing matched all of that, so {dropped.join(" and ")} was set aside.
                  </p>
                ) : null}
                <button type="button" className="heard__clear" onClick={clearQuery}>
                  Clear
                </button>
              </div>
            ) : null}

            <div className="mapgrid">
              {mapError ? (
                <p className="mapwarn" role="status">
                  The basemap reported a problem: <code>{mapError}</code> — pins are still placed
                  correctly.
                </p>
              ) : null}

              <MapBoundary>
                <Suspense fallback={<div className="maploading">Loading the map…</div>}>
                  <MapView
                    events={pinned}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    onError={setMapError}
                  />
                </Suspense>
              </MapBoundary>

              <div className="mapgrid__side">
                {selected ? (
                  <EventDetail
                    key={selected.id}
                    event={selected}
                    today={today}
                    onClose={() => setSelectedId(null)}
                  />
                ) : (
                  <ResultsPanel
                    events={shown}
                    queryText={query?.text ?? null}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    today={today}
                  />
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ── Demo ───────────────────────────────────────────────────────── */}
        <section className="band band--sunk" id="how">
          <div className="shell">
            <Demo />
          </div>
        </section>

        {/* ── Coverage ───────────────────────────────────────────────────── */}
        <section className="band band--tight" id="coverage">
          <div className="shell hosts">
            <div className="hosts__copy">
              <Eyebrow>Coverage</Eyebrow>
              <h2 className="section__title">Read from the open web, gaps and all.</h2>
              <p className="lede">
                Saha does not host events and does not take bookings. It reads public listing pages
                — ticketing sites, venue pages, community boards — normalizes what they publish, and
                places what can honestly be placed. When a source leaves out a time, a venue or a
                price, that absence is shown as an absence.
              </p>
              <div className="hosts__actions">
                <a className="btn btn--primary btn--lg" href="#map">
                  Open the map
                </a>
                <a className="btn btn--ghost btn--lg" href="#how">
                  See how it works
                </a>
              </div>
            </div>

            <div className="hosts__stats">
              <Stat value="1,007" caption="Listing sources wired in" />
              <Stat value="42" caption="Cities across India" />
              <Stat value={`${EVENTS.length}`} caption="Events in this window" />
              <Stat
                value={`${EVENTS.filter((e) => isPinnable(e.id)).length}/${EVENTS.length}`}
                caption="Precise enough to pin"
              />
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
