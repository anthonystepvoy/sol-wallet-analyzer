@echo off

echo Starting Solana Wallet Analyzer...
echo.

REM Change directory to your project folder
cd /d D:\code\dedger-tool

echo Launching analyzer in a new CMD window...
start "Analyzer" cmd /k "npm start"

echo.
echo Analyzer is running in a new window.
echo Press any key to close this window...
pause > nul 