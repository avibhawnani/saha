/**
 * Geocodes each event's venue string against Nominatim and caches the result.
 *
 *   node scripts/geocode.mjs
 *
 * Venue strings from listing pages rarely resolve whole ("Summer House Cafe,
 * Hauz Khas, New Delhi" returns nothing), so each one is tried at decreasing
 * specificity and the level that actually matched is recorded:
 *
 *   venue — the named place resolved; safe to pin
 *   area  — only the locality resolved; pin is approximate, show a radius
 *   city  — only the city resolved; do not pin, list it instead
 *
 * Recording the precision is the point. A city-level hit rendered as a sharp
 * pin is a lie about where the event is.
 *
 * Nominatim's policy allows 1 request/second and requires an identifying
 * User-Agent. Results are cached to src/data/coords.json — delete that file to
 * re-geocode.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const UA = "saha-event-discovery/0.1 (hackathon demo)";
const CACHE = "src/data/coords.json";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Node cannot import the generated .ts module directly, so the array literal
   is lifted out of it. It is emitted by our own generator as strict JSON. */
const events = JSON.parse(
  readFileSync("src/data/events.ts", "utf8").match(
    /export const EVENTS: SahaEvent\[\] = (\[[\s\S]*?\n\]);/,
  )[1],
);

async function lookup(q) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=in&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return null;
  const json = await res.json();
  if (!Array.isArray(json) || json.length === 0) return null;
  return {
    lat: Number(json[0].lat),
    lng: Number(json[0].lon),
    matched: json[0].display_name,
  };
}

const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};

for (const e of events) {
  if (cache[e.id]) {
    console.log(`${e.id}  cached      ${cache[e.id].precision}`);
    continue;
  }
  /* The source published coordinates, so there is nothing to resolve. */
  if (e.coords) {
    cache[e.id] = {
      lat: e.coords.lat,
      lng: e.coords.lng,
      precision: "venue",
      matched: `${e.venue.name ?? e.venueRaw} (coordinates published by the source)`,
      query: "none - supplied",
    };
    console.log(`${e.id}  supplied    ${e.coords.lat.toFixed(4)},${e.coords.lng.toFixed(4)}  ${e.venueRaw.slice(0, 50)}`);
    continue;
  }
  if (e.placement === "remote") {
    cache[e.id] = { precision: "none", reason: "online event, no location" };
    console.log(`${e.id}  skipped     online`);
    continue;
  }

  const { name, area, city } = e.venue;

  /* Build the cascade, de-duplicated. The label must describe the query that
     actually ran: with no area, the "area" attempt collapses to the bare city
     string, and calling that an area hit would overstate the precision. */
  const seen = new Set();
  const attempts = [];
  const push = (precision, parts) => {
    const q = parts.filter(Boolean).join(", ");
    if (!q || seen.has(q)) return;
    seen.add(q);
    attempts.push([q === city ? "city" : precision, q]);
  };
  push("venue", [name, area, city]);
  push("venue", [name, city]);
  push("area", [area, city]);
  push("city", [city]);

  let hit = null;
  for (const [precision, q] of attempts) {
    const r = await lookup(q);
    await sleep(1100);
    if (r) {
      hit = { ...r, precision, query: q };
      break;
    }
  }

  cache[e.id] = hit ?? { precision: "none", reason: "no Nominatim match" };
  console.log(
    `${e.id}  ${(hit?.precision ?? "FAILED").padEnd(11)} ${hit ? `${hit.lat.toFixed(4)},${hit.lng.toFixed(4)}  ${hit.matched.slice(0, 58)}` : e.venue.name}`,
  );
}

writeFileSync(CACHE, `${JSON.stringify(cache, null, 2)}\n`);
const byPrecision = Object.values(cache).reduce(
  (a, c) => ((a[c.precision] = (a[c.precision] ?? 0) + 1), a),
  {},
);
console.log("\nwrote", CACHE, byPrecision);
