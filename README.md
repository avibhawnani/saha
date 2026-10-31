# saha

**सह (saha)** — Sanskrit for *together, with*.

Say what kind of evening you want, out loud. Saha listens to the whole sentence,
sweeps public event listings across India, and puts everything genuinely on
tonight on a map — including, plainly, what the sources failed to publish.

Saha **displays** events. It does not host them and does not take bookings.

Built at the WeMakeDevs *Speed of Thought* hackathon around two tools:
**Wispr Flow** for voice input and **Anakin** for reading the open web.

---

## Quick start

```bash
npm install
cp .env.example .env     # add your Anakin key (free: https://anakin.io/signup)
npm run dev
```

| Script | What it does |
|---|---|
| `npm run dev` | Dev server, including the Anakin proxy |
| `npm run build` | `tsc -b && vite build` |
| `npm run lint` | oxlint |

Stack: **Vite 8 · React 19 · TypeScript 7 · MapLibre GL JS 6 · oxlint**.

---

## The two integrations

### Wispr Flow — the voice layer

There is **no embeddable Wispr Flow SDK**. Verified against their site, their
`/developers` page and their help centre: the product is a **keyboard** on iOS
and a **system-wide dictation hotkey** on macOS and Windows. An enterprise API
is mentioned in a 2025 press release but is not publicly documented.

So the integration is the *input surface*, which is the only honest one — and
on desktop it is genuinely the better one. Flow types into whatever field has
focus, including a browser `<textarea>`, with no app switching.

That has a consequence worth understanding: **the page cannot detect dictation.**
A dictated sentence arrives looking exactly like a paste. `AskBar` therefore:

- accepts long natural sentences rather than keywords, multiline, autogrowing
- disables `autoCorrect`, `autoCapitalize` and `spellCheck`, which fight dictation
- detects a **burst insert** (>25 characters in one `input` event) and
  acknowledges it with a "Heard you" state — an honest heuristic, not a claim
  to have heard anything

### Anakin — the data layer

Every call goes to `/api/anakin`, which the dev server proxies to
`https://api.anakin.io/v1` with `X-API-Key` injected (`vite.config.ts`). **The
key is never in client code.** Anakin's API does send
`access-control-allow-origin: *` and would accept a browser call directly, but
that would put the key in the bundle for anyone to read and drain.

| Endpoint | Used for |
|---|---|
| `POST /url-scraper/scrape` | Reading listing pages, `useBrowser: true` for JS-heavy SPAs |
| `POST /search` | "Ask the web about this" in the event detail panel — synchronous, seconds |
| `GET /wire/catalog` | The 1,007-source catalog (public, no key needed) |

`POST /agentic-search` is deliberately **unused**: it is the better research
tool but takes 1–5 minutes, which is unusable behind a click.

> **Production note:** the proxy is a *dev-server* feature. A deployed build has
> no `/api/anakin`, so "Ask the web" needs a real function (a Supabase edge
> function or a serverless route) behind the same path. Client code won't change.

---

## Data pipeline

Events arrive from three different shapes and collapse into one contract, so the
app never learns which pipeline produced its data.

```
 event_scraper (Python, Anakin URL Scraper)
         │  output/events_YYYY-MM-DD.json
         ▼
 scripts/mine-descriptions.mjs      ← recovers real events from page prose
         │  data/mined-events.json
         ▼
 scripts/normalize-events.mjs  ◄── data/delhi-events-database.json  (curated DB)
         │                     ◄── data/curated.json                (hand-added)
         │  src/data/events.ts      → SahaEvent[]
         ▼
 scripts/geocode.mjs                ← Nominatim, records PRECISION
         │  src/data/coords.json
         ▼
 the app
```

Regenerate everything:

```bash
node scripts/mine-descriptions.mjs <scraped.json> data/mined-events.json
node scripts/normalize-events.mjs data/delhi-events-database.json \
     data/mined-events.json data/curated.json
node scripts/geocode.mjs
```

`src/data/events.ts` and `src/data/coords.json` are **generated and committed**
— the app cannot build without them. Never edit them by hand.

### Why `mine-descriptions.mjs` exists

The Python scraper's Anakin plumbing works, but its parser maps *page sections*
to event rows rather than individual events. In a real 2-platform run: **41 rows,
40 with no date, 0 with a venue**, titled things like `"Things To Do In Delhi"`
and `"Trending in Delhi"`. The actual events survive inside each row's
`description` as markdown, so this mines them back out. A link with no date is
dropped — an event that cannot be placed in time cannot be displayed honestly.

### Precision, not pins

The single most important field in the pipeline. Venue strings from listing
pages rarely resolve whole, so `geocode.mjs` tries each at decreasing
specificity and **records the level that actually matched**:

| Precision | Rendered as |
|---|---|
| `venue` | A hard point |
| `area` | A soft dashed disc — the event is *somewhere in there* |
| `city` | **Not pinned.** Listed beside the map with the reason |
| `none` | Not pinned (online, or unresolvable) |

A city centroid drawn as a sharp pin is a lie about where an event is. Of 22
events, **7 are pinnable** — the rest are listed with an explicit reason. A map
that silently drops two thirds of its data is worse than one that says so.

Sources that publish their own coordinates (Luma embeds a maps link) bypass
geocoding entirely via a `lat`/`lng` on the curated row.

### Nulls are data

The upstream dataset documents its own nulls as *"not found in any source
opened; not guessed"*, and the whole pipeline keeps that discipline. A missing
start time renders as *"time not published"* in italics, never as a plausible
invented time. Per-event `dataGaps` are shown in the UI, not hidden.

---

## Spoken search

`src/lib/ask.ts` turns a sentence into a filter. It is a **keyword parser, not a
model call**: instant, explainable, and incapable of inventing a filter the user
did not ask for. The upgrade path is a small LLM behind the same signature —
`parse()` is the only thing that would change.

Two hard-won details:

- **Word boundaries everywhere.** Substring matching put *"Cult Leader By Devesh
  Dixit"* under programming (`dev` inside "Devesh") and *"BANGTANVERSE CARNIVAL"*
  under cars (`car` inside "CARNIVAL").
- **`resolveQuery` relaxes rather than returning nothing.** "Quiet in Hauz Khas
  tonight, no cover charge" is a reasonable thing to say and a guaranteed empty
  set against one week of listings. Constraints are dropped one at a time,
  weakest intent first, and the UI says what it set aside. Category is dropped
  **last** — it is the strongest signal of what someone actually wants.

Verify it against the real dataset:

```bash
node scripts/run-ts.mjs scripts/check-ask.ts
```

---

## Design system

All tokens live in [`src/styles/tokens.css`](src/styles/tokens.css). **Never
type a raw hex, radius or font stack in a component.** If a value is missing,
add it to the token file first.

Going out with people is a warm, daylight-confident act. Dark interfaces read as
tools; light ones read as places. So saha is a **light** product on a bone
ground — light-only, no theme toggle, because it has one mood and should commit.

There is **no black and no blue anywhere**, including inside shadows and
hairlines. Every neutral is mixed from the ink colour, so the whole surface sits
at one warm temperature. A grey shadow on warm paper is the fastest way to make
a palette look accidental.

| Role | Token | Notes |
|---|---|---|
| Ground | `--bone` `#fbf7f1` | Never pure white — paper has a temperature |
| Inverted | `--plum` `#2b1b23` | Deep aubergine-brown, deliberately not neutral |
| Ink | `--ink` `#2a1c22` | 15:1 on bone |
| **Action** | `--saffron` `#e2821a` | The *only* fill meaning "do this". Filled with **ink** text, not white — 5.5:1, and it reads as a product rather than a warning |
| Accent type | `--clay` `#b5452c` | Saffron cannot carry type on bone; clay clears 6.6:1 |
| Free / on now | `--jade` `#1e7a5a` | Reserved — never decorative |
| Ending | `--rose` `#c2345a` | Reserved — never decorative |

Jade and rose are locked to listing state on purpose. The moment they're used
decoratively, those states stop being readable at a glance.

**Form.** Radii are generous and even (6/9/13/18/26/34) so nested corners stay
concentric. One family, Inter — hierarchy from size, weight and *optical
tracking* (the larger the type, the tighter it is set), not from mixing faces.
Body is 17px. Numbers are tabular on data elements, which is why the system
needs no monospace face. Shadows are two-layer and warm. One ease for entrances,
a springier one for touch; everything under 240ms.

**Glass** only works when there is colour behind it to refract — which is why
the hero carries three large blurred orbs and the nav is a *floating* pill: the
page's colour runs underneath and around it, and the pane visibly picks up
saffron then cooler tones as you scroll. The pane is three layers (warm
translucent fill, bright 1px rim, inner top sheen) with `saturate(190%)`, since
blur alone washes colour out. There is an `@supports not` fallback to a solid
surface.

---

## Project layout

```
src/
  app                          App.tsx — hero, map, demo, coverage
  components/
    Navbar      floating glass pill, scroll-spy, mobile sheet
    AskBar      dictation-first search field
    MapView     MapLibre, precision-aware pins (lazy-loaded)
    MapBoundary WebGL failure isolation
    EventDetail structured facts + Anakin web lookup
    Tonight     hero listing preview
    Demo        four-stage self-playing product demo
    ui.tsx      Button, Pill, Chip, Panel, Price, When, Gap, KeyLine, Stat
  lib/
    ask.ts      spoken sentence → filter, with relaxation
    anakin.ts   typed API client
    coords.ts   precision-aware coordinate lookup
    date.ts     local-timezone today
  data/         GENERATED — events.ts, coords.json
  styles/       tokens.css, base.css
scripts/        pipeline + checks (see Data pipeline)
data/           committed source data
```

---

## Known limitations

Stated rather than discovered later:

1. **The Anakin proxy is dev-only.** "Ask the web" 404s in a production build
   until a real function sits behind `/api/anakin`.
2. **Nominatim is imprecise.** One event matched *"Hotel Mayur C R Park"* rather
   than *"C.R. Park Bangiya Samaj"* — right area, wrong building. It is labelled
   `area` so the UI doesn't overclaim, but the pin is on the wrong premises.
3. **Category guessing from a title is lossy.** "Keinemusik presents Adam Port"
   lands in `Other`. The real fix is carrying the source page's own category
   through the scrape.
4. **Placeholder figures.** `42 cities` / `+36 more` in the hero and `184
   listings` in the demo are placeholders, marked as such in code. `1,007
   sources` is real — it is the live Anakin Wire catalog count.
5. **MapLibre is 293 KB gzipped**, lazy-loaded as its own chunk. Initial JS is
   ~83 KB gzipped.
6. **Mined event IDs are content hashes** of `platform|title|date`. An upstream
   title tweak changes the ID.
7. **The dictation path itself is untested** outside a browser — it is an
   OS-level keystroke stream, so there is nothing to assert against in Node.
   Everything after the words arrive is covered by `check-ask.ts`.
