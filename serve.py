#!/usr/bin/env python3
"""Static server with HTTP Range support (needed for video scroll-scrubbing).

python -m http.server ignores Range requests and returns 200 for the whole
file, which makes Chrome report seekable=[0,0] so the video cannot be seeked.
This handler answers Range requests with 206 Partial Content + Accept-Ranges,
which is what the scroll-scrub in synapsex.html relies on.
"""
import base64
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler


# Mirrors vercel.json's redirects. These must send the browser to a new URL
# (not rewrite in place): the admin pages link to each other relatively, so
# serving login.html at "/admin" would resolve "dashboard.html" to "/dashboard.html".
REDIRECTS = {
    "/admin": "/admin/login",
}

# Mirrors api/data.mjs: the deployed site reads its content through a
# same-origin /api/data function (see site-data.js), so the dev server has to
# answer that route too or local preview would always land on the embedded
# defaults. Auth = FIREBASE_SERVICE_ACCOUNT (env or service-account.json).
FIRESTORE_BASE = (
    "https://firestore.googleapis.com/v1/projects/portfolio-6efc7"
    "/databases/(default)/documents"
)
TOKEN_URL = "https://oauth2.googleapis.com/token"
TOKEN_SCOPE = "https://www.googleapis.com/auth/datastore"


def _service_account():
    raw = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
    if not raw and os.path.exists("service-account.json"):
        with open("service-account.json", encoding="utf-8") as f:
            raw = f.read()
    return json.loads(raw) if raw else None


_token_cache = {"value": "", "exp": 0}


def _access_token(sa):
    now = int(time.time())
    if _token_cache["value"] and _token_cache["exp"] - 60 > now:
        return _token_cache["value"]

    def b64(obj):
        return base64.urlsafe_b64encode(
            json.dumps(obj, separators=(",", ":")).encode()).rstrip(b"=")

    signing_input = b64({"alg": "RS256", "typ": "JWT"}) + b"." + b64({
        "iss": sa["client_email"], "scope": TOKEN_SCOPE, "aud": TOKEN_URL,
        "iat": now, "exp": now + 3600,
    })

    # No `cryptography` dependency: sign with the openssl CLI (present in Git Bash).
    with tempfile.NamedTemporaryFile("w", suffix=".pem", delete=False) as f:
        f.write(sa["private_key"])
        key_path = f.name
    try:
        proc = subprocess.run(["openssl", "dgst", "-sha256", "-sign", key_path],
                              input=signing_input, capture_output=True)
        if proc.returncode != 0:
            raise RuntimeError("openssl signing failed: " + proc.stderr.decode(errors="replace"))
        signature = base64.urlsafe_b64encode(proc.stdout).rstrip(b"=")
    finally:
        os.unlink(key_path)

    body = urllib.parse.urlencode({
        "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
        "assertion": (signing_input + b"." + signature).decode(),
    }).encode()
    req = urllib.request.Request(TOKEN_URL, data=body, headers={
        "Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(req, timeout=10) as r:
        tok = json.load(r)
    _token_cache.update(value=tok["access_token"], exp=now + int(tok.get("expires_in", 3600)))
    return _token_cache["value"]


def _decode_value(v):
    if "stringValue" in v: return v["stringValue"]
    if "integerValue" in v: return int(v["integerValue"])
    if "doubleValue" in v: return float(v["doubleValue"])
    if "booleanValue" in v: return v["booleanValue"]
    if "timestampValue" in v: return v["timestampValue"]
    if "nullValue" in v: return None
    if "arrayValue" in v: return [_decode_value(x) for x in v["arrayValue"].get("values", [])]
    if "mapValue" in v: return _decode_fields(v["mapValue"].get("fields", {}))
    return None


def _decode_fields(fields):
    return {k: _decode_value(v) for k, v in fields.items()}


def _fs_get(path, headers):
    req = urllib.request.Request(f"{FIRESTORE_BASE}/{path}", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return _decode_fields(json.load(r).get("fields", {}))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise


def _fs_list(name, headers):
    docs, token = [], ""
    while True:
        url = f"{FIRESTORE_BASE}/{name}?pageSize=300"
        if token:
            url += "&pageToken=" + urllib.parse.quote(token)
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as r:
            j = json.load(r)
        for d in j.get("documents", []):
            docs.append(_decode_fields(d.get("fields", {})))
        token = j.get("nextPageToken", "")
        if not token:
            break
    return docs


def fetch_site_data():
    sa = _service_account()
    if not sa:
        raise RuntimeError(
            "no FIREBASE_SERVICE_ACCOUNT / service-account.json — "
            "the page will fall back to its embedded defaults")
    headers = {"Authorization": "Bearer " + _access_token(sa)}
    return {
        "content": _fs_get("siteContent/main", headers) or {},
        "templates": _fs_list("templates", headers),
        "teasers": _fs_list("teasers", headers),
        "tags": _fs_list("tags", headers),
    }


class RangeRequestHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        # extensionless URL → the matching .html file, like Vercel's cleanUrls
        resolved = super().translate_path(path)
        if not os.path.exists(resolved) and os.path.isfile(resolved + ".html"):
            return resolved + ".html"
        return resolved

    def send_head(self):
        clean = self.path.split("?")[0].split("#")[0]
        if len(clean) > 1 and clean.endswith("/"):
            clean = clean[:-1]
        if clean in REDIRECTS:
            self.send_response(302)
            self.send_header("Location", REDIRECTS[clean])
            self.send_header("Content-Length", "0")
            self.end_headers()
            return None

        if clean == "/api/data":
            self._serve_api_data()
            return None

        path = self.translate_path(self.path)
        if os.path.isdir(path) or not os.path.exists(path):
            return super().send_head()

        rng = self.headers.get("Range")
        if rng is None:
            return super().send_head()

        m = re.match(r"bytes=(\d*)-(\d*)", rng)
        if not m:
            return super().send_head()

        size = os.path.getsize(path)
        start_s, end_s = m.group(1), m.group(2)
        if start_s == "":
            length = int(end_s)
            start = max(0, size - length)
            end = size - 1
        else:
            start = int(start_s)
            end = int(end_s) if end_s else size - 1
        end = min(end, size - 1)
        if start > end:
            self.send_error(416, "Requested Range Not Satisfiable")
            return None

        f = open(path, "rb")
        f.seek(start)
        self.send_response(206)
        ctype = self.guess_type(path)
        self.send_header("Content-Type", ctype)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.end_headers()
        self._range = (start, end)
        return f

    def _serve_api_data(self):
        try:
            body = json.dumps(fetch_site_data()).encode()
            status = 200
        except Exception as e:                       # noqa: BLE001 — surfaced to the page as JSON
            body = json.dumps({"error": str(e)}).encode()
            status = 502
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def copyfile(self, source, outputfile):
        # A cancelled/aborted media request (very common while scrubbing video —
        # the browser drops one Range connection and opens another) raises a
        # connection error mid-write. Swallow it so one aborted download never
        # takes the whole server down.
        try:
            rng = getattr(self, "_range", None)
            if rng is None:
                return super().copyfile(source, outputfile)
            start, end = rng
            self._range = None
            remaining = end - start + 1
            while remaining > 0:
                chunk = source.read(min(64 * 1024, remaining))
                if not chunk:
                    break
                outputfile.write(chunk)
                remaining -= len(chunk)
        except (ConnectionError, BrokenPipeError, ConnectionResetError, OSError, IOError):
            pass

    def log_message(self, fmt, *args):
        # keep the console quiet (and fast) under the flood of Range requests
        pass


class Server(ThreadingHTTPServer):
    # ThreadingHTTPServer handles many simultaneous connections — essential
    # because each video fires a burst of parallel Range requests. The old
    # single-threaded HTTPServer serialized them, so one open video connection
    # blocked the HTML/CSS/other videos and the page appeared to hang.
    daemon_threads = True        # threads die with the process (clean exit)
    allow_reuse_address = True   # rebind immediately even if a socket is in TIME_WAIT
    timeout = 30  # keep-alive timeout for video streaming


if __name__ == "__main__":
    # Always serve the folder this script lives in, regardless of the
    # directory the server was launched from.
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5599
    try:
        httpd = Server(("", port), RangeRequestHandler)
    except OSError as e:
        # Port already held (usually a leftover server). Fail fast with a clear
        # message instead of spawning a second, half-broken listener.
        print(f"ERROR: could not bind port {port} ({e}). "
              f"A server may already be running on it.", file=sys.stderr)
        sys.exit(1)
    print(f"Serving {os.getcwd()} on http://localhost:{port} (Range-enabled, threaded)")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        httpd.server_close()
