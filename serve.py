#!/usr/bin/env python3
"""Static server with HTTP Range support (needed for video scroll-scrubbing).

python -m http.server ignores Range requests and returns 200 for the whole
file, which makes Chrome report seekable=[0,0] so the video cannot be seeked.
This handler answers Range requests with 206 Partial Content + Accept-Ranges,
which is what the scroll-scrub in synapsex.html relies on.
"""
import os
import re
import sys
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler


class RangeRequestHandler(SimpleHTTPRequestHandler):
    def send_head(self):
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
