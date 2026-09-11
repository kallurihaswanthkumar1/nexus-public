@echo off
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js was not found on this computer.
  echo.
  echo  Install it first:
  echo    1. Go to https://nodejs.org
  echo    2. Download and run the "LTS" installer ^(click Next through it, like any program^)
  echo    3. Restart your computer if prompted
  echo    4. Double-click this file again
  echo.
  pause
  exit /b 1
)

if not exist ".env" (
  echo.
  echo  No .env file found yet.
  echo  Copying .env.example to .env — open .env in Notepad and paste your
  echo  real Gemini API key before continuing.
  echo.
  copy ".env.example" ".env" >nul
  notepad ".env"
)

echo.
echo  Starting NEXUS...
echo  Your browser should open automatically at http://localhost:8787
echo  KEEP THIS WINDOW OPEN while you use NEXUS.
echo  Closing this window stops the server.
echo.

node server.js

pause
