"""
scrapers/parser.py – AI-powered event parser.

Takes raw markdown returned by Anakin and extracts structured Event objects
using GPT-style extraction via Anakin's /ai-extract endpoint (or falls back
to a robust regex/heuristic parser if the AI endpoint is unavailable).
"""

from __future__ import annotations

import re
import json
import logging
from datetime import datetime
from typing import List, Optional

import requests

import config
from models.event import Event

logger = logging.getLogger(__name__)


# ─── Extraction prompt template ────────────────────────────────────────────────

EXTRACTION_PROMPT = """
You are an event data extraction assistant.
Given the following markdown content scraped from an events listing page,
extract ALL events and return them as a valid JSON array.

Each event object must have these fields (use empty string "" if unknown):
- title          : event name
- description    : short description (≤ 200 chars)
- date_start     : start date/time in format YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS
- date_end       : end date/time (same format) or ""
- venue          : venue/hall name
- address        : full address string
- city           : city (e.g. Delhi, Noida, Online, Virtual)
- mode           : "online", "offline", or "hybrid"
- organizer      : organizer name
- organizer_url  : organizer profile URL or ""
- event_url      : URL of the individual event page
- registration_url: registration/ticket URL or same as event_url
- price          : price string e.g. "Free", "₹500", "Paid", or ""
- tags           : array of relevant tags

Return ONLY the JSON array, no extra text.

Markdown content:
{markdown}
"""


class EventParser:
    """
    Parses raw markdown → List[Event] using Anakin's AI extraction endpoint
    with a heuristic fallback.
    """

    def __init__(self, anakin_session: requests.Session) -> None:
        self._session = anakin_session

    # ── Public ─────────────────────────────────────────────────────────────────

    def parse(
        self,
        markdown: str,
        platform: str,
        themes: List[str],
        source_url: str = "",
    ) -> List[Event]:
        """
        Try AI extraction first; fall back to heuristic parsing.

        Parameters
        ----------
        markdown   : Raw markdown from Anakin scrape
        platform   : Name of the source platform (e.g. "Devfolio")
        themes     : Expected themes for this platform
        source_url : The URL that was scraped (used as fallback event_url)
        """
        if not markdown or len(markdown.strip()) < 50:
            logger.warning("Empty or too-short markdown for %s; skipping.", platform)
            return []

        raw_events: List[dict] = []

        # 1. Try Anakin AI extraction
        try:
            raw_events = self._ai_extract(markdown)
        except Exception as exc:
            logger.warning("AI extraction failed for %s (%s); using heuristics.", platform, exc)

        # 2. Heuristic fallback
        if not raw_events:
            raw_events = self._heuristic_extract(markdown, source_url)

        # 3. Map to Event objects and apply filters
        events: List[Event] = []
        for raw in raw_events:
            event = self._map_to_event(raw, platform, themes, source_url)
            if event and self._passes_filters(event):
                events.append(event)

        logger.info("Extracted %d events from %s", len(events), platform)
        return events

    # ── AI extraction via Anakin ───────────────────────────────────────────────

    def _ai_extract(self, markdown: str) -> List[dict]:
        """Call Anakin's AI-extract endpoint with the event extraction prompt."""
        prompt = EXTRACTION_PROMPT.format(markdown=markdown[:12000])  # trim for token limits

        payload = {
            "prompt": prompt,
            "response_format": "json",
        }
        resp = self._session.post(
            f"{config.ANAKIN_BASE_URL}/ai-extract",
            json=payload,
            timeout=60,
        )
        resp.raise_for_status()
        data = resp.json()

        # Anakin may return the text in different keys
        text = (
            data.get("result")
            or data.get("output")
            or data.get("text")
            or ""
        )
        # Strip markdown code fences if present
        text = re.sub(r"^```(?:json)?\s*", "", text.strip())
        text = re.sub(r"\s*```$", "", text.strip())

        parsed = json.loads(text)
        if isinstance(parsed, list):
            return parsed
        if isinstance(parsed, dict) and "events" in parsed:
            return parsed["events"]
        return []

    # ── Heuristic extraction ───────────────────────────────────────────────────

    def _heuristic_extract(self, markdown: str, source_url: str) -> List[dict]:
        """
        Regex/heuristic fallback parser.
        Attempts to find date-like patterns and headings that look like events.
        """
        events: List[dict] = []

        # Split on markdown headings (## or ###)
        sections = re.split(r"\n#{1,3}\s+", markdown)

        for section in sections[1:]:  # skip preamble
            lines = [l.strip() for l in section.strip().splitlines() if l.strip()]
            if not lines:
                continue

            title = lines[0].rstrip("#").strip()

            # Skip obvious non-event headings
            if len(title) < 5 or title.lower() in {
                "events", "upcoming events", "past events", "filter", "menu",
                "sign in", "sign up", "login", "register",
            }:
                continue

            body = " ".join(lines[1:])

            # ── Extract date ──────────────────────────────────────────────────
            date_start = self._extract_date(body)

            # ── Extract URL ───────────────────────────────────────────────────
            url_match = re.search(r"\[.*?\]\((https?://[^\)]+)\)", section)
            event_url = url_match.group(1) if url_match else source_url

            # ── Extract price ─────────────────────────────────────────────────
            price = ""
            if re.search(r"\bfree\b", body, re.I):
                price = "Free"
            elif price_m := re.search(r"[₹$€£]\s?[\d,]+", body):
                price = price_m.group(0)
            elif re.search(r"\bpaid\b", body, re.I):
                price = "Paid"

            # ── Detect mode ───────────────────────────────────────────────────
            mode = "offline"
            if re.search(r"\b(online|virtual|remote|zoom|webinar|livestream)\b", body, re.I):
                mode = "online"
            elif re.search(r"\bhybrid\b", body, re.I):
                mode = "hybrid"

            # ── Detect city ───────────────────────────────────────────────────
            city = self._extract_city(body)

            events.append(
                {
                    "title": title,
                    "description": body[:200],
                    "date_start": date_start,
                    "date_end": "",
                    "venue": "",
                    "address": "",
                    "city": city,
                    "mode": mode,
                    "organizer": "",
                    "organizer_url": "",
                    "event_url": event_url,
                    "registration_url": event_url,
                    "price": price,
                    "tags": [],
                }
            )

        return events

    # ── Mapping & filtering ────────────────────────────────────────────────────

    def _map_to_event(
        self,
        raw: dict,
        platform: str,
        themes: List[str],
        source_url: str,
    ) -> Optional[Event]:
        """Convert a raw dict to an Event, inferring missing fields."""
        try:
            combined_text = (
                (raw.get("title") or "")
                + " "
                + (raw.get("description") or "")
                + " "
                + " ".join(raw.get("tags") or [])
            ).lower()

            # Infer theme from text if not deterministic
            inferred_theme = self._infer_theme(combined_text, themes)

            # Infer city if missing
            city = raw.get("city") or self._extract_city(combined_text)
            if not city:
                city = "Delhi NCR"  # default assumption for this scraper

            return Event(
                title=raw.get("title", "").strip(),
                description=(raw.get("description") or "")[:300],
                date_start=raw.get("date_start", ""),
                date_end=raw.get("date_end", ""),
                venue=raw.get("venue", ""),
                address=raw.get("address", ""),
                city=city,
                mode=raw.get("mode", "").lower(),
                theme=inferred_theme,
                tags=raw.get("tags") or [],
                organizer=raw.get("organizer", ""),
                organizer_url=raw.get("organizer_url", ""),
                event_url=raw.get("event_url") or source_url,
                registration_url=raw.get("registration_url") or raw.get("event_url") or source_url,
                price=raw.get("price", ""),
                platform=platform,
            )
        except Exception as exc:
            logger.debug("Failed to map raw event to Event object: %s | %s", raw, exc)
            return None

    def _passes_filters(self, event: Event) -> bool:
        """Return True if the event matches location and (loosely) date filters."""
        # Must have a title
        if not event.title:
            return False

        # Location filter – must contain a known city/online keyword
        location_text = (
            f"{event.city} {event.venue} {event.address} {event.mode}"
        ).lower()
        location_ok = any(kw in location_text for kw in config.LOCATION_KEYWORDS)
        if not location_ok:
            return False

        # Soft date filter – if we managed to extract a date, check it
        if event.date_start:
            try:
                ds = event.date_start[:10]
                event_date = datetime.strptime(ds, "%Y-%m-%d")
                if not (config.DATE_FROM <= event_date <= config.DATE_TO):
                    return False
            except ValueError:
                pass  # unparseable date → keep the event

        return True

    # ── Utility helpers ────────────────────────────────────────────────────────

    @staticmethod
    def _extract_date(text: str) -> str:
        """Extract a date string from free text."""
        patterns = [
            r"\b(\d{4}-\d{2}-\d{2})\b",                             # 2024-11-01
            r"\b(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})\b",  # 1 Nov 2024
            r"\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4})\b",  # Nov 1, 2024
            r"\b(\d{1,2}/\d{1,2}/\d{4})\b",                         # 1/11/2024
        ]
        for pattern in patterns:
            m = re.search(pattern, text, re.I)
            if m:
                return m.group(1)
        return ""

    @staticmethod
    def _extract_city(text: str) -> str:
        """Return the first matching city keyword found in text."""
        for kw in config.LOCATION_KEYWORDS:
            if kw in text.lower():
                # Capitalise nicely
                return kw.title()
        return ""

    @staticmethod
    def _infer_theme(text: str, preferred_themes: List[str]) -> str:
        """
        Scan text for theme keywords and return the best-matching theme.
        Falls back to the first item in preferred_themes.
        """
        for theme, keywords in config.THEME_KEYWORDS.items():
            if any(kw in text for kw in keywords):
                return theme
        return preferred_themes[0] if preferred_themes else "general"
