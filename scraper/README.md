# 🎯 Delhi NCR Events Scraper

A Python scraper powered by the **Anakin URL Scraper API** that collects events happening **today and the coming week** in **Delhi NCR and online** across themes: **Hackathons, Programming, Music, Automobile, and Food**.

---

## 📦 Platforms Scraped

| Platform | Themes |
|---|---|
| WeMakeDevs | Hackathon, Programming |
| Devfolio | Hackathon, Programming |
| Unstop | Hackathon, Programming |
| Lu.ma | All themes |
| Meetup | Programming, Food, Music |
| AllEvents.in | All themes |
| 10times | All themes |
| Insider.in | Music, Food |
| BookMyShow | Music, Food, Automobile |
| Eventbrite | Hackathon, Programming |

---

## 🚀 Quick Start

### 1. Clone / enter the directory
```bash
cd event_scraper
```

### 2. Install dependencies
```bash
pip install -r requirements.txt
```

### 3. Set your API key
```bash
cp .env.example .env
# Edit .env and add: ANAKIN_API_KEY=your_key_here
```
Get your free Anakin API key at → https://anakin.io

### 4. Run
```bash
python scraper.py
```

---

## 🛠 CLI Options

```
python scraper.py [OPTIONS]

Options:
  --dry-run              Print all targets and exit (no API calls)
  --platforms NAME,...   Only scrape specific platforms (comma-separated)
  --themes THEME,...     Only collect specific themes
  --output PATH          Override output JSON file path
  --concurrency N        Parallel scrape jobs (default: 5)
  --verbose              Enable DEBUG logging
  -h, --help             Show this message
```

### Examples
```bash
# Dry run – see all targets
python scraper.py --dry-run

# Only hackathon platforms
python scraper.py --themes "hackathon,programming"

# Only WeMakeDevs + Devfolio
python scraper.py --platforms "WeMakeDevs,Devfolio"

# Custom output path
python scraper.py --output my_events.json
```

---

## 📊 Output

Results are saved to `output/`:

| File | Description |
|---|---|
| `events_YYYY-MM-DD.json` | Full structured event data (JSON array) |
| `events_YYYY-MM-DD.csv`  | Spreadsheet-friendly version |

### Event Fields

| Field | Description |
|---|---|
| `title` | Event name |
| `description` | Short description |
| `date_start` | Start date/time (ISO 8601) |
| `date_end` | End date/time |
| `venue` | Venue name |
| `address` | Full address |
| `city` | City (Delhi / NCR / Online) |
| `mode` | online / offline / hybrid |
| `theme` | hackathon / programming / music / automobile / food |
| `tags` | Array of tags |
| `organizer` | Organizer name |
| `organizer_url` | Organizer profile URL |
| `event_url` | Event page URL |
| `registration_url` | Registration link |
| `price` | Price ("Free", "₹500", "Paid") |
| `platform` | Source platform name |
| `scraped_at` | Scrape timestamp (UTC) |

---

## 🏗 Architecture

```
event_scraper/
├── scraper.py           ← Main entry point (run this)
├── config.py            ← All URLs, keywords, date ranges
├── scrapers/
│   ├── base.py          ← Anakin API client (job submit + poll)
│   └── parser.py        ← AI extraction + heuristic fallback
├── models/
│   └── event.py         ← Event dataclass
├── output/              ← JSON + CSV output (auto-created)
├── requirements.txt
└── .env.example
```

---

## 🔧 How it works

1. **Submit** – Each platform URL is submitted as a scrape job to Anakin's `/v1/url-scraper` endpoint.
2. **Poll** – The scraper polls the job status with exponential back-off until complete.
3. **Extract** – Raw markdown is sent to Anakin's AI extraction endpoint using a structured prompt to extract event fields.
4. **Fallback** – If AI extraction fails, a regex/heuristic parser extracts events from markdown headings.
5. **Filter** – Events are filtered by location (Delhi NCR / Online) and date range (today + 7 days).
6. **Deduplicate** – Near-duplicate events (same title + date) are removed.
7. **Output** – Results saved as JSON + CSV, summary table printed in terminal.
