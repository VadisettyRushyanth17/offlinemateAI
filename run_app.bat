@echo off
echo ===================================================
echo     OfflineMate AI - 100%% Local AI Agent Launcher
echo ===================================================
echo.
echo Starting FastAPI Backend on port 8000...
start "OfflineMate Backend" cmd /k "python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload"

echo Starting Vite Frontend on port 5173...
start "OfflineMate Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo Services launched!
echo Access the application in your browser at:
echo http://localhost:5173
echo.
echo Press any key to exit this launcher window...
pause >nul
