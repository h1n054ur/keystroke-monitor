"""
Configuration for the keystroke monitor client.
All settings via environment variables with sane defaults.
"""

import os
import socket
from pathlib import Path

# ─── Worker API ─────────────────────────────────────────────────────────────────

API_URL: str = os.environ.get(
    "KM_API_URL",
    "http://localhost:8787",
)

# ─── Client Identity ────────────────────────────────────────────────────────────

CLIENT_ID: str = os.environ.get(
    "KM_CLIENT_ID",
    socket.gethostname(),
)

# ─── Buffering & Upload ─────────────────────────────────────────────────────────

BUFFER_CHAR_LIMIT: int = int(os.environ.get("KM_BUFFER_LIMIT", "200"))
UPLOAD_INTERVAL_SECONDS: float = float(os.environ.get("KM_UPLOAD_INTERVAL", "3"))
UPLOAD_RETRY_COUNT: int = int(os.environ.get("KM_UPLOAD_RETRIES", "2"))
UPLOAD_RETRY_DELAY: float = float(os.environ.get("KM_RETRY_DELAY", "2.0"))

# ─── Logging ────────────────────────────────────────────────────────────────────

MINUTES_BETWEEN_TIMESTAMPS: int = int(os.environ.get("KM_TIMESTAMP_INTERVAL", "5"))

# ─── Local Fallback ─────────────────────────────────────────────────────────────

FALLBACK_LOG_DIR: Path = Path(
    os.environ.get("KM_FALLBACK_DIR", str(Path(__file__).parent / "logs"))
)

# ─── Debug ───────────────────────────────────────────────────────────────────────

DEBUG_MODE: bool = os.environ.get("KM_DEBUG", "false").lower() == "true"
