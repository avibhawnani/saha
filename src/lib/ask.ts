import type { SahaEvent } from "../data/events";
import { isOn } from "../data/events";

/**
 * Turns a spoken sentence into a filter.
 *
 * Deliberately a keyword parser rather than a model call: it is instant, it is
 * explainable, and it cannot invent a filter the user did not ask for. The
 * upgrade path is a small LLM behind this same signature — `parse` is the only
 * thing that would change.
 *
 * Every keyword is matched on WORD BOUNDARIES. Substring matching looked fine
 * until real listing titles arrived and "Devesh" matched "dev", "CARNIVAL"
 * matched "car", and "SparkFest" matched "fest".
 */
export interface Query {
  text: string;
  categories: string[];
  /** true = only free, null = don't care. */
  free: boolean | null;
  onNow: boolean;
  /** Restrict to the next seven days. */
  thisWeek: boolean;
  /** true = online only, false = in person only, null = don't care. */
  online: boolean | null;
  places: string[];
  maxPriceINR: number | null;
}

/**
 * Spoken words that mean a category, keyed by the category names the dataset
 * actually uses. A category's own name is always accepted, so a new category
 * is never unreachable by voice even before anyone adds synonyms for it.
 */
const SYNONYMS: Record<string, string[]> = {
  Music: ["music", "musical", "gig", "gigs", "concert", "concerts", "dj", "band", "techno",
    "house", "qawwali", "sufi", "rock", "jazz", "indie", "rap", "symphony", "singer"],
  Food: ["food", "eat", "eating", "dinner", "lunch", "brunch", "beer", "wine", "dining",
    "restaurant", "cuisine", "tasting", "chef", "cafe", "bakery", "foodie"],
  Cars: ["car", "cars", "auto", "autos", "motor", "bike", "bikes", "motorcycle", "rally", "ev"],
  Hackathon: ["hackathon", "hackathons", "hack", "hacks", "buildathon", "datathon", "ideathon"],
  Programming: ["programming", "coding", "code", "dev", "devs", "developer", "developers",
    "tech", "software", "workshop", "bootcamp", "meetup", "startup", "ai", "ml", "blockchain"],
  Arts: ["art", "arts", "exhibition", "theatre", "theater", "comedy", "standup", "poetry",
    "film", "dance", "museum", "gallery", "comic"],
};

const NOW = /\b(tonight|today|right now|happening now|on now|this evening|whats on|what's on)\b/i;
const WEEK = /\b(this week|this weekend|next few days|coming week|weekend)\b/i;
const ONLINE = /\b(online|virtual|remote|from home)\b/i;
const IN_PERSON = /\b(in person|nearby|near me|walking distance|outside)\b/i;
/* Covers "free", "no cover", "nothing with a cover charge", "without paying". */
const FREE = /\b(free)\b|\bno\s+(cover|charge|entry fee|ticket)|\bnothing\s+with\s+a\s+(cover|charge)|\bwithout\s+(paying|a cover)/i;
const UNDER = /\b(?:under|below|less than|upto|up to|max|cheaper than)\s*₹?\s*([\d,]+)/i;

/** Word-boundary test, so "car" never matches "CARNIVAL". */
function hasWord(text: string, word: string): boolean {
  const safe = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${safe}\\b`, "i").test(text);
}

export function parse(utterance: string, events: SahaEvent[]): Query {
  const text = utterance.trim();
  const low = text.toLowerCase();

  /* Driven by the dataset's categories, not by the synonym table — so a
     category can never become unreachable just by lacking synonyms. */
  const present = [...new Set(events.map((e) => e.category))];
  const categories = present.filter(
    (cat) => hasWord(low, cat) || (SYNONYMS[cat] ?? []).some((w) => hasWord(low, w)),
  );

  /* Place names are matched against what the dataset actually contains, so the
     parser can never filter on a locality that is not in the data. */
  const known = new Set<string>();
  for (const e of events) {
    for (const part of [e.venue.area, e.venue.city, e.venue.name]) {
      if (part && part.length > 3) known.add(part.toLowerCase());
    }
  }
  const places = [...known].filter((p) => low.includes(p));

  const under = low.match(UNDER);

  return {
    text,
    categories,
    free: FREE.test(low) ? true : null,
    onNow: NOW.test(low),
    thisWeek: WEEK.test(low),
    online: ONLINE.test(low) ? true : IN_PERSON.test(low) ? false : null,
    places,
    maxPriceINR: under ? Number(under[1].replace(/,/g, "")) : null,
  };
}

/** ISO date `days` from today, for the week window. */
function plusDays(today: string, days: number): string {
  const d = new Date(`${today}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function matches(e: SahaEvent, q: Query, today: string): boolean {
  if (q.categories.length > 0 && !q.categories.includes(e.category)) return false;
  if (q.free === true && !e.price.free) return false;
  if (q.onNow && !isOn(e, today)) return false;

  if (q.thisWeek) {
    const end = plusDays(today, 7);
    /* Spans overlap the window; they do not have to start inside it. */
    if (e.endDate < today || e.startDate > end) return false;
  }

  if (q.online !== null) {
    const isOnline = e.placement === "remote";
    if (q.online !== isOnline) return false;
  }

  /**
   * A price cap excludes only events whose price is KNOWN to exceed it. Most
   * listings publish no price at all, so excluding unknowns would silently
   * drop most of the dataset — and this product's whole stance is to show a
   * gap rather than act as though it were a no.
   */
  if (q.maxPriceINR !== null && !e.price.free && e.price.fromINR !== null) {
    if (e.price.fromINR > q.maxPriceINR) return false;
  }

  if (q.places.length > 0) {
    const hay = [e.venue.area, e.venue.city, e.venue.name, e.venueRaw]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!q.places.some((p) => hay.includes(p))) return false;
  }

  return true;
}

/** Human-readable account of what was understood, shown back to the user. */
export function describe(q: Query): string[] {
  const out: string[] = [];
  if (q.onNow) out.push("on now");
  if (q.thisWeek) out.push("this week");
  if (q.online === true) out.push("online");
  if (q.online === false) out.push("in person");
  if (q.free) out.push("free entry");
  if (q.maxPriceINR !== null) out.push(`under ₹${q.maxPriceINR.toLocaleString("en-IN")}`);
  for (const c of q.categories) out.push(c.toLowerCase());
  for (const p of q.places) out.push(p);
  return out;
}

/**
 * Applies a query, relaxing it until something comes back.
 *
 * A spoken sentence often asks for a combination nothing satisfies — "quiet in
 * Hauz Khas tonight, no cover charge" is a reasonable thing to say and a
 * guaranteed empty set against any one week of listings. Returning nothing
 * reads as a broken product rather than an honest answer, so constraints are
 * dropped one at a time, weakest intent first, and the caller is told exactly
 * what had to go.
 *
 * Category is dropped last: it is the strongest signal of what someone
 * actually wants, so it is the last thing worth giving up.
 */
const RELAX_ORDER: { key: keyof Query; label: string }[] = [
  { key: "maxPriceINR", label: "the price limit" },
  { key: "free", label: "free entry only" },
  { key: "places", label: "the area" },
  { key: "thisWeek", label: "this week" },
  { key: "onNow", label: "on now" },
  { key: "online", label: "online only" },
  { key: "categories", label: "the category" },
];

const EMPTY: Record<string, unknown> = {
  maxPriceINR: null,
  free: null,
  places: [],
  thisWeek: false,
  onNow: false,
  online: null,
  categories: [],
};

export interface Resolved {
  events: SahaEvent[];
  /** Constraints that had to be dropped to get a non-empty result. */
  dropped: string[];
}

export function resolveQuery(q: Query, events: SahaEvent[], today: string): Resolved {
  const exact = events.filter((e) => matches(e, q, today));
  if (exact.length > 0) return { events: exact, dropped: [] };

  let relaxed: Query = { ...q };
  const dropped: string[] = [];

  for (const { key, label } of RELAX_ORDER) {
    relaxed = { ...relaxed, [key]: EMPTY[key] } as Query;
    dropped.push(label);
    const hits = events.filter((e) => matches(e, relaxed, today));
    if (hits.length > 0) return { events: hits, dropped };
  }

  return { events: [], dropped };
}
