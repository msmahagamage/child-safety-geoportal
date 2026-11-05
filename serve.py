"""Fast local server for the geoportal: gzip-compresses text/data files.

Usage:  python serve.py [port]      (default port 8765)

The data files (GeoJSON/CSV) shrink 5-10x when compressed, which is the
biggest single speed-up for page load.
"""
import gzip
import os
import sys
from email.utils import formatdate
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

COMPRESSIBLE = (".html", ".js", ".css", ".json", ".geojson", ".csv", ".svg", ".txt")
_cache = {}  # path -> (mtime, gzipped bytes)


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")  # always revalidate; 304 when unchanged
        super().end_headers()

    def do_GET(self):
        path = self.translate_path(self.path.split("?", 1)[0])
        if (
            os.path.isfile(path)
            and path.lower().endswith(COMPRESSIBLE)
            and "gzip" in self.headers.get("Accept-Encoding", "")
        ):
            mtime = os.path.getmtime(path)
            if self.headers.get("If-Modified-Since") and self._not_modified(mtime):
                self.send_response(304)
                self.end_headers()
                return
            cached = _cache.get(path)
            if not cached or cached[0] != mtime:
                with open(path, "rb") as handle:
                    cached = (mtime, gzip.compress(handle.read(), compresslevel=6))
                _cache[path] = cached
            body = cached[1]
            self.send_response(200)
            self.send_header("Content-Type", self.guess_type(path))
            self.send_header("Content-Encoding", "gzip")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Last-Modified", formatdate(mtime, usegmt=True))
            self.send_header("Vary", "Accept-Encoding")
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def _not_modified(self, mtime):
        from email.utils import parsedate_to_datetime
        try:
            return int(mtime) <= int(parsedate_to_datetime(self.headers["If-Modified-Since"]).timestamp())
        except (TypeError, ValueError):
            return False

    def log_message(self, fmt, *args):
        pass  # keep the console quiet


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    print(f"Serving the geoportal at http://localhost:{port}/  (Ctrl+C to stop)")
    ThreadingHTTPServer(("", port), Handler).serve_forever()
