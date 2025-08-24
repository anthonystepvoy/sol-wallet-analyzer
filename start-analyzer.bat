@echo off
title Solana Wallet Analyzer

echo ========================================
echo    Solana Wallet Analyzer v1.0.0
echo ========================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Check if npm is available
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: npm is not available
    echo Please ensure npm is properly installed
    pause
    exit /b 1
)

REM Check if dependencies are installed
if not exist "node_modules" (
    echo Installing dependencies...
    npm install
    if %errorlevel% neq 0 (
        echo ERROR: Failed to install dependencies
        pause
        exit /b 1
    )
)

echo Starting Solana Wallet Analyzer...
echo.
echo Available commands:
echo   - npm start     : Interactive wallet analysis
echo   - npm run analyze <wallet> [days] : Analyze specific wallet
echo   - npm run discover : Start live trader discovery
echo.

npm start

echo.
echo Analyzer has stopped. Press any key to exit...
pause > nul 