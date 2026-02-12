"""
HTTP transport – POSTs plaintext log buffers to the Worker API.
Falls back to local JSON files when the server is unreachable.
"""

import json
import logging
import time
from datetime import datetime
from pathlib import Path

import requests

from config import (
    API_URL,
    CLIENT_ID,
    UPLOAD_RETRY_COUNT,
    UPLOAD_RETRY_DELAY,
    FALLBACK_LOG_DIR,
)

log = logging.getLogger(__name__)


class Transport:
    def __init__(self, session_id: str) -> None:
        self._session_id = session_id
        self._http = requests.Session()
        self._http.headers.update({"Content-Type": "application/json"})
        self._url = f"{API_URL.rstrip('/')}/api/upload"

    def upload(self, data: str) -> bool:
        payload: dict = {
            "clientId": CLIENT_ID,
            "sessionId": self._session_id,
            "data": data,
            "timestamp": datetime.utcnow().isoformat() + "Z",
        }

        for attempt in range(1, UPLOAD_RETRY_COUNT + 1):
            try:
                r = self._http.post(self._url, json=payload, timeout=10)
                if r.status_code == 200:
                    log.debug("Uploaded (%d)", attempt)
                    return True
                log.warning("HTTP %d (%d/%d): %s",
                            r.status_code, attempt, UPLOAD_RETRY_COUNT, r.text[:200])
            except requests.RequestException as e:
                log.warning("Error (%d/%d): %s", attempt, UPLOAD_RETRY_COUNT, e)

            if attempt < UPLOAD_RETRY_COUNT:
                time.sleep(UPLOAD_RETRY_DELAY)

        log.error("All retries failed - saving locally.")
        self._save_local(payload)
        return False

    def _save_local(self, payload: dict) -> None:
        FALLBACK_LOG_DIR.mkdir(parents=True, exist_ok=True)
        ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S%f")
        fp = FALLBACK_LOG_DIR / f"log_{ts}.json"
        try:
            fp.write_text(json.dumps(payload, indent=2))
            log.info("Saved fallback: %s", fp)
        except OSError as e:
            log.error("Fallback save failed: %s", e)

    def flush_pending(self) -> int:
        if not FALLBACK_LOG_DIR.exists():
            return 0
        uploaded = 0
        for fp in sorted(FALLBACK_LOG_DIR.glob("log_*.json")):
            try:
                payload = json.loads(fp.read_text())
                r = self._http.post(self._url, json=payload, timeout=10)
                if r.status_code == 200:
                    fp.unlink()
                    uploaded += 1
                else:
                    break
            except Exception:
                break
        return uploaded

    def close(self) -> None:
        self._http.close()
