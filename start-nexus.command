#!/bin/bash
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "Node.js was not found on this computer."
  echo "Install it from https://nodejs.org (choose the LTS version), then run this again."
  echo ""
  read -p "Press Enter to close..."
  exit 1
fi

if [ ! -f ".env" ]; then
  echo ""
  echo "No .env file found yet. Copying .env.example to .env —"
  echo "open .env in a text editor and paste your real Gemini API key before continuing."
  echo ""
  cp ".env.example" ".env"
  open ".env" 2>/dev/null || xdg-open ".env" 2>/dev/null || true
fi

echo ""
echo "Starting NEXUS..."
echo "Your browser should open automatically at http://localhost:8787"
echo "KEEP THIS WINDOW OPEN while you use NEXUS."
echo "Closing this window stops the server."
echo ""

node server.js
