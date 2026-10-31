/** What the hero panel will show as you type. Mirrors App's derivation. */
import { parse, resolveQuery } from "../src/lib/ask.ts";
import { EVENTS, isOn } from "../src/data/events.ts";
import { todayISO } from "../src/lib/date.ts";

const today = todayISO();

/* Typing is progressive, so the panel is checked at each stage of a sentence. */
const TYPING = [
  "any",
  "anything on",
  "anything on tonight",
  "anything on tonight under ₹500",
  "anything on tonight under ₹500, nothing too loud",
];

for (const partial of TYPING) {
  if (partial.trim().length < 3) {
    console.log(`"${partial}" -> below 3 chars, no search`);
    continue;
  }
  const q = parse(partial, EVENTS);
  const { events, dropped } = resolveQuery(q, EVENTS, today);
  const shown = [...events].sort((a, b) => {
    const on = Number(isOn(b, today)) - Number(isOn(a, today));
    return on !== 0 ? on : a.startDate.localeCompare(b.startDate);
  });
  const top = shown[0];
  console.log(`"${partial}"`);
  console.log(`   ${shown.length} match${dropped.length ? ` (relaxed: ${dropped.join(", ")})` : ""}`);
  console.log(`   panel shows: ${top ? `${top.category} — ${top.title}` : "nothing (falls back to Tonight)"}`);
}
