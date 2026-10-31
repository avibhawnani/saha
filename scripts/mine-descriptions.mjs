/**
 * Second-pass extractor for the Python event_scraper's output.
 *
 *   node scripts/mine-descriptions.mjs <scraped.json> <mined.json>
 *
 * WHY THIS EXISTS
 * The scraper's Anakin plumbing works, but its parser maps *page sections* to
 * Event rows rather than individual events. The result is rows titled "Things
 * To Do In Delhi" and "Trending in Delhi" with no date and no venue — in a
 * sample of 41 rows, 40 had no date_start and none had a venue.
 *
 * The actual events survive inside each row's `description`, as markdown. This
 * mines them back out, in two shapes seen in the live output:
 *
 *   A  [Title](url) is happening on 31 Oct 2026 from 11:00 AM onwards at Venue, City
 *   B  - Thu, 03 Dec • 06:00 PM [**Title**](url "tooltip")
 *
 * A link with no date at all is dropped: an event that cannot be placed in
 * time cannot be displayed honestly.
 *
 * Output is the scraper's own Event schema, so scripts/normalize-events.mjs
 * consumes it unchanged.
 */
import { readFileSync, writeFileSync } from "node:fs";

const [, , inPath, outPath] = process.argv;
const rows = JSON.parse(readFileSync(inPath, "utf8"));

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * Themes derived from the title, because the scraper's own theme is unreliable
 * (it tagged "Great India Beer Fest" as automobile).
 *
 * Matched on WORD BOUNDARIES. Substring matching put "Cult Leader By Devesh
 * Dixit" under programming ("dev" inside "Devesh") and "BANGTANVERSE CARNIVAL"
 * under automobile ("car" inside "CARNIVAL"). Generic words that appear inside
 * event names — "fest", "live", "build" — are left out entirely.
 *
 * This is still a guess from a title alone and will keep getting some wrong;
 * the real fix is to carry the source page's own category through the scrape.
 */
const THEMES = {
  hackathon: ["hackathon", "hackathons", "hack", "buildathon", "datathon", "ideathon"],
  programming: ["programming", "coding", "code", "dev", "devs", "developer", "tech",
    "software", "workshop", "bootcamp", "meetup", "startup", "ai", "ml", "blockchain", "web3"],
  music: ["music", "musik", "concert", "gig", "band", "dj", "techno", "qawwali", "sufi",
    "rock", "jazz", "indie", "rap", "symphony", "singer", "disco"],
  food: ["food", "beer", "brunch", "dining", "restaurant", "cuisine", "tasting", "chef",
    "wine", "cafe", "bakery", "dinner", "mela"],
  automobile: ["car", "cars", "auto", "motor", "bike", "motorcycle", "rally"],
  arts: ["art", "arts", "exhibition", "theatre", "theater", "comedy", "standup", "poetry",
    "film", "dance", "museum", "gallery", "comic", "con"],
};

/** Word-boundary test, so "car" never matches "CARNIVAL". */
function hasWord(text, word) {
  const safe = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${safe}\\b`, "i").test(text);
}

function themeOf(title) {
  for (const [theme, words] of Object.entries(THEMES)) {
    if (words.some((w) => hasWord(title, w))) return theme;
  }
  return "other";
}

/** "31 Oct 2026" or "03 Dec" (year inferred) → ISO date, else null. */
function toISO(day, mon, year) {
  const m = MONTHS[String(mon).slice(0, 3).toLowerCase()];
  if (!m) return null;
  const y = year ? Number(year) : new Date().getFullYear();
  const d = Number(day);
  if (!d || d > 31) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function to24h(time) {
  if (!time) return "";
  const m = time.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return "";
  let h = Number(m[1]) % 12;
  if (m[3].toUpperCase() === "PM") h += 12;
  return `T${String(h).padStart(2, "0")}:${m[2]}`;
}

/* A: "[Title](url) is happening on 31 Oct 2026 from 11:00 AM onwards at Venue" */
const A =
  /\[([^\]]+?)\]\((https?:\/\/[^)\s]+?)(?:\s+"[^"]*")?\)\s*is happening on\s*(\d{1,2})\s+(\w{3,})\s+(\d{4})(?:\s*from\s*([\d:]+\s*[AP]M))?(?:\s*onwards)?(?:\s*at\s+([^[\n]{3,80}?))?(?=\s*(?:-\s*[[]|$|\n))/gi;

/* B: "- Thu, 03 Dec • 06:00 PM [**Title**](url)" */
const B =
  /(?:\w{3},\s*)?(\d{1,2})\s+(\w{3,})(?:\s+(\d{4}))?\s*(?:•|·|\|)?\s*([\d:]+\s*[AP]M)?\s*\[\*{0,2}([^\]]+?)\*{0,2}\]\((https?:\/\/[^)\s]+?)(?:\s+"[^"]*")?\)/gi;

const mined = [];
const seen = new Set();

function push({ title, url, date, time, venue, platform, scrapedAt }) {
  const clean = title.replace(/\s+/g, " ").trim();
  if (!clean || clean.length < 4 || !date) return;
  const key = url.split("?")[0];
  if (seen.has(key)) return;
  seen.add(key);

  const where = (venue ?? "").replace(/\s+/g, " ").replace(/[,\s]+$/, "").trim();
  mined.push({
    title: clean,
    description: "",
    date_start: `${date}${to24h(time)}`,
    date_end: "",
    venue: where.split(",")[0] ?? "",
    address: where,
    city: /online|virtual/i.test(where) ? "Online" : "Delhi",
    mode: /online|virtual/i.test(where) ? "online" : "offline",
    theme: themeOf(clean),
    tags: [],
    organizer: "",
    organizer_url: "",
    event_url: url,
    registration_url: url,
    price: "",
    platform,
    scraped_at: scrapedAt,
  });
}

for (const row of rows) {
  const text = row.description ?? "";
  if (!text) continue;

  for (const m of text.matchAll(A)) {
    push({
      title: m[1],
      url: m[2],
      date: toISO(m[3], m[4], m[5]),
      time: m[6],
      venue: m[7],
      platform: row.platform,
      scrapedAt: row.scraped_at,
    });
  }

  for (const m of text.matchAll(B)) {
    push({
      title: m[5],
      url: m[6],
      date: toISO(m[1], m[2], m[3]),
      time: m[4],
      venue: "",
      platform: row.platform,
      scrapedAt: row.scraped_at,
    });
  }
}

writeFileSync(outPath, `${JSON.stringify(mined, null, 2)}\n`);
console.log(`mined ${mined.length} events from ${rows.length} scraped rows -> ${outPath}`);
const byTheme = mined.reduce((a, e) => ((a[e.theme] = (a[e.theme] ?? 0) + 1), a), {});
console.log("themes:", byTheme);
console.log("with a venue:", mined.filter((e) => e.address).length);
console.log("sample:", mined.slice(0, 5).map((e) => `${e.date_start}  ${e.title.slice(0, 44)}`).join("\n         "));
