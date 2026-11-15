"""
Run this ONCE to complete OAuth login and save token.pickle.
After that, the API server uses token.pickle automatically.
"""
import pickle
from pathlib import Path
import google_auth_oauthlib.flow

SCOPES = [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube.readonly",
    "https://www.googleapis.com/auth/youtube",
]

flow = google_auth_oauthlib.flow.InstalledAppFlow.from_client_secrets_file(
    "client_secret.json", SCOPES
)
creds = flow.run_local_server(port=0)
with open("token.pickle", "wb") as fh:
    pickle.dump(creds, fh)
print("✅ Auth complete! token.pickle saved. You can now start the API server.")