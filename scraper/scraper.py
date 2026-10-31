"""
scraper.py – Main orchestration script for the Delhi NCR Events Scraper.

Usage
-----
# Basic run (uses ANAKIN_API_KEY from .env):
python scraper.py

# Dry-run (validates config, prints targets, no API calls):
python scraper.py --dry-run

# Limit to specific platforms:
python scraper.py --platforms "WeMakeDevs,Devfolio"

# Limit to specific themes:
python scraper.py --themes "hackathon,programming"

# Save output to custom path:
python scraper.py --output my_events.json

Output
------
JSON and CSV files are saved to the output/ directory.
A rich summary table is printed to the terminal.
"""

from __future__ import annotations

import argparse
import csv
import json
import logging
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import List, Optional

# ── Third-party ──────────────────────────────────────────────────────────────
try:
    from rich.console import Console
    from rich.table import Table
    from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TimeElapsedColumn
    from rich.panel import Panel
    from rich import print as rprint
    RICH_AVAILABLE = True
except ImportError:
    RICH_AVAILABLE = False

# ── Internal ──────────────────────────────────────────────────────────────────
import config
from models.event import Event
from scrapers.base import AnakinScraper
from scrapers.parser import EventParser

# ── Logging setup ─────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s – %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("scraper")


# ─────────────────────────────────────────────────────────────────────────────
# Core scraping logic
# ─────────────────────────────────────────────────────────────────────────────

def scrape_target(
    target: dict,
    anakin: AnakinScraper,
    parser: EventParser,
) -> List[Event]:
    """
    Scrape a single target dict and return extracted Event objects.

    Parameters
    ----------
    target  : One entry from config.SCRAPE_TARGETS
    anakin  : AnakinScraper instance
    parser  : EventParser instance
    """
    name = target["name"]
    url  = target["url"]
    themes = target.get("themes", ["general"])

    try:
        logger.info("⬇  Fetching: %s  →  %s", name, url)
        markdown = anakin.fetch_markdown(url)

        if not markdown:
            logger.warning("No content returned for %s", name)
            return []

        events = parser.parse(
            markdown=markdown,
            platform=name,
            themes=themes,
            source_url=url,
        )
        logger.info("✓  %s → %d events extracted", name, len(events))
        return events

    except TimeoutError as exc:
        logger.error("TIMEOUT for %s: %s", name, exc)
    except Exception as exc:
        logger.error("ERROR scraping %s: %s", name, exc)

    return []


def scrape_all(
    targets: List[dict],
    anakin: AnakinScraper,
    parser: EventParser,
    concurrency: int = config.ANAKIN_CONCURRENCY,
) -> List[Event]:
    """
    Scrape all targets concurrently (up to `concurrency` parallel jobs).
    Returns a de-duplicated, sorted list of Event objects.
    """
    all_events: List[Event] = []

    if RICH_AVAILABLE:
        console = Console()
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            TextColumn("[progress.percentage]{task.percentage:>3.0f}%"),
            TimeElapsedColumn(),
            console=console,
            transient=True,
        ) as progress:
            task = progress.add_task(
                f"[cyan]Scraping {len(targets)} platforms…", total=len(targets)
            )

            with ThreadPoolExecutor(max_workers=concurrency) as executor:
                futures = {
                    executor.submit(scrape_target, t, anakin, parser): t
                    for t in targets
                }
                for future in as_completed(futures):
                    events = future.result()
                    all_events.extend(events)
                    progress.advance(task)
    else:
        with ThreadPoolExecutor(max_workers=concurrency) as executor:
            futures = {
                executor.submit(scrape_target, t, anakin, parser): t
                for t in targets
            }
            for future in as_completed(futures):
                events = future.result()
                all_events.extend(events)

    return deduplicate_events(all_events)


def deduplicate_events(events: List[Event]) -> List[Event]:
    """Remove near-duplicate events by normalised title + date."""
    seen: set = set()
    unique: List[Event] = []
    for ev in events:
        key = (
            re.sub(r"\s+", " ", ev.title.lower().strip()),
            ev.date_start[:10] if ev.date_start else "",
        )
        if key not in seen:
            seen.add(key)
            unique.append(ev)
    return sorted(unique, key=lambda e: (e.date_start or "9999", e.title))


# ─────────────────────────────────────────────────────────────────────────────
# Output helpers
# ─────────────────────────────────────────────────────────────────────────────

def save_json(events: List[Event], path: str) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump([e.to_dict() for e in events], f, ensure_ascii=False, indent=2)
    logger.info("JSON saved → %s", path)


def save_csv(events: List[Event], path: str) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    if not events:
        return
    fieldnames = list(events[0].to_dict().keys())
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for ev in events:
            d = ev.to_dict()
            d["tags"] = ", ".join(d.get("tags") or [])
            writer.writerow(d)
    logger.info("CSV saved → %s", path)


def print_summary(events: List[Event]) -> None:
    """Print a rich summary table (or plain-text fallback)."""
    if not events:
        print("\n⚠  No events found matching the filters.\n")
        return

    if RICH_AVAILABLE:
        console = Console()
        table = Table(
            title=f"🎉  Delhi NCR Events  |  {config.DATE_FROM_STR} → {config.DATE_TO_STR}",
            show_header=True,
            header_style="bold magenta",
            border_style="bright_blue",
            row_styles=["", "dim"],
        )
        table.add_column("#",     style="dim",    width=4)
        table.add_column("Title",               width=35)
        table.add_column("Theme",               width=12)
        table.add_column("Date",                width=12)
        table.add_column("City / Mode",         width=14)
        table.add_column("Organizer",           width=16)
        table.add_column("Price",               width=8)
        table.add_column("Platform",            width=16)

        for i, ev in enumerate(events, 1):
            table.add_row(
                str(i),
                ev.title[:34],
                ev.theme,
                ev.date_start[:10] if ev.date_start else "—",
                f"{ev.city[:10]} / {ev.mode[:7]}" if ev.city else ev.mode,
                ev.organizer[:15] or "—",
                ev.price or "—",
                ev.platform[:15],
            )

        console.print(table)
        console.print(
            Panel(
                f"[bold green]Total events found:[/bold green] {len(events)}\n"
                f"[bold cyan]Output JSON:[/bold cyan] {config.OUTPUT_JSON}\n"
                f"[bold cyan]Output CSV:[/bold cyan]  {config.OUTPUT_CSV}",
                title="Summary",
                border_style="green",
            )
        )
    else:
        print(f"\n{'='*80}")
        print(f"Delhi NCR Events  |  {config.DATE_FROM_STR} → {config.DATE_TO_STR}")
        print(f"{'='*80}")
        for i, ev in enumerate(events, 1):
            print(
                f"{i:3}. [{ev.theme:12}] [{ev.date_start[:10]:10}] "
                f"{ev.title[:40]:40} | {ev.city:10} | {ev.platform}"
            )
        print(f"\nTotal: {len(events)} events\n")


# ─────────────────────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────────────────────

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Delhi NCR Events Scraper using Anakin API",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Print targets and exit without making API calls.",
    )
    p.add_argument(
        "--platforms",
        type=str,
        default="",
        metavar="NAME1,NAME2",
        help="Comma-separated platform names to scrape (default: all).",
    )
    p.add_argument(
        "--themes",
        type=str,
        default="",
        metavar="THEME1,THEME2",
        help="Comma-separated themes to include (default: all).",
    )
    p.add_argument(
        "--output",
        type=str,
        default="",
        metavar="PATH",
        help="Override output JSON path.",
    )
    p.add_argument(
        "--concurrency",
        type=int,
        default=config.ANAKIN_CONCURRENCY,
        help=f"Number of parallel scrape jobs (default: {config.ANAKIN_CONCURRENCY}).",
    )
    p.add_argument(
        "--verbose",
        action="store_true",
        help="Enable DEBUG logging.",
    )
    return p.parse_args()


# ─────────────────────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────────────────────

import re  # needed by deduplicate_events – import here to avoid circular issues


def main() -> None:
    args = parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    # ── Banner ────────────────────────────────────────────────────────────────
    if RICH_AVAILABLE:
        Console().print(
            Panel.fit(
                "[bold cyan]Delhi NCR Events Scraper[/bold cyan]\n"
                f"Date range : [yellow]{config.DATE_FROM_STR}[/yellow] → "
                f"[yellow]{config.DATE_TO_STR}[/yellow]\n"
                f"Powered by : [magenta]Anakin URL Scraper API[/magenta]",
                border_style="cyan",
            )
        )
    else:
        print("=== Delhi NCR Events Scraper ===")
        print(f"Date range: {config.DATE_FROM_STR} → {config.DATE_TO_STR}")

    # ── Filter targets ────────────────────────────────────────────────────────
    targets = config.SCRAPE_TARGETS

    if args.platforms:
        wanted = {p.strip().lower() for p in args.platforms.split(",") if p.strip()}
        # Substring match, not equality: target names carry suffixes such as
        # "Lu.ma - Delhi", so requiring an exact match made `--platforms
        # "Lu.ma"` select nothing and exit without explaining why.
        targets = [
            t for t in targets
            if any(w in t["name"].lower() for w in wanted)
        ]
        logger.info("Platform filter active - %d targets selected.", len(targets))
        if not targets:
            logger.error(
                "No target name contains any of: %s", ", ".join(sorted(wanted))
            )
            logger.error("Available targets:")
            for t in config.SCRAPE_TARGETS:
                logger.error("  - %s", t["name"])

    if args.themes:
        wanted_themes = {t.strip().lower() for t in args.themes.split(",")}
        targets = [
            t for t in targets
            if set(t.get("themes", [])) & wanted_themes
        ]
        logger.info("Theme filter active – %d targets selected.", len(targets))

    if not targets:
        logger.error("No targets match the given filters. Exiting.")
        sys.exit(1)

    # ── Dry run ───────────────────────────────────────────────────────────────
    if args.dry_run:
        print(f"\n{'─'*70}")
        print(f"DRY RUN – {len(targets)} targets would be scraped:")
        print(f"{'─'*70}")
        for i, t in enumerate(targets, 1):
            print(f"  {i:2}. {t['name']:35} {t['url']}")
        print(f"\nDate range: {config.DATE_FROM_STR} → {config.DATE_TO_STR}")
        print(f"Concurrency: {args.concurrency} parallel jobs")
        sys.exit(0)

    # ── Validate API key ──────────────────────────────────────────────────────
    if not config.ANAKIN_API_KEY:
        logger.error(
            "ANAKIN_API_KEY is not set!\n"
            "  1. Copy .env.example to .env\n"
            "  2. Add your Anakin API key\n"
            "  3. Re-run the script."
        )
        sys.exit(1)

    # ── Init Anakin clients ───────────────────────────────────────────────────
    anakin = AnakinScraper()
    parser = EventParser(anakin.session)

    # ── Scrape ────────────────────────────────────────────────────────────────
    logger.info("Starting scrape of %d platforms…", len(targets))
    start_ts = time.time()

    events = scrape_all(targets, anakin, parser, concurrency=args.concurrency)

    elapsed = time.time() - start_ts
    logger.info("Scraping complete in %.1f s – %d unique events found.", elapsed, len(events))

    # ── Save output ───────────────────────────────────────────────────────────
    json_path = args.output or config.OUTPUT_JSON
    csv_path  = json_path.replace(".json", ".csv")

    save_json(events, json_path)
    save_csv(events, csv_path)

    # ── Print summary table ───────────────────────────────────────────────────
    print_summary(events)


if __name__ == "__main__":
    main()
