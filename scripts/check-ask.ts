/**
 * Exercises the spoken-query parser against the real dataset.
 *
 *   node --experimental-strip-types scripts/check-ask.ts
 *
 * This is the only part of the ask flow testable outside a browser: the
 * dictation itself is an OS-level keystroke stream, so what can be verified
 * here is that a plausible sentence produces the filters it should.
 */
import { describe, parse, resolveQuery } from "../src/lib/ask.ts";
import { CATEGORIES, EVENTS, isOn } from "../src/data/events.ts";
import { todayISO } from "../src/lib/date.ts";

const today = todayISO();

const UTTERANCES = [
  /* The AskBar placeholder and the Demo's phrase — these two must never be empty. */
  "anything on tonight under ₹500, nothing too loud",
  "somewhere quiet in Hauz Khas tonight, nothing with a cover charge",
  "any music happening tonight",
  "free food events this week",
  "is there a hackathon on right now",
  "a coding workshop or dev meetup",
  "something with cars",
  "anything under 500 tonight",
  "live gig in Delhi",
  "what's on online",
  "I feel like getting dinner somewhere",
];

console.log(`today = ${today}`);
console.log(`dataset = ${EVENTS.length} events, categories: ${CATEGORIES.join(", ")}`);
console.log(`on now  = ${EVENTS.filter((e) => isOn(e, today)).length}`);
console.log(`priced  = ${EVENTS.filter((e) => e.price.fromINR !== null).length} have a numeric price`);
console.log(`free    = ${EVENTS.filter((e) => e.price.free).length}`);
console.log("");

let broken = 0;
for (const u of UTTERANCES) {
  const q = parse(u, EVENTS);
  const { events: hits, dropped } = resolveQuery(q, EVENTS, today);
  const tags = describe(q);
  const flag = hits.length === 0 ? "  ✗ ZERO RESULTS" : "";
  if (hits.length === 0) broken += 1;
  console.log(`"${u}"`);
  console.log(`   understood: [${tags.join(", ") || "nothing"}]`);
  console.log(`   matches: ${hits.length}${flag}${dropped.length ? `  (relaxed: ${dropped.join(", ")})` : ""}`);
  if (hits.length > 0 && hits.length <= 3) {
    for (const h of hits) console.log(`      - ${h.category.padEnd(12)} ${h.title.slice(0, 50)}`);
  }
  console.log("");
}

console.log(`${UTTERANCES.length - broken}/${UTTERANCES.length} utterances returned something.`);

/* Which categories can a spoken sentence actually reach? */
console.log("\nreachability by category:");
for (const cat of CATEGORIES) {
  const spoken = parse(cat, EVENTS);
  const ok = spoken.categories.includes(cat);
  console.log(`  ${cat.padEnd(12)} ${ok ? "reachable" : "✗ NOT REACHABLE by name"}`);
}
