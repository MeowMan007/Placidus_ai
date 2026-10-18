@echo off
title Placidus AI - Classical Astrological Observatory
echo ======================================================================
echo   PLACIDUS AI - CLASSICAL ASTROLOGICAL OBSERVATORY WORKSTATION
echo   Powered purely by Python & FastAPI (Zero Node/TypeScript dependency)
echo ======================================================================
echo.

REM Verify Python environment
if not exist "venv\Scripts\python.exe" (
    echo [INFO] Creating Python virtual environment...
    python -m venv venv
    if errorlevel 1 (
        echo [ERROR] Python not found in system PATH. Please install Python 3.10+
        pause
        exit /b 1
    )
    echo [INFO] Installing dependencies...
    venv\Scripts\pip.exe install -r requirements.txt
)

echo [OK] Launching Placidus AI Observatory server at http://127.0.0.1:8000 ...
start "" "http://127.0.0.1:8000"
.\venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
