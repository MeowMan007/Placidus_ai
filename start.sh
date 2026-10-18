#!/usr/bin/env bash
set -e

echo "======================================================================"
echo "  PLACIDUS AI - CLASSICAL ASTROLOGICAL OBSERVATORY WORKSTATION"
echo "  Powered purely by Python & FastAPI (Zero Node/TypeScript dependency)"
echo "======================================================================"
echo ""

if [ ! -d "venv" ]; then
    echo "[INFO] Creating virtual environment..."
    python3 -m venv venv
    echo "[INFO] Installing dependencies..."
    ./venv/bin/pip install -r requirements.txt
fi

echo "[OK] Starting Placidus AI Observatory on http://127.0.0.1:8000 ..."
./venv/bin/python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
