#!/usr/bin/env python3
"""Serve the static game, including the same /room/:code rewrite as Vercel.
Use --lobby to open the lobby immediately in a review/live-preview environment.
"""
import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--port', type=int, default=8000)
parser.add_argument('--lobby', action='store_true')
args = parser.parse_args()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == '/' and args.lobby:
            self.send_response(302)
            self.send_header('Location', '/index.html#lobby')
            self.end_headers()
            return
        if path.startswith('/room/'):
            self.path = '/index.html'
        super().do_GET()


print(f'Game available on port {args.port}', flush=True)
ThreadingHTTPServer(('0.0.0.0', args.port), Handler).serve_forever()
