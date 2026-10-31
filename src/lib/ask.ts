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
  /** Content words from the sentence, matched against the listings themselves. */
  terms: string[];
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

/**
 * Words that carry no search intent. "event" and "events" are included because
 * every row is an event — keeping them would make every query match everything.
 * Anything already captured as structured intent (tonight, free, under) is
 * stripped too, so it is not double-counted as a text term.
 */
const STOPWORDS = new Set([
  "a", "an", "the", "any", "some", "something", "anything", "everything",
  "is", "are", "was", "there", "here", "on", "in", "at", "to", "for", "of",
  "and", "or", "but", "with", "without", "from", "by", "me", "my", "i", "we",
  "you", "it", "its", "that", "this", "these", "those", "what", "whats",
  "where", "when", "which", "who", "how", "happening", "happen", "happens",
  "event", "events", "show", "shows", "find", "finding", "looking", "look",
  "want", "wanna", "feel", "feels", "like", "near", "nearby", "around",
  "go", "going", "out", "do", "doing", "got", "get", "getting", "can",
  "could", "would", "should", "please", "give", "show", "tell", "about",
  "somewhere", "anywhere", "place", "places", "thing", "things", "stuff",
  "tonight", "today", "now", "week", "weekend", "evening", "free", "under",
  "below", "less", "than", "upto", "up", "max", "cheaper", "online",
  "virtual", "remote", "person", "cover", "charge", "nothing", "no", "not",
  "too", "very", "quiet", "loud",
]);

/** Content words worth searching the listings for. */
function termsOf(low: string): string[] {
  const words = low
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
  return [...new Set(words)];
}

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
    terms: termsOf(low),
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

/** The searchable text of an event, lowercased once per call. */
function haystack(e: SahaEvent): { title: string; rest: string } {
  return {
    title: e.title.toLowerCase(),
    rest: [e.description, e.category, e.venue.name, e.venue.area, e.venue.city, e.organizer, e.source]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
  };
}

/** Word-boundary test, so "ai" matches "AI Meetup" and not "Diwali". */
function hasTerm(text: string, term: string): boolean {
  const safe = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${safe}`, "i").test(text);
}

/**
 * Relevance of an event to a query. A title hit counts for far more than a
 * description hit — "AI Meetup" is about AI; an event that merely mentions AI
 * in passing is not.
 */
export function score(e: SahaEvent, q: Query, today: string): number {
  if (q.terms.length === 0) return isOn(e, today) ? 1 : 0;

  const { title, rest } = haystack(e);
  let s = 0;

  for (const term of q.terms) {
    if (hasTerm(title, term)) s += 6;
    else if (hasTerm(rest, term)) s += 2;
  }

  /* The whole phrase appearing in a title is a much stronger signal than the
     same words scattered across it. */
  const phrase = q.terms.join(" ");
  if (q.terms.length > 1 && title.includes(phrase)) s += 5;

  if (s > 0 && isOn(e, today)) s += 1;
  return s;
}

export function matches(e: SahaEvent, q: Query, today: string): boolean {
  /* The words someone said are the strongest signal there is. If they named
     something specific, an event that mentions it nowhere is not a result —
     which is the whole bug this guard fixes: before it, "AI events" matched
     every row because no structured filter happened to apply. */
  if (q.terms.length > 0 && score(e, q, today) === 0) return false;

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

  /* A term already covered by a structured label is not worth repeating:
     "hackathon in gurugram" should read as two chips, not four. */
  const covered = out.join(" ").toLowerCase();
  for (const term of q.terms) {
    if (!covered.includes(term)) out.push(`“${term}”`);
  }
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
/* `terms` is deliberately absent: relaxing the structured filters is helpful,
   but dropping the words someone actually said turns a search into a shrug. */
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

/** Most relevant first; ties broken by what is on soonest. */
function rank(a: SahaEvent, b: SahaEvent, q: Query, today: string): number {
  const byScore = score(b, q, today) - score(a, q, today);
  if (byScore !== 0) return byScore;
  const byOn = Number(isOn(b, today)) - Number(isOn(a, today));
  return byOn !== 0 ? byOn : a.startDate.localeCompare(b.startDate);
}

/** Does this query ask for anything beyond the literal words? */
function hasStructuredIntent(q: Query): boolean {
  return (
    q.categories.length > 0 ||
    q.free !== null ||
    q.onNow ||
    q.thisWeek ||
    q.online !== null ||
    q.places.length > 0 ||
    q.maxPriceINR !== null
  );
}

export function resolveQuery(q: Query, events: SahaEvent[], today: string): Resolved {
  const sorted = (list: SahaEvent[]) => [...list].sort((x, y) => rank(x, y, q, today));

  const exact = events.filter((e) => matches(e, q, today));
  if (exact.length > 0) return { events: sorted(exact), dropped: [] };

  /** Walks RELAX_ORDER from `start`, returning the first non-empty result. */
  const walk = (start: Query, already: string[]): Resolved | null => {
    let relaxed = start;
    const dropped = [...already];
    for (const { key, label } of RELAX_ORDER) {
      relaxed = { ...relaxed, [key]: EMPTY[key] } as Query;
      dropped.push(label);
      const hits = events.filter((e) => matches(e, relaxed, today));
      if (hits.length > 0) return { events: sorted(hits), dropped };
    }
    return null;
  };

  /* First pass keeps the words. They are the strongest signal, so relaxing the
     structured filters around them is nearly always what was meant. */
  const kept = walk({ ...q }, []);
  if (kept) return kept;

  /**
   * Second pass drops the words — but only when the sentence asked for
   * something else as well. "I feel like getting dinner" means Food even
   * though no listing contains the word "dinner"; honouring the category is
   * right. A sentence with nothing BUT unmatched words ("zorbing") has to
   * come back empty, because dropping its words would return the entire
   * dataset and present it as an answer.
   */
  if (hasStructuredIntent(q)) {
    const withoutTerms = { ...q, terms: [] as string[] };
    const direct = events.filter((e) => matches(e, withoutTerms, today));
    if (direct.length > 0) return { events: sorted(direct), dropped: ["the exact words"] };

    const loosened = walk(withoutTerms, ["the exact words"]);
    if (loosened) return loosened;
  }

  return { events: [], dropped: [] };
}
