"""Nightly late-fee sweep at 00:15 UTC — architecture §05.2 / FR-10.

Docker Compose runs this as a long-lived loop. Render Cron runs `--once` and exits.
"""
from __future__ import annotations

import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone


def seconds_until_0015_utc() -> float:
    now = datetime.now(timezone.utc)
    target = now.replace(hour=0, minute=15, second=0, microsecond=0)
    if now >= target:
        target += timedelta(days=1)
    return max(1.0, (target - now).total_seconds())


def api_base() -> str:
    api = os.environ.get("API_URL", "http://api:8000").rstrip("/")
    if not api.startswith(("http://", "https://")):
        api = "http://" + api
    return api


def run_sweep() -> None:
    token = os.environ.get("INTERNAL_SWEEP_TOKEN", "")
    url = f"{api_base()}/api/internal/late-fee-sweep"
    req = urllib.request.Request(
        url,
        method="POST",
        headers={"Authorization": f"Bearer {token}"},
        data=b"",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            print(f"{datetime.now(timezone.utc).isoformat()} sweep OK: {body}")
    except urllib.error.URLError as exc:
        print(f"{datetime.now(timezone.utc).isoformat()} sweep failed: {exc}")
        raise


def main() -> None:
    once = "--once" in sys.argv or os.environ.get("SWEEP_ONCE") == "1"
    if once:
        try:
            run_sweep()
        except Exception:
            sys.exit(1)
        return

    print(
        "Late-fee scheduler started — fires daily at 00:15 UTC via POST /api/internal/late-fee-sweep"
    )
    while True:
        wait = seconds_until_0015_utc()
        print(f"Sleeping {wait:.0f}s until next 00:15 UTC…")
        time.sleep(wait)
        try:
            run_sweep()
        except Exception:
            pass
        time.sleep(60)  # avoid double-fire in the same minute


if __name__ == "__main__":
    main()
