"""
YouTube Shorts Automation API v5
Frontend-driven OAuth — no terminal auth needed.
"""

import os, re, json, pickle, logging, time, requests, yt_dlp, uuid
from pathlib import Path
from urllib.parse import urlencode, urlparse, parse_qs, urlunparse
from fastapi import FastAPI, BackgroundTasks, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, HTMLResponse
from pydantic import BaseModel
import googleapiclient.discovery, googleapiclient.http
from googleapiclient.errors import HttpError
import google.auth.transport.requests as google_requests
from google.oauth2.credentials import Credentials
from fastapi.responses import FileResponse
import tempfile, httpx



logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-8s  %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger(__name__)

SCOPES = [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube.readonly",
    "https://www.googleapis.com/auth/youtube",
]

DOWNLOAD_DIR         = Path("downloads"); DOWNLOAD_DIR.mkdir(exist_ok=True)
UPLOADED_IDS_FILE    = Path("uploaded_ids.json")
UPLOADED_VIDEOS_FILE = Path("uploaded_videos.json")
TOKEN_PATH           = Path("token.pickle")
CLIENT_SECRET        = Path("client_secret.json")

REDIRECT_URI = "http://localhost:8000/auth/callback"
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173")

os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

jobs: dict[str, dict] = {}

class AIGenerateRequest(BaseModel):
    topic: str
    style: str = "cinematic"
    duration: int = 30          # seconds: 15 | 30 | 60
    openai_api_key: str

class AIUploadRequest(BaseModel):
    privacy: str = "public"

AI_VIDEOS_FILE = Path("ai_videos.json")
AI_VIDEOS_DIR  = Path("ai_videos"); AI_VIDEOS_DIR.mkdir(exist_ok=True)

# ── Helpers ────────────────────────────────────────────────────────
def load_uploaded_ids() -> set:
    if UPLOADED_IDS_FILE.exists():
        try: return set(json.loads(UPLOADED_IDS_FILE.read_text()))
        except: return set()
    return set()

def save_uploaded_id(oid: str):
    ids = load_uploaded_ids(); ids.add(oid)
    UPLOADED_IDS_FILE.write_text(json.dumps(list(ids)))

def load_uploaded_videos() -> list:
    if UPLOADED_VIDEOS_FILE.exists():
        try: return json.loads(UPLOADED_VIDEOS_FILE.read_text())
        except: return []
    return []

def save_uploaded_video(record: dict):
    videos = load_uploaded_videos(); videos.append(record)
    UPLOADED_VIDEOS_FILE.write_text(json.dumps(videos, indent=2))

def is_already_uploaded(oid: str) -> bool:
    return oid in load_uploaded_ids()

def load_client_config():
    cfg = json.loads(CLIENT_SECRET.read_text())
    key = "web" if "web" in cfg else "installed"
    return cfg[key], key

def get_youtube():
    if not TOKEN_PATH.exists():
        raise RuntimeError("Not authenticated.")
    with open(TOKEN_PATH, "rb") as fh:
        creds = pickle.load(fh)
    if not creds.valid:
        if creds.expired and creds.refresh_token:
            creds.refresh(google_requests.Request())
            with open(TOKEN_PATH, "wb") as fh: pickle.dump(creds, fh)
        else:
            raise RuntimeError("Token expired. Please log in again.")
    return googleapiclient.discovery.build("youtube", "v3", credentials=creds)

# ── OAuth HTML helpers ─────────────────────────────────────────────
def _success_page():
    return HTMLResponse(f"""<!DOCTYPE html><html>
<head><title>Login successful</title></head>
<body style="font-family:system-ui,sans-serif;background:#0d0d1a;color:#fff;
     display:flex;align-items:center;justify-content:center;height:100vh;
     margin:0;flex-direction:column;gap:.75rem;">
  <div style="font-size:3rem">✅</div>
  <h2 style="margin:0;font-size:1.3rem">Logged in!</h2>
  <p style="opacity:.5;font-size:.85rem;margin:0">Closing window…</p>
  <script>
    try {{
      if (window.opener && !window.opener.closed) {{
        window.opener.postMessage({{type:'AUTH_SUCCESS'}}, '{FRONTEND_URL}');
      }}
    }} catch(e) {{}}
    setTimeout(() => window.close(), 800);
  </script>
</body></html>""")

def _error_page(message: str):
    safe_msg = message.replace("'", "\\'").replace("\n", " ")
    return HTMLResponse(f"""<!DOCTYPE html><html>
<head><title>Login failed</title></head>
<body style="font-family:system-ui,sans-serif;background:#0d0d1a;color:#fff;
     display:flex;align-items:center;justify-content:center;height:100vh;
     margin:0;flex-direction:column;gap:.75rem;">
  <div style="font-size:3rem">❌</div>
  <h2 style="margin:0;font-size:1.3rem">Login failed</h2>
  <p style="opacity:.5;font-size:.85rem;margin:0;max-width:360px;text-align:center">{message}</p>
  <script>
    try {{
      if (window.opener && !window.opener.closed) {{
        window.opener.postMessage({{type:'AUTH_ERROR',message:'{safe_msg}'}}, '{FRONTEND_URL}');
      }}
    }} catch(e) {{}}
    setTimeout(() => window.close(), 3000);
  </script>
</body></html>""", status_code=400)

# ── OAuth endpoints ────────────────────────────────────────────────

@app.get("/auth/login")
def auth_login():
    """Build the Google OAuth URL manually — no PKCE, no state surprises."""
    if not CLIENT_SECRET.exists():
        return _error_page("client_secret.json not found next to main.py")

    try:
        cfg, _ = load_client_config()
        client_id = cfg["client_id"]
    except Exception as e:
        return _error_page(f"Could not read client_secret.json: {e}")

    # Build auth URL manually — 100% control, no oauthlib magic
    params = {
        "client_id":     client_id,
        "redirect_uri":  REDIRECT_URI,
        "response_type": "code",
        "scope":         " ".join(SCOPES),
        "access_type":   "offline",
        "prompt":        "consent",
    }
    auth_url = "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params)
    log.info(f"Redirecting to Google: {auth_url[:80]}…")
    return RedirectResponse(auth_url)


@app.get("/auth/callback")
def auth_callback(request: Request):
    """Exchange the auth code for tokens. No state/PKCE verification needed."""
    params = dict(request.query_params)

    if params.get("error"):
        return _error_page(f"Google denied access: {params['error']}")

    code = params.get("code")
    if not code:
        return _error_page("No authorization code received from Google.")

    if not CLIENT_SECRET.exists():
        return _error_page("client_secret.json not found.")

    try:
        cfg, _ = load_client_config()
        client_id     = cfg["client_id"]
        client_secret = cfg["client_secret"]

        log.info(f"Exchanging code for token (redirect_uri={REDIRECT_URI})")

        token_resp = requests.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code":          code,
                "client_id":     client_id,
                "client_secret": client_secret,
                "redirect_uri":  REDIRECT_URI,
                "grant_type":    "authorization_code",
            },
        )
        token_json = token_resp.json()
        log.info(f"Token response {token_resp.status_code}: { {k:v for k,v in token_json.items() if k != 'access_token'} }")

        if not token_resp.ok or "error" in token_json:
            msg = token_json.get("error_description") or token_json.get("error") or f"HTTP {token_resp.status_code}"
            return _error_page(f"Token exchange failed: {msg}")

        if "refresh_token" not in token_json:
            log.warning("No refresh_token in response — user may need to revoke access at myaccount.google.com/permissions and try again")

        creds = Credentials(
            token         = token_json["access_token"],
            refresh_token = token_json.get("refresh_token"),
            token_uri     = "https://oauth2.googleapis.com/token",
            client_id     = client_id,
            client_secret = client_secret,
            scopes        = SCOPES,
        )
        with open(TOKEN_PATH, "wb") as fh:
            pickle.dump(creds, fh)
        log.info("✅ token.pickle saved")
        return _success_page()

    except Exception as exc:
        log.exception("Callback error")
        return _error_page(str(exc))


@app.get("/auth/debug")
def auth_debug():
    """Check that redirect_uri matches what's in client_secret.json and Google Console."""
    info: dict = {"redirect_uri_used_by_server": REDIRECT_URI}
    if CLIENT_SECRET.exists():
        try:
            cfg, key = load_client_config()
            uris = cfg.get("redirect_uris", [])
            info["credential_type"]          = key
            info["redirect_uris_in_file"]    = uris
            info["uri_registered_in_file"]   = REDIRECT_URI in uris
            info["action_needed"] = (
                "NONE — URI is registered ✅" if REDIRECT_URI in uris
                else f"Add '{REDIRECT_URI}' to Google Cloud Console → OAuth Client → Authorized redirect URIs, then re-download client_secret.json"
            )
        except Exception as e:
            info["error"] = str(e)
    else:
        info["client_secret_found"] = False
    return info


@app.delete("/auth/logout")
def logout():
    if TOKEN_PATH.exists(): TOKEN_PATH.unlink()
    return {"success": True}


# ── Models ─────────────────────────────────────────────────────────
class AutoUploadRequest(BaseModel):
    query: str = "motivational quotes"
    count: int = 5
    delay_seconds: int = 30
    min_views: int = 1_000_000
    days_back: int = 7

class UploadByIdRequest(BaseModel):
    video_url_or_id: str
    privacy: str = "public"

# ── YouTube helpers ────────────────────────────────────────────────
def parse_duration(iso: str) -> int:
    m = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", iso)
    if not m: return 0
    h, mi, s = (int(x) if x else 0 for x in m.groups())
    return h * 3600 + mi * 60 + s

def best_thumb(thumbs: dict) -> str:
    for q in ("maxres", "standard", "high", "medium", "default"):
        if q in thumbs: return thumbs[q]["url"]
    return ""

def extract_video_id(url_or_id: str) -> str:
    patterns = [
        r"youtube\.com/shorts/([A-Za-z0-9_-]{11})",
        r"youtube\.com/watch\?v=([A-Za-z0-9_-]{11})",
        r"youtu\.be/([A-Za-z0-9_-]{11})",
        r"^([A-Za-z0-9_-]{11})$",
    ]
    for pat in patterns:
        m = re.search(pat, url_or_id.strip())
        if m: return m.group(1)
    raise ValueError(f"Could not extract video ID from: {url_or_id}")

def is_copyright_safe(snippet, content_details, status) -> tuple[bool, str]:
    if content_details.get("licensedContent", True): return False, "registered in Content ID"
    if not status.get("embeddable", True): return False, "embedding disabled"
    risky = ["official audio","official video","vevo","warner music","sony music",
             "universal music","atlantic records","republic records","def jam","interscope",
             "all rights reserved","licensed to youtube by","\u2117","\u00a9","\u00ae"]
    text = (snippet.get("title","") + " " + snippet.get("description","")).lower()
    for kw in risky:
        if kw in text: return False, f"commercial keyword: '{kw}'"
    return True, "safe"

def search_trending_shorts(youtube, query, count, min_views, days_back):
    from datetime import datetime, timezone, timedelta
    since = (datetime.now(timezone.utc) - timedelta(days=days_back)).replace(
        hour=0, minute=0, second=0, microsecond=0).isoformat().replace("+00:00", "Z")
    search_resp = youtube.search().list(
        q=f"{query} #shorts", part="id,snippet", type="video",
        videoDuration="short", order="viewCount", publishedAfter=since,
        maxResults=50, regionCode="US", relevanceLanguage="en",
    ).execute()
    video_ids = [item["id"]["videoId"] for item in search_resp.get("items", [])]
    if not video_ids: return []
    details_resp = youtube.videos().list(
        part="snippet,contentDetails,statistics,status", id=",".join(video_ids)
    ).execute()
    already = load_uploaded_ids()
    candidates = []
    for item in details_resp.get("items", []):
        vid_id = item["id"]
        if vid_id in already: continue
        snippet = item["snippet"]; cd = item["contentDetails"]
        vs = item.get("status", {}); stats = item.get("statistics", {})
        seconds = parse_duration(cd.get("duration", ""))
        views = int(stats.get("viewCount", 0))
        if seconds == 0 or seconds > 60: continue
        if views < min_views: continue
        safe, _ = is_copyright_safe(snippet, cd, vs)
        if not safe: continue
        candidates.append({
            "video_id":    vid_id,
            "title":       snippet.get("title", ""),
            "description": snippet.get("description", ""),
            "tags":        snippet.get("tags", []),
            "category_id": snippet.get("categoryId", "22"),
            "thumbnail":   best_thumb(snippet.get("thumbnails", {})),
            "duration_s":  seconds,
            "views":       views,
        })
    candidates.sort(key=lambda x: x["views"], reverse=True)
    return candidates[:count]

def ensure_shorts_tags(title, description, tags):
    if "#shorts" not in title.lower():
        c = f"{title} #Shorts"; title = c if len(c) <= 100 else title
    if "#shorts" not in description.lower(): description += "\n\n#Shorts"
    if "shorts" not in [t.lower() for t in tags]: tags = list(tags) + ["Shorts"]
    return title, description, tags

def download_video(video_id: str, title: str):
    url = f"https://www.youtube.com/shorts/{video_id}"
    ydl_opts = {
        # Prefer a single pre-merged mp4 (no ffmpeg needed).
        # The fallback chain: single mp4 > single best > merged (only if ffmpeg present).
        "format": "best[ext=mp4]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best",
        "merge_output_format": "mp4",
        "outtmpl": str(DOWNLOAD_DIR / f"{video_id}.%(ext)s"),
        "noplaylist": True, "quiet": True, "no_warnings": True,
        "abort_on_error": False,
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            dl_meta = {
                "title":       info.get("title", ""),
                "description": info.get("description", ""),
                "tags":        info.get("tags", []),
                "category_id": "22",
                "thumbnail":   info.get("thumbnail", ""),
                "duration_s":  info.get("duration", 0),
            }
    except Exception as exc:
        log.error(f"Download failed: {exc}"); return None, None, {}
    video_path = DOWNLOAD_DIR / f"{video_id}.mp4"
    if not video_path.exists():
        matches = [p for p in DOWNLOAD_DIR.glob(f"{video_id}.*") if "_thumb" not in p.name]
        video_path = matches[0] if matches else None
    if not video_path: return None, None, {}
    thumb_path = None
    if dl_meta.get("thumbnail"):
        thumb_path = DOWNLOAD_DIR / f"{video_id}_thumb.jpg"
        try:
            r = requests.get(dl_meta["thumbnail"], timeout=15); r.raise_for_status()
            thumb_path.write_bytes(r.content)
        except: thumb_path = None
    return video_path, thumb_path, dl_meta

def upload_short(youtube, meta, video_path, thumb_path, privacy="public"):
    title, description, tags = ensure_shorts_tags(meta["title"], meta["description"], meta.get("tags", []))
    body = {
        "snippet": {"title": title, "description": description, "tags": tags, "categoryId": meta.get("category_id", "22")},
        "status":  {"privacyStatus": privacy, "selfDeclaredMadeForKids": False},
    }
    media = googleapiclient.http.MediaFileUpload(str(video_path), mimetype="video/mp4", resumable=True, chunksize=10*1024*1024)
    req = youtube.videos().insert(part="snippet,status", body=body, media_body=media)
    response = None
    while response is None:
        status, response = req.next_chunk()
        if status: log.info(f"  {int(status.progress()*100)}%")
    new_id = response["id"]
    if thumb_path and Path(thumb_path).exists():
        try:
            youtube.thumbnails().set(
                videoId=new_id,
                media_body=googleapiclient.http.MediaFileUpload(str(thumb_path), mimetype="image/jpeg"),
            ).execute()
        except HttpError as exc: log.warning(f"Thumbnail skipped: {exc}")
    return new_id

def cleanup(video_path, thumb_path):
    for p in (video_path, thumb_path):
        if p and Path(p).exists(): Path(p).unlink()

# ── Background jobs ────────────────────────────────────────────────
def run_auto_upload(job_id: str, req: AutoUploadRequest):
    jobs[job_id] = {"status": "running", "results": [], "error": None, "started_at": time.time()}
    try:
        youtube = get_youtube()
        shorts = search_trending_shorts(youtube, req.query, req.count, req.min_views, req.days_back)
        if not shorts:
            jobs[job_id].update({"status": "done", "error": "No copyright-safe videos found. Try lower min_views or increase days_back."})
            return
        for i, short in enumerate(shorts):
            if is_already_uploaded(short["video_id"]):
                jobs[job_id]["results"].append({"original_id": short["video_id"], "title": short["title"], "status": "skipped_duplicate"})
                continue
            video_path, thumb_path, _ = download_video(short["video_id"], short["title"])
            if not video_path:
                jobs[job_id]["results"].append({"original_id": short["video_id"], "title": short["title"], "status": "download_failed"})
                continue
            try:
                new_id = upload_short(youtube, short, video_path, thumb_path)
                record = {
                    "original_id": short["video_id"], "new_id": new_id, "title": short["title"],
                    "views": short["views"], "thumbnail": short.get("thumbnail", ""),
                    "duration_s": short.get("duration_s", 0), "url": f"https://youtube.com/shorts/{new_id}",
                    "uploaded_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "status": "success",
                }
                jobs[job_id]["results"].append(record)
                save_uploaded_id(short["video_id"]); save_uploaded_video(record)
            except HttpError as exc:
                jobs[job_id]["results"].append({"original_id": short["video_id"], "title": short["title"], "status": f"upload_failed: {exc}"})
            finally: cleanup(video_path, thumb_path)
            if i < len(shorts) - 1: time.sleep(req.delay_seconds)
        jobs[job_id]["status"] = "done"
    except Exception as exc:
        log.exception("Job failed"); jobs[job_id].update({"status": "error", "error": str(exc)})

def run_upload_by_id(job_id: str, req: UploadByIdRequest):
    jobs[job_id] = {"status": "running", "results": [], "error": None, "started_at": time.time()}
    try:
        video_id = extract_video_id(req.video_url_or_id)
        if is_already_uploaded(video_id):
            jobs[job_id].update({"status": "done", "error": f"Video {video_id} already uploaded."})
            jobs[job_id]["results"].append({"original_id": video_id, "status": "skipped_duplicate"}); return
        youtube = get_youtube()
        details = youtube.videos().list(part="snippet,contentDetails,statistics,status", id=video_id).execute()
        items = details.get("items", [])
        if not items: raise ValueError(f"Video not found: {video_id}")
        item = items[0]; snippet = item["snippet"]
        cd = item.get("contentDetails", {}); vs = item.get("status", {})

        # ── Copyright safety check ──────────────────────────────────
        safe, reason = is_copyright_safe(snippet, cd, vs)
        if not safe:
            jobs[job_id].update({"status": "done"})
            jobs[job_id]["results"].append({
                "original_id": video_id,
                "title": snippet.get("title", video_id),
                "status": "download_failed",
                "fail_reason": f"Copyright-unsafe: {reason}",
            })
            log.warning(f"Upload-by-id blocked — copyright-unsafe ({reason}): {video_id}")
            return
        # ───────────────────────────────────────────────────────────

        meta = {
            "title": snippet.get("title", ""), "description": snippet.get("description", ""),
            "tags": snippet.get("tags", []), "category_id": snippet.get("categoryId", "22"),
            "thumbnail": best_thumb(snippet.get("thumbnails", {})),
            "duration_s": parse_duration(cd.get("duration", "")),
        }
        video_path, thumb_path, _ = download_video(video_id, meta["title"])
        if not video_path: raise RuntimeError("Download failed")
        try:
            new_id = upload_short(youtube, meta, video_path, thumb_path, privacy=req.privacy)
            record = {
                "original_id": video_id, "new_id": new_id, "title": meta["title"],
                "thumbnail": meta.get("thumbnail", ""), "duration_s": meta.get("duration_s", 0),
                "url": f"https://youtube.com/shorts/{new_id}",
                "uploaded_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "status": "success",
            }
            jobs[job_id]["results"].append(record)
            save_uploaded_id(video_id); save_uploaded_video(record)
        finally: cleanup(video_path, thumb_path)
        jobs[job_id]["status"] = "done"
    except Exception as exc:
        log.exception("Upload-by-id failed"); jobs[job_id].update({"status": "error", "error": str(exc)})

# ── Endpoints ──────────────────────────────────────────────────────
@app.get("/status")
def health():
    return {
        "status":           "ok",
        "authenticated":    TOKEN_PATH.exists(),
        "has_client_secret": CLIENT_SECRET.exists(),
        "active_jobs":      len([j for j in jobs.values() if j["status"] == "running"]),
        "total_uploaded":   len(load_uploaded_ids()),
    }

@app.get("/videos")
def list_videos():
    return {"videos": load_uploaded_videos()}

@app.post("/auto-upload")
def auto_upload(req: AutoUploadRequest, background_tasks: BackgroundTasks):
    job_id = str(uuid.uuid4())[:8]
    background_tasks.add_task(run_auto_upload, job_id, req)
    return {"job_id": job_id}

@app.post("/upload-by-id")
def upload_by_id(req: UploadByIdRequest, background_tasks: BackgroundTasks):
    try: video_id = extract_video_id(req.video_url_or_id)
    except ValueError as e: raise HTTPException(status_code=400, detail=str(e))
    if is_already_uploaded(video_id):
        raise HTTPException(status_code=409, detail=f"Video '{video_id}' already uploaded.")
    job_id = str(uuid.uuid4())[:8]
    background_tasks.add_task(run_upload_by_id, job_id, req)
    return {"job_id": job_id, "video_id": video_id}

@app.get("/job/{job_id}")
def get_job(job_id: str):
    if job_id not in jobs: raise HTTPException(status_code=404, detail="Job not found")
    job = jobs[job_id]
    ok    = [r for r in job["results"] if r.get("status") == "success"]
    fail  = [r for r in job["results"] if r.get("status") not in ("success", "skipped_duplicate")]
    dupes = [r for r in job["results"] if r.get("status") == "skipped_duplicate"]
    return {
        "job_id": job_id, "status": job["status"], "error": job["error"],
        "uploaded": len(ok), "failed": len(fail), "skipped_duplicates": len(dupes),
        "results": job["results"],
    }

    """
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ADD THESE IMPORTS to the top of main.py (merge with existing imports)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

# ── ADD to existing imports block at top of main.py ────────────────
# (requests is already imported in your file — no need to add again)


"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ADD THESE CONSTANTS after the existing Path declarations
  (after UPLOADED_VIDEOS_FILE, TOKEN_PATH, CLIENT_SECRET, etc.)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""




"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ADD THESE PYDANTIC MODELS alongside AutoUploadRequest / UploadByIdRequest
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""



"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ADD THESE IMPORTS to the top of main.py (merge with existing imports)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

# ── ADD to existing imports block at top of main.py ────────────────
import tempfile, httpx
# (requests is already imported in your file — no need to add again)


"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ADD THESE CONSTANTS after the existing Path declarations
  (after UPLOADED_VIDEOS_FILE, TOKEN_PATH, CLIENT_SECRET, etc.)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ADD THESE IMPORTS to the top of main.py (merge with existing imports)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

# ── ADD to existing imports block at top of main.py ────────────────
# (requests is already imported in your file — no need to add again)


"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ADD THESE CONSTANTS after the existing Path declarations
  (after UPLOADED_VIDEOS_FILE, TOKEN_PATH, CLIENT_SECRET, etc.)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""



"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ADD THESE PYDANTIC MODELS alongside AutoUploadRequest / UploadByIdRequest
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""



"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ADD THESE IMPORTS to the top of main.py (merge with existing imports)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

# ── ADD to existing imports block at top of main.py ────────────────

# (requests is already imported in your file — no need to add again)


"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ADD THESE CONSTANTS after the existing Path declarations
  (after UPLOADED_VIDEOS_FILE, TOKEN_PATH, CLIENT_SECRET, etc.)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""




"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ADD THESE PYDANTIC MODELS alongside AutoUploadRequest / UploadByIdRequest
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""



"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ADD THESE HELPER FUNCTIONS before the endpoint definitions
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

def load_ai_videos() -> list:
    if AI_VIDEOS_FILE.exists():
        try: return json.loads(AI_VIDEOS_FILE.read_text())
        except: return []
    return []

def save_ai_video(record: dict):
    videos = load_ai_videos()
    # Update if exists, otherwise append
    idx = next((i for i, v in enumerate(videos) if v["id"] == record["id"]), None)
    if idx is not None:
        videos[idx] = record
    else:
        videos.append(record)
    AI_VIDEOS_FILE.write_text(json.dumps(videos, indent=2))

def get_ai_video(video_id: str) -> dict | None:
    return next((v for v in load_ai_videos() if v["id"] == video_id), None)


"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ADD THIS BACKGROUND JOB FUNCTION (before the existing run_auto_upload)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

def run_ai_generate(job_id: str, req: AIGenerateRequest):
    """
    Two-stage AI pipeline:
      1) GPT-4o  → script + title + description + tags (JSON)
      2) Sora    → video from script (async poll)
    """
    jobs[job_id] = {
        "type": "ai", "status": "running", "stage": "scripting",
        "error": None, "script": None, "title": None,
        "description": None, "tags": None, "video_url": None,
    }

    headers = {
        "Authorization": f"Bearer {req.openai_api_key}",
        "Content-Type": "application/json",
    }

    try:
        # ── Stage 1: GPT-4o → Script + Metadata ───────────────────
        log.info(f"[{job_id}] Stage 1: writing script for '{req.topic}'")

        style_hints = {
            "cinematic":    "sweeping cinematic shots, dramatic lighting, epic scale",
            "motivational": "high-energy, close-up faces, determination, powerful moments",
            "documentary":  "real-world footage style, naturalistic lighting, authentic moments",
            "aesthetic":    "visually stunning, colour-graded, trending aesthetic vibes",
        }
        style_desc = style_hints.get(req.style, req.style)

        gpt_body = {
            "model": "gpt-4o",
            "messages": [{
                "role": "user",
                "content": (
                    f'You are a YouTube Shorts video producer writing prompts for an AI video generator.'
                    f' Create content for the topic: "{req.topic}".\n'
                    f"Visual style: {style_desc}\n\n"
                    "CRITICAL — The video prompt MUST pass AI moderation. Follow these rules strictly:\n"
                    "- Describe only safe, abstract, or nature-based visuals (landscapes, objects, light, motion, text overlays, symbols)\n"
                    "- Do NOT mention real people, celebrities, or specific named individuals\n"
                    "- Do NOT describe violence, conflict, weapons, blood, or physical harm\n"
                    "- Do NOT describe explicit or suggestive content\n"
                    "- Do NOT describe controversial political figures or events\n"
                    "- Focus on uplifting imagery: nature, architecture, abstract shapes, light rays, slow motion b-roll, text on screen\n"
                    "- Keep it positive, inspirational, and visually safe\n\n"
                    "Return ONLY a JSON object (no markdown, no extra text) with exactly these keys:\n"
                    '{\n'
                    '  "script": "Safe, abstract visual scene for AI video generation. Describe environment, '
                    'lighting, motion, mood, and camera movement. Focus on nature, objects, or abstract visuals. '
                    '2-3 sentences. No people, no violence, no controversy.",\n'
                    '  "title": "Catchy YouTube Shorts title. Max 80 characters. Hook-first.",\n'
                    '  "description": "YouTube description. 2-3 sentences about the content. End with 5 relevant hashtags.",\n'
                    '  "tags": ["array", "of", "exactly", "10", "relevant", "youtube", "tags"]\n'
                    '}'
                )
            }],
            "response_format": {"type": "json_object"},
            "max_tokens": 600,
            "temperature": 0.75,
        }

        resp = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers=headers, json=gpt_body, timeout=30,
        )
        resp.raise_for_status()
        content = json.loads(resp.json()["choices"][0]["message"]["content"])

        jobs[job_id].update({
            "stage":       "generating_video",
            "script":      content["script"],
            "title":       content["title"],
            "description": content["description"],
            "tags":        content.get("tags", []),
        })
        log.info(f"[{job_id}] Script done. Title: {content['title'][:60]}")

        # ── Stage 2: Sora → Video ──────────────────────────────────
        log.info(f"[{job_id}] Stage 2: submitting to Sora")

        # Sora only accepts "4", "8", or "12" as string literals — map UI value to nearest
        _duration_map = {15: "12", 30: "12", 60: "12"}
        sora_seconds = _duration_map.get(req.duration, "12")  # type: str

        # Sanitize the script before sending to Sora — strip any phrases
        # that commonly trigger moderation even when unintentional
        _risky_phrases = [
            "person", "people", "man", "woman", "girl", "boy", "human", "face",
            "crowd", "fight", "battle", "war", "weapon", "gun", "knife", "blood",
            "death", "kill", "attack", "protest", "riot", "drug", "smoke",
        ]
        sora_prompt = content["script"]
        for phrase in _risky_phrases:
            import re as _re
            sora_prompt = _re.sub(
                rf'\b{phrase}s?\b', "", sora_prompt, flags=_re.IGNORECASE
            ).strip()
        # Collapse any double spaces left behind
        sora_prompt = " ".join(sora_prompt.split())
        if len(sora_prompt) < 30:
            # Fallback if sanitization gutted the prompt
            sora_prompt = (
                f"Cinematic slow-motion aerial footage of a breathtaking natural landscape. "
                f"Golden light rays, {req.style} visual style, uplifting and inspiring atmosphere."
            )
        log.info(f"[{job_id}] Sora prompt: {sora_prompt[:120]}")

        sora_body = {
            "model":   "sora-2",
            "prompt":  sora_prompt,
            "size":    "720x1280",      # portrait 9:16 for Shorts
            "seconds": sora_seconds,    # must be string: "4", "8", or "12"
        }

        # Correct endpoint: /v1/videos  (was /v1/video/generations — 404)
        sora_resp = requests.post(
            "https://api.openai.com/v1/videos",
            headers=headers, json=sora_body, timeout=60,
        )
        sora_resp.raise_for_status()
        video_id = sora_resp.json()["id"]
        log.info(f"[{job_id}] Sora video ID: {video_id}")

        # ── Stage 3: Poll for completion ───────────────────────────
        # Correct poll endpoint: GET /v1/videos/{id}  (was /v1/video/generations/{id})
        # Correct status values: queued | in_progress | completed | failed
        max_polls, poll_interval = 180, 10   # up to 30 min
        for poll_n in range(max_polls):
            time.sleep(poll_interval)
            poll_resp = requests.get(
                f"https://api.openai.com/v1/videos/{video_id}",
                headers=headers, timeout=15,
            )
            poll_resp.raise_for_status()
            poll_data = poll_resp.json()
            status = poll_data.get("status")
            progress = poll_data.get("progress", "")
            log.info(f"[{job_id}] Sora poll #{poll_n+1}: {status} {progress}%")

            if status == "completed":
                # Download video bytes from the content endpoint
                # (correct: GET /v1/videos/{id}/content  — was parsing a URL from poll_data)
                local_path = AI_VIDEOS_DIR / f"{job_id}.mp4"
                log.info(f"[{job_id}] Downloading generated video to {local_path}")
                dl_resp = requests.get(
                    f"https://api.openai.com/v1/videos/{video_id}/content",
                    headers=headers, stream=True, timeout=300,
                )
                dl_resp.raise_for_status()
                with open(local_path, "wb") as fh:
                    for chunk in dl_resp.iter_content(chunk_size=1024 * 1024):
                        fh.write(chunk)

                # Serve via our own endpoint so the URL never expires
                # Use full backend URL — frontend (localhost:5173) and backend (localhost:8000)
                # are on different ports, so a relative path would 404 in the browser.
                _backend_url = os.environ.get("BACKEND_URL", "http://localhost:8000")
                served_url = f"{_backend_url}/ai-video-file/{job_id}.mp4"

                record = {
                    "id":          job_id,
                    "topic":       req.topic,
                    "style":       req.style,
                    "script":      content["script"],
                    "title":       content["title"],
                    "description": content["description"],
                    "tags":        content.get("tags", []),
                    "video_url":   served_url,
                    "created_at":  time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    "uploaded":    False,
                    "youtube_id":  None,
                }
                save_ai_video(record)
                jobs[job_id].update({"status": "done", "video_url": served_url, "stage": "complete"})
                log.info(f"[{job_id}] Done ✓")
                return

            elif status in ("failed", "cancelled"):
                err = poll_data.get("error", {})
                raise RuntimeError(f"Sora generation {status}: {err.get('message', 'unknown error')}")

        raise RuntimeError("Sora generation timed out after 30 minutes")

    except requests.HTTPError as exc:
        try:
            detail = exc.response.json().get("error", {}).get("message", str(exc))
        except Exception:
            detail = str(exc)
        log.error(f"[{job_id}] HTTP error: {detail}")
        jobs[job_id].update({"status": "error", "error": detail})
    except Exception as exc:
        log.exception(f"[{job_id}] AI generation failed")
        jobs[job_id].update({"status": "error", "error": str(exc)})


"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ADD THESE API ENDPOINTS at the bottom of main.py
  (paste after the existing @app.get("/job/{job_id}") endpoint)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

from fastapi.responses import FileResponse

@app.post("/ai-generate")
def ai_generate(req: AIGenerateRequest, background_tasks: BackgroundTasks):
    """Start an AI generation job: GPT-4o script → Sora video."""
    if not req.topic.strip():
        raise HTTPException(status_code=400, detail="Topic is required.")
    if not req.openai_api_key.startswith("sk-"):
        raise HTTPException(status_code=400, detail="Invalid OpenAI API key format.")
    job_id = str(uuid.uuid4())[:12]
    background_tasks.add_task(run_ai_generate, job_id, req)
    return {"job_id": job_id}


@app.get("/ai-generate-job/{job_id}")
def get_ai_generate_job(job_id: str):
    """Poll AI generation job status."""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    job = jobs[job_id]
    return {
        "job_id":      job_id,
        "status":      job["status"],
        "stage":       job.get("stage", "scripting"),
        "error":       job.get("error"),
        "script":      job.get("script"),
        "title":       job.get("title"),
        "description": job.get("description"),
        "tags":        job.get("tags"),
        "video_url":   job.get("video_url"),
    }


@app.get("/ai-videos")
def list_ai_videos():
    """Return all locally stored AI-generated videos."""
    return {"videos": load_ai_videos()}


@app.get("/ai-video-file/{filename}")
def serve_ai_video(filename: str):
    """Serve a locally stored AI-generated video file."""
    # Sanitize — only allow safe filenames
    safe_name = Path(filename).name
    video_path = AI_VIDEOS_DIR / safe_name
    if not video_path.exists():
        raise HTTPException(status_code=404, detail="Video file not found.")
    return FileResponse(str(video_path), media_type="video/mp4")


@app.post("/ai-upload/{video_id}")
def ai_upload_to_youtube(video_id: str, req: AIUploadRequest):
    """Upload an AI-generated video to YouTube with its GPT-generated metadata."""
    record = get_ai_video(video_id)
    if not record:
        raise HTTPException(status_code=404, detail="AI video not found.")
    if record.get("uploaded"):
        raise HTTPException(status_code=409, detail="Video already uploaded to YouTube.")

    video_path = AI_VIDEOS_DIR / f"{video_id}.mp4"
    if not video_path.exists():
        raise HTTPException(status_code=404, detail="Video file missing on server.")

    try:
        youtube = get_youtube()
    except RuntimeError as e:
        raise HTTPException(status_code=401, detail=str(e))

    title, description, tags = ensure_shorts_tags(
        record["title"], record["description"], record.get("tags", [])
    )

    body = {
        "snippet": {
            "title":       title,
            "description": description,
            "tags":        tags,
            "categoryId":  "22",
        },
        "status": {
            "privacyStatus":             req.privacy,
            "selfDeclaredMadeForKids":   False,
        },
    }

    try:
        media = googleapiclient.http.MediaFileUpload(
            str(video_path), mimetype="video/mp4", resumable=True, chunksize=10 * 1024 * 1024
        )
        api_req = youtube.videos().insert(part="snippet,status", body=body, media_body=media)
        response = None
        while response is None:
            status_obj, response = api_req.next_chunk()
            if status_obj:
                log.info(f"  AI upload {int(status_obj.progress() * 100)}%")

        new_id = response["id"]
        log.info(f"AI video uploaded → https://youtube.com/shorts/{new_id}")

        # Persist upload status
        record["uploaded"]   = True
        record["youtube_id"] = new_id
        record["url"]        = f"https://youtube.com/shorts/{new_id}"
        save_ai_video(record)

        return {"youtube_id": new_id, "url": record["url"]}

    except HttpError as exc:
        log.error(f"YouTube upload error: {exc}")
        raise HTTPException(status_code=500, detail=f"YouTube upload failed: {exc}")