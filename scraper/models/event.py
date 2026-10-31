"""
models/event.py – Event dataclass used across all scrapers.
"""

from __future__ import annotations
from dataclasses import dataclass, field, asdict
from typing import List, Optional
from datetime import datetime, timezone


@dataclass
class Event:
    """Represents a single scraped event."""

    # ── Core identity ─────────────────────────────────────────────────────────
    title: str = ""
    description: str = ""

    # ── Dates ─────────────────────────────────────────────────────────────────
    date_start: str = ""   # ISO 8601 or human-readable if unparseable
    date_end: str = ""

    # ── Location ──────────────────────────────────────────────────────────────
    venue: str = ""        # Venue / hall name
    address: str = ""      # Full address string
    city: str = ""         # Delhi / NCR / Online
    mode: str = ""         # "offline" | "online" | "hybrid"

    # ── Theme ─────────────────────────────────────────────────────────────────
    theme: str = ""        # hackathon | programming | music | automobile | food
    tags: List[str] = field(default_factory=list)

    # ── Organizer ─────────────────────────────────────────────────────────────
    organizer: str = ""
    organizer_url: str = ""

    # ── Registration / Ticketing ──────────────────────────────────────────────
    event_url: str = ""
    registration_url: str = ""
    price: str = ""        # "Free" | "₹500" | "Paid" | ""

    # ── Meta ──────────────────────────────────────────────────────────────────
    platform: str = ""     # Source platform name
    # datetime.utcnow() is deprecated (3.12+) and returns a NAIVE datetime, so
    # appending "Z" claimed UTC without being UTC-aware. This is genuinely UTC.
    scraped_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )

    def to_dict(self) -> dict:
        return asdict(self)
