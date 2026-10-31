/**
 * Normalizes a raw events file into typed data for the app.
 *
 *   node scripts/normalize-events.mjs <path-to-raw.json>
 *
 * Two input shapes are accepted and auto-detected:
 *
 *   "database"  { generated_on, region, window, events: [{ event, venue, price_entry, … }] }
 *   "scraper"   [ { title, date_start, venue, address, city, mode, theme, price, platform, … } ]
 *               — the output of the Python event_scraper (Anakin URL Scraper).
 *
 * Both collapse to the same SahaEvent contract, so the app never learns which
 * pipeline produced its data. Add a new adapter here, not a new type.
 *
 * The raw file is untrusted input: read from the path given as an argument,
 * parsed as JSON, never executed. Re-run this after every scrape rather than
 * editing src/data/events.ts by hand.
 *
 * Anything that cannot be derived stays null. The database shape documents its
 * own nulls as "not found in any source opened; not guessed", and that
 * discipline is kept for both shapes — a missing time is never invented.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

/* Several inputs may be given; they are adapted independently and merged, so
   a hand-curated database and a fresh scrape can coexist. */
const inputs = process.argv.slice(2);
if (inputs.length === 0) {
  console.error("usage: node scripts/normalize-events.mjs <raw.json> [more.json ...]");
  process.exit(1);
}

/* ── Shared helpers ──────────────────────────────────────────────────────── */

/** First clock time in a free-text schedule, as 24h "HH:MM", else null. */
function pickTime(text) {
  const m = String(text).match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (m[3].toUpperCase() === "PM") h += 12;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

/** Time out of an ISO 8601 timestamp, else null. */
function isoTime(s) {
  const m = String(s).match(/T(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : null;
}

function isoDate(s) {
  const m = String(s).match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

/**
 * Splits "Summer House Cafe, Hauz Khas, New Delhi" into its parts.
 * Parenthetical notes are stripped first — "Delhi (exact venue not found)" is
 * the city Delhi with a caveat, not a place called that. A single remaining
 * token is therefore a city, not a venue name.
 */
function splitVenue(venue) {
  const clean = String(venue).replace(/\s*\([^)]*\)\s*/g, " ").trim();
  const parts = clean.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 3) {
    return { name: parts[0], area: parts[1], city: parts[parts.length - 1] };
  }
  if (parts.length === 2) return { name: parts[0], area: null, city: parts[1] };
  return { name: null, area: null, city: parts[0] ?? null };
}

function priceOf(text) {
  const s = String(text ?? "");
  const free = /\bfree\b/i.test(s);
  const m = s.match(/₹\s?([\d,]+)/);
  return {
    free,
    fromINR: m ? Number(m[1].replace(/,/g, "")) : null,
    raw: s || "Not stated",
  };
}

/**
 * One category vocabulary across both pipelines. Without this the filter row
 * offers "Cars" (database) and "Automobile" (scraper theme) as if they were
 * different things.
 */
const CATEGORY = {
  automobile: "Cars",
  cars: "Cars",
  hackathon: "Hackathon",
  programming: "Programming",
  music: "Music",
  food: "Food",
  arts: "Arts",
  other: "Other",
};

const toCategory = (s) =>
  CATEGORY[String(s).toLowerCase()] ??
  String(s).replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());

/* ── Adapter: database shape ─────────────────────────────────────────────── */

function placementFromVenueText(venue) {
  const v = String(venue).toLowerCase();
  if (v.includes("online") || v.includes("remote") || v.includes("virtual")) return "remote";
  if (v.includes("not found")) return "city";
  return "point";
}

function fromDatabase(d) {
  const events = d.events.map((e) => {
    const placement = placementFromVenueText(e.venue);
    return {
      id: e.id,
      title: e.event,
      category: toCategory(e.category),
      description: e.description,
      startDate: e.start_date,
      endDate: e.end_date,
      startTime: pickTime(e.date_time),
      schedule: e.date_time,
      venue:
        placement === "remote"
          ? { name: null, area: null, city: null }
          : splitVenue(e.venue),
      venueRaw: e.venue,
      placement,
      organizer: e.organizer,
      price: priceOf(e.price_entry),
      link: e.official_link,
      linkType: e.link_type,
      source: null,
      coords: null,
      dataGaps: e.data_gaps,
    };
  });

  return {
    events,
    meta: { region: d.region, window: d.window, generatedOn: d.generated_on, nullMeans: d.null_means },
  };
}

/* ── Adapter: scraper shape ──────────────────────────────────────────────── */

/** The scraper emits no id, so one is derived — stable across runs. */
function scraperId(e) {
  const seed = `${e.platform}|${e.title}|${e.date_start}`;
  return `SC-${createHash("sha1").update(seed).digest("hex").slice(0, 8)}`;
}

/**
 * Records what this row is missing, in the same spirit as the database shape's
 * `data_gaps`. An absent field is information about the source, so it is
 * written down rather than quietly dropped.
 */
function gapsOf(e, startTime) {
  const gaps = [];
  if (!startTime) gaps.push("start time not published");
  if (!isoDate(e.date_end)) gaps.push("end date not published");
  if (!e.venue && !e.address && e.mode !== "online") gaps.push("venue not published");
  if (!e.price) gaps.push("price not published");
  if (!e.event_url && !e.registration_url) gaps.push("no listing URL");
  if (!e.organizer) gaps.push("organizer not published");
  return gaps.length > 0 ? `Source did not publish: ${gaps.join("; ")}.` : null;
}

function fromScraper(rows) {
  const events = rows
    /* A row with no title or no usable start date cannot be displayed
       honestly, so it is dropped rather than shown as a blank card. */
    .filter((e) => e.title && isoDate(e.date_start))
    .map((e) => {
      const startDate = isoDate(e.date_start);
      const startTime = isoTime(e.date_start) ?? pickTime(e.date_start);
      const online = String(e.mode).toLowerCase() === "online";
      const venueText = [e.venue, e.address].filter(Boolean).join(", ");

      let placement;
      if (online) placement = "remote";
      else if (venueText) placement = "point";
      else placement = "city";

      return {
        id: scraperId(e),
        title: e.title,
        category: toCategory(e.theme || "other"),
        description: e.description || "",
        startDate,
        endDate: isoDate(e.date_end) ?? startDate,
        startTime,
        schedule: [e.date_start, e.date_end].filter(Boolean).join(" – "),
        venue: online
          ? { name: null, area: null, city: null }
          : venueText
            ? { ...splitVenue(venueText), name: e.venue || splitVenue(venueText).name }
            : { name: null, area: null, city: e.city || null },
        venueRaw: venueText || e.city || "Online",
        placement,
        organizer: e.organizer || null,
        price: priceOf(e.price),
        link: e.event_url || e.registration_url || null,
        linkType: e.platform ? `${e.platform} listing` : "Listing page",
        source: e.platform || null,
        coords:
          typeof e.lat === "number" && typeof e.lng === "number"
            ? { lat: e.lat, lng: e.lng }
            : null,
        /* A curated row may state its own gaps; otherwise they are derived. */
        dataGaps: e.data_gaps ?? gapsOf(e, startTime),
      };
    });

  const dates = events.map((e) => e.startDate).sort();
  return {
    events,
    meta: {
      region: "Delhi-NCR and online",
      window: dates.length > 0 ? `${dates[0]} to ${dates[dates.length - 1]}` : "unknown",
      generatedOn: isoDate(rows[0]?.scraped_at) ?? new Date().toISOString().slice(0, 10),
      nullMeans: "Not published by the source page; not guessed",
    },
  };
}

/* ── Detect, adapt, merge ────────────────────────────────────────────────── */

function adapt(raw) {
  if (Array.isArray(raw)) return fromScraper(raw);
  if (Array.isArray(raw.events) && raw.events[0] && "event" in raw.events[0]) {
    return fromDatabase(raw);
  }
  return fromScraper(raw.events ?? []);
}

const events = [];
const metas = [];
const seen = new Set();

for (const path of inputs) {
  const part = adapt(JSON.parse(readFileSync(path, "utf8")));
  let kept = 0;
  for (const e of part.events) {
    /* Both pipelines can surface the same event. The link is the only stable
       identity across them, so it wins over the generated id. */
    const key = (e.link ?? e.id).split("?")[0];
    if (seen.has(key)) continue;
    seen.add(key);
    events.push(e);
    kept += 1;
  }
  metas.push(part.meta);
  console.log(`  ${path} -> ${kept} kept of ${part.events.length}`);
}

if (events.length === 0) {
  console.error("No usable events found. Check the input shapes.");
  process.exit(1);
}

events.sort((a, b) => a.startDate.localeCompare(b.startDate));

const dates = events.map((e) => e.startDate);
const meta = {
  region: metas[0].region,
  window: `${dates[0]} to ${dates[dates.length - 1]}`,
  generatedOn: metas[0].generatedOn,
  nullMeans: metas[0].nullMeans,
};

const out = `// GENERATED by scripts/normalize-events.mjs — do not edit by hand.
// Source: ${meta.region}, window ${meta.window}, generated ${meta.generatedOn}.
// null means: ${meta.nullMeans}

/** Whether an event can carry a map pin, and at what precision. */
export type Placement = "point" | "city" | "remote";

export interface EventPrice {
  /** Explicitly free to enter. */
  free: boolean;
  /** Lowest published price in rupees, or null if none was published. */
  fromINR: number | null;
  /** The original price string, shown verbatim so nothing is lost in parsing. */
  raw: string;
}

export interface EventVenue {
  /** Named place, or null when the source published only an area or city. */
  name: string | null;
  area: string | null;
  city: string | null;
}

export interface SahaEvent {
  id: string;
  title: string;
  category: string;
  description: string;
  /** ISO date. Events are spans, not instants — always compare against endDate too. */
  startDate: string;
  endDate: string;
  /** 24h "HH:MM", or null when no time was published. Do not substitute one. */
  startTime: string | null;
  /** The original free-text schedule. */
  schedule: string;
  venue: EventVenue;
  /** The venue string exactly as published, so nothing is lost in parsing. */
  venueRaw: string;
  placement: Placement;
  organizer: string | null;
  price: EventPrice;
  link: string | null;
  linkType: string;
  /** Platform the listing came from, when the pipeline recorded one. */
  source: string | null;
  /**
   * Coordinates the source itself published, when it did. A page that embeds a
   * maps link already knows exactly where it is, so there is nothing to
   * geocode and nothing to get wrong.
   */
  coords: { lat: number; lng: number } | null;
  /** What the source could not confirm. Worth showing, not hiding. */
  dataGaps: string | null;
}

export const EVENTS: SahaEvent[] = ${JSON.stringify(events, null, 2)};

/** The window the dataset covers. */
export const DATASET = {
  region: ${JSON.stringify(meta.region)},
  window: ${JSON.stringify(meta.window)},
  generatedOn: ${JSON.stringify(meta.generatedOn)},
} as const;

/** An event is on today when today falls inside its span — not when it starts. */
export function isOn(e: SahaEvent, today: string): boolean {
  return e.startDate <= today && today <= e.endDate;
}

export const CATEGORIES = [...new Set(EVENTS.map((e) => e.category))].sort();
`;

writeFileSync("src/data/events.ts", out);
console.log(`wrote src/data/events.ts — ${events.length} events`);
const counts = events.reduce((a, e) => ((a[e.placement] = (a[e.placement] ?? 0) + 1), a), {});
console.log("placement:", counts);
console.log("times published:", events.filter((e) => e.startTime).length, "/", events.length);
console.log("categories:", [...new Set(events.map((e) => e.category))].join(", "));
