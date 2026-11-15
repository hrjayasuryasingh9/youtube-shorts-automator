# YouTube Shorts Automator

A full-stack tool that automates the YouTube Shorts workflow: discover trending Shorts, re-upload them with optimized metadata, or generate brand-new AI videos (GPT-4o script + Sora video) and publish them to a connected YouTube channel — all from a web dashboard.

## Features

- **Auto-upload trending Shorts** – searches YouTube by keyword, filters by view count and recency, applies a copyright-safety check, downloads the video with `yt-dlp` and uploads it to your channel.
- **Upload by link / ID** – paste a YouTube URL or video ID and queue it for upload.
- **AI video generation** – GPT-4o writes the script, title, description and tags; Sora renders the video; moderation-safe prompt sanitising is built in. Generated videos can be previewed and uploaded to YouTube in one click.
- **Frontend-driven OAuth 2.0** – log in with Google from the UI (no terminal auth step); tokens are stored locally.
- **Background jobs** – long-running tasks run via FastAPI background tasks with pollable job status endpoints.
- **Duplicate protection** – tracks uploaded video IDs so the same video is never posted twice.

## Tech Stack

| Layer    | Tech |
|----------|------|
| Backend  | Python, FastAPI, Uvicorn, Pydantic, httpx / requests |
| Integrations | YouTube Data API v3, Google OAuth 2.0, OpenAI (GPT-4o, Sora), yt-dlp |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, Zustand |

## Project Structure

```
main.py            FastAPI app: OAuth, upload jobs, AI generation pipeline
auth.py            Optional one-time CLI OAuth helper
frontend/          React + TypeScript dashboard
  src/components/  Auto upload, upload-by-link, AI video, videos list, job status
  src/store/       Zustand stores (auth, uploads, AI videos, YouTube API)
```

## Setup

1. **Google credentials** – create an OAuth client in Google Cloud Console (YouTube Data API v3 enabled) and save it as `client_secret.json` in the project root.
2. **Backend**
   ```bash
   pip install -r requirements.txt
   uvicorn main:app --reload --port 8000
   ```
3. **Frontend**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
4. Open http://localhost:5173, sign in with Google, and (for AI generation) provide your OpenAI API key in the UI.

Optional env vars: `FRONTEND_URL`, `BACKEND_URL`.

## Key API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/auth/login`, `/auth/callback` | Google OAuth flow |
| POST | `/auto-upload` | Find & upload trending Shorts |
| POST | `/upload-by-id` | Upload a specific video |
| POST | `/ai-generate` | Start GPT-4o + Sora generation |
| GET | `/job/{id}`, `/ai-generate-job/{id}` | Poll job status |
| POST | `/ai-upload/{video_id}` | Publish a generated video |

## Security note

`client_secret.json`, `token.pickle` and runtime data are git-ignored. Never commit them.

## Disclaimer

Re-uploading others' content may violate copyright and YouTube policy. Use only with content you have rights to, and comply with YouTube's Terms of Service.
