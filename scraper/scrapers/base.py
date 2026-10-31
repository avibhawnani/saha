"""
scrapers/base.py – AnakinScraper base class.

Handles all communication with the Anakin URL Scraper API:
  - Submitting scrape jobs
  - Polling for results with exponential back-off
  - Returning clean markdown content for downstream parsing
"""

from __future__ import annotations

import time
import logging
from typing import Optional

import requests

import config

logger = logging.getLogger(__name__)


class AnakinScraper:
    """
    Thin wrapper around the Anakin URL-Scraper REST API.

    Usage
    -----
    scraper = AnakinScraper()
    markdown = scraper.fetch_markdown("https://example.com/events")
    """

    BASE_URL = config.ANAKIN_BASE_URL

    def __init__(self, api_key: Optional[str] = None) -> None:
        key = api_key or config.ANAKIN_API_KEY
        if not key:
            raise ValueError(
                "ANAKIN_API_KEY is not set. "
                "Copy .env.example → .env and add your key."
            )
        self.session = requests.Session()
        self.session.headers.update(
            {
                "X-API-Key": key,
                "Content-Type": "application/json",
            }
        )

    # ── Public API ─────────────────────────────────────────────────────────────

    def fetch_markdown(self, url: str) -> str:
        """
        Scrape *url* via Anakin and return the cleaned markdown string.

        Raises
        ------
        RuntimeError   if the job fails or the API returns an error.
        TimeoutError   if the job doesn't complete within the configured limit.
        """
        job_id = self._submit_job(url)
        result = self._poll_job(job_id, url)
        return result.get("markdown") or result.get("content") or ""

    def fetch_json_structured(self, url: str, schema_hint: str = "") -> dict:
        """
        Scrape *url* and return structured JSON (when supported by Anakin).
        Falls back to returning the raw markdown in a dict.
        """
        job_id = self._submit_job(url, schema_hint=schema_hint)
        result = self._poll_job(job_id, url)
        if "json" in result:
            return result["json"]
        # Fallback
        return {"markdown": result.get("markdown", "")}

    # ── Private helpers ────────────────────────────────────────────────────────

    def _submit_job(self, url: str, schema_hint: str = "") -> str:
        """POST to the URL-scraper endpoint and return the job ID."""
        payload: dict = {"url": url}
        if schema_hint:
            payload["schema_hint"] = schema_hint

        logger.debug("Submitting Anakin scrape job for: %s", url)

        resp = self.session.post(f"{self.BASE_URL}/url-scraper", json=payload)
        resp.raise_for_status()
        data = resp.json()

        job_id: Optional[str] = data.get("jobId") or data.get("job_id") or data.get("id")
        if not job_id:
            raise RuntimeError(
                f"Anakin did not return a job ID for {url}. Response: {data}"
            )

        logger.debug("Job submitted – ID: %s", job_id)
        return job_id

    def _poll_job(self, job_id: str, url: str) -> dict:
        """Poll job status until completed/failed. Returns the result dict."""
        interval = config.ANAKIN_POLL_INTERVAL
        for attempt in range(1, config.ANAKIN_MAX_POLLS + 1):
            resp = self.session.get(f"{self.BASE_URL}/url-scraper/{job_id}")
            resp.raise_for_status()
            data = resp.json()

            status = data.get("status", "").lower()
            logger.debug("Poll %d/%d – status: %s", attempt, config.ANAKIN_MAX_POLLS, status)

            if status == "completed":
                return data
            if status in ("failed", "error"):
                raise RuntimeError(
                    f"Anakin scrape failed for {url}. Details: {data.get('error', data)}"
                )

            # Exponential back-off capped at 30 s
            time.sleep(min(interval * (1.2 ** (attempt - 1)), 30))

        raise TimeoutError(
            f"Anakin scrape job {job_id} did not complete within "
            f"{config.ANAKIN_MAX_POLLS} polls for URL: {url}"
        )
