# NEXUS

NEXUS is a local web app that turns YouTube videos, pasted text, or web page content into AI-powered summaries and quizzes using Gemini.

## Features

- Paste transcript text and generate a summary
- Pull captions from public YouTube videos when available
- Generate quiz questions from the resulting content
- Launch a local backend and UI from a single click
- Works with a Gemini API key and a standard Node.js install

## Why this project exists

This project is designed to help you go from raw content to usable learning material with minimal setup. It keeps the workflow simple: point the app at a video or transcript, let the AI summarize it, and generate interactive quiz questions.

## Quick start

### Requirements

- Node.js 18 or newer
- A Gemini API key from Google AI Studio
- A browser to open the local app

### Setup

1. Install Node.js from https://nodejs.org
2. Create a Gemini API key at https://aistudio.google.com/apikey
3. In the project folder, copy `.env.example` to `.env`
4. Replace the placeholder in `.env` with your real API key
5. Run the app:

   Windows:
   - Double-click `start-nexus.bat`

   macOS/Linux:
   - Run `./start-nexus.command` or `npm start`

### Open the app

The launcher should automatically open:

- http://localhost:8787

If it does not, open the URL manually in your browser.

## Environment variables

The app reads a `.env` file in the project root:

```env
GEMINI_API_KEY=your_gemini_api_key_here
PORT=8787
```

## Public release notes

This repository is prepared for a clean public release:

- sensitive API keys are not committed
- `.env` is ignored
- project metadata is set for GitHub visibility
- setup instructions are included for external users

## Development

```bash
npm install
npm start
```

## License

MIT

## Notes

- The app depends on public YouTube caption data when available.
- Some videos may not expose captions or may not be fully processed yet.
- When caption extraction fails, the app allows manual transcript paste as a fallback.
