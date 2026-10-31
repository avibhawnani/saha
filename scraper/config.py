"""
config.py – Central configuration for the Delhi NCR Events Scraper.

All platform URLs, theme keywords, location keywords, and date-range
settings are defined here so they are easy to update without touching
scraper logic.
"""

from __future__ import annotations
import os
from datetime import datetime, timedelta
from dotenv import load_dotenv

load_dotenv()

# ─── Anakin API ────────────────────────────────────────────────────────────────
ANAKIN_API_KEY: str = os.getenv("ANAKIN_API_KEY", "")
ANAKIN_BASE_URL: str = "https://api.anakin.io/v1"
ANAKIN_POLL_INTERVAL: int = 4        # seconds between status polls
ANAKIN_MAX_POLLS: int = 60           # max polls before timeout
ANAKIN_CONCURRENCY: int = 5          # parallel scrape jobs

# ─── Date Range ────────────────────────────────────────────────────────────────
TODAY: datetime = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
DATE_FROM: datetime = TODAY
DATE_TO: datetime = TODAY + timedelta(days=7)

DATE_FROM_STR: str = DATE_FROM.strftime("%Y-%m-%d")
DATE_TO_STR:   str = DATE_TO.strftime("%Y-%m-%d")

# ─── Theme Keywords ────────────────────────────────────────────────────────────
THEME_KEYWORDS: dict[str, list[str]] = {
    "hackathon": [
        "hackathon", "hack", "buildathon", "codeathon",
        "datathon", "ideathon", "thon",
    ],
    "programming": [
        "programming", "coding", "developer", "devops", "software",
        "open source", "web dev", "python", "javascript", "ai", "ml",
        "machine learning", "blockchain", "web3", "tech meetup",
        "workshop", "bootcamp", "devrel",
    ],
    "music": [
        "music", "concert", "gig", "band", "dj", "festival",
        "live music", "indie", "rock", "jazz", "classical",
        "electronic", "edm", "rap", "hip hop",
    ],
    "automobile": [
        "automobile", "car", "auto", "motor", "bike", "motorcycle",
        "auto expo", "car show", "motor show", "drive", "rally",
        "test drive", "ev", "electric vehicle",
    ],
    "food": [
        "food", "culinary", "chef", "restaurant", "cuisine", "dining",
        "foodie", "tasting", "bake", "cook", "brunch", "dinner",
        "food fest", "street food", "food fair",
    ],
}

ALL_THEME_KEYWORDS: list[str] = [kw for kws in THEME_KEYWORDS.values() for kw in kws]

# ─── Location Keywords ─────────────────────────────────────────────────────────
LOCATION_KEYWORDS: list[str] = [
    "delhi", "new delhi", "ncr", "noida", "gurgaon", "gurugram",
    "faridabad", "ghaziabad", "greater noida", "dwarka", "rohini",
    "connaught place", "cp ", "lajpat", "saket", "online", "virtual",
    "remote", "anywhere",
]

# ─── Platform URLs to Scrape ───────────────────────────────────────────────────
# Each entry: {name, url, themes, notes}
SCRAPE_TARGETS: list[dict] = [
    # ── WeMakeDevs ──────────────────────────────────────────────────────────
    {
        "name": "WeMakeDevs",
        "url": "https://www.wemakedevs.org/hackathons",
        "themes": ["hackathon", "programming"],
        "notes": "WeMakeDevs community hackathons listing",
    },
    {
        "name": "WeMakeDevs Events",
        "url": "https://www.wemakedevs.org/events",
        "themes": ["hackathon", "programming"],
        "notes": "WeMakeDevs community events",
    },

    # ── Devfolio ─────────────────────────────────────────────────────────────
    {
        "name": "Devfolio",
        "url": "https://devfolio.co/hackathons",
        "themes": ["hackathon", "programming"],
        "notes": "Premier platform for open-source/tech hackathons in India",
    },

    # ── Unstop (formerly Dare2Compete) ────────────────────────────────────────
    {
        "name": "Unstop – Hackathons Delhi",
        "url": "https://unstop.com/hackathons?city=New+Delhi&oppstatus=open",
        "themes": ["hackathon", "programming"],
        "notes": "Top platform for college & corporate hackathons",
    },
    {
        "name": "Unstop – Competitions Delhi",
        "url": "https://unstop.com/competitions?city=New+Delhi&oppstatus=open",
        "themes": ["hackathon", "programming"],
        "notes": "College competitions in Delhi NCR",
    },

    # ── Lu.ma ────────────────────────────────────────────────────────────────
    {
        "name": "Lu.ma – Delhi",
        "url": "https://lu.ma/delhi",
        "themes": ["hackathon", "programming", "music", "food", "automobile"],
        "notes": "Community events hub – delhi",
    },
    {
        "name": "Lu.ma – New Delhi",
        "url": "https://lu.ma/new-delhi",
        "themes": ["hackathon", "programming", "music", "food", "automobile"],
        "notes": "Community events hub – new-delhi",
    },

    # ── Meetup ───────────────────────────────────────────────────────────────
    {
        "name": "Meetup – Delhi Tech",
        "url": "https://www.meetup.com/find/?location=Delhi%2C+India&source=EVENTS&keywords=tech",
        "themes": ["programming", "hackathon"],
        "notes": "Tech meetups in Delhi via Meetup.com",
    },
    {
        "name": "Meetup – Delhi Food",
        "url": "https://www.meetup.com/find/?location=Delhi%2C+India&source=EVENTS&keywords=food",
        "themes": ["food"],
        "notes": "Food events in Delhi via Meetup.com",
    },
    {
        "name": "Meetup – Delhi Music",
        "url": "https://www.meetup.com/find/?location=Delhi%2C+India&source=EVENTS&keywords=music",
        "themes": ["music"],
        "notes": "Music events in Delhi via Meetup.com",
    },

    # ── AllEvents.in ─────────────────────────────────────────────────────────
    {
        "name": "AllEvents – Delhi Hackathon",
        "url": "https://allevents.in/delhi/hackathon",
        "themes": ["hackathon", "programming"],
        "notes": "AllEvents hackathon listing for Delhi",
    },
    {
        "name": "AllEvents – Delhi Music",
        "url": "https://allevents.in/delhi/music",
        "themes": ["music"],
        "notes": "AllEvents music listing for Delhi",
    },
    {
        "name": "AllEvents – Delhi Food",
        "url": "https://allevents.in/delhi/food-and-drink",
        "themes": ["food"],
        "notes": "AllEvents food listing for Delhi",
    },
    {
        "name": "AllEvents – Delhi Automobile",
        "url": "https://allevents.in/delhi/automobile",
        "themes": ["automobile"],
        "notes": "AllEvents automobile listing for Delhi",
    },

    # ── 10times ──────────────────────────────────────────────────────────────
    {
        "name": "10times – Delhi Events",
        "url": "https://10times.com/delhi",
        "themes": ["hackathon", "programming", "music", "food", "automobile"],
        "notes": "Comprehensive B2B and consumer events in Delhi",
    },

    # ── Insider.in ───────────────────────────────────────────────────────────
    {
        "name": "Insider.in – Delhi Music",
        "url": "https://insider.in/delhi/music",
        "themes": ["music"],
        "notes": "Live concerts & music events in Delhi",
    },
    {
        "name": "Insider.in – Delhi Food",
        "url": "https://insider.in/delhi/food",
        "themes": ["food"],
        "notes": "Food festivals and culinary events in Delhi",
    },

    # ── BookMyShow ───────────────────────────────────────────────────────────
    {
        "name": "BookMyShow – Delhi Music",
        "url": "https://in.bookmyshow.com/explore/music-delhi",
        "themes": ["music"],
        "notes": "Concerts & live shows in Delhi NCR",
    },
    {
        "name": "BookMyShow – Delhi Events",
        "url": "https://in.bookmyshow.com/explore/events-delhi",
        "themes": ["food", "automobile", "hackathon"],
        "notes": "General events listing in Delhi",
    },

    # ── EventBrite ───────────────────────────────────────────────────────────
    {
        "name": "Eventbrite – Delhi Hackathon",
        "url": "https://www.eventbrite.com/d/india--new-delhi/hackathon/",
        "themes": ["hackathon", "programming"],
        "notes": "Eventbrite hackathons in Delhi",
    },
    {
        "name": "Eventbrite – Delhi Online Tech",
        "url": "https://www.eventbrite.com/d/online/tech/",
        "themes": ["programming", "hackathon"],
        "notes": "Online tech events on Eventbrite",
    },
]

# ─── Output ────────────────────────────────────────────────────────────────────
OUTPUT_DIR: str = "output"
OUTPUT_JSON: str = f"{OUTPUT_DIR}/events_{TODAY.strftime('%Y-%m-%d')}.json"
OUTPUT_CSV:  str = f"{OUTPUT_DIR}/events_{TODAY.strftime('%Y-%m-%d')}.csv"
