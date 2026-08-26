@echo off
title EventPulse - Launching Full Stack App
echo ========================================================
echo   Starting EventPulse (Backend + Frontend)
echo ========================================================
echo.

echo [1/2] Installing backend dependencies and starting API...
start cmd /k "cd backend && if not exist .env (copy .env.example .env) && npm install && npm run dev"

timeout /t 3 /nobreak > nul

echo [2/2] Installing frontend dependencies and starting UI...
start cmd /k "cd frontend && if not exist .env (copy .env.example .env) && npm install && npm run dev"

echo.
echo ========================================================
echo   EventPulse is launching!
echo   - Backend API: http://localhost:4000
echo   - Frontend App: http://localhost:5173
echo ========================================================
pause
