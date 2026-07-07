#!/usr/bin/env python3
"""Serve the MorTweetSRS web app with a local spd-say TTS API for Piper."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import threading
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse

WEB_ROOT = os.path.dirname(os.path.abspath(__file__))
SPD_SAY = shutil.which("spd-say")

speech_lock = threading.Lock()
current_proc: subprocess.Popen[str] | None = None


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_ROOT, **kwargs)

    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.end_headers()

    def do_GET(self) -> None:
        if urlparse(self.path).path == "/api/local-tts/capabilities":
            payload = {"available": bool(SPD_SAY), "engine": "spd-say" if SPD_SAY else None}
            body = json.dumps(payload).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/local-tts/cancel":
            cancel_speech()
            self.send_response(204)
            self.end_headers()
            return

        if path == "/api/local-tts":
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length) if length else b"{}"
            try:
                data = json.loads(raw.decode("utf-8"))
            except json.JSONDecodeError:
                self.send_error(400, "Invalid JSON")
                return

            text = str(data.get("text", "")).strip()[:500]
            if not text:
                self.send_error(400, "Missing text")
                return
            if not SPD_SAY:
                self.send_error(503, "spd-say not found")
                return

            if speak_text(text):
                self.send_response(204)
            else:
                self.send_error(500, "Speech failed")
            self.end_headers()
            return

        self.send_error(404)


def cancel_speech() -> None:
    global current_proc
    with speech_lock:
        if current_proc and current_proc.poll() is None:
            current_proc.terminate()
            try:
                current_proc.wait(timeout=1)
            except subprocess.TimeoutExpired:
                current_proc.kill()
            current_proc = None
        if SPD_SAY:
            subprocess.run([SPD_SAY, "-C"], check=False, capture_output=True)


def speak_text(text: str) -> bool:
    global current_proc
    cancel_speech()
    with speech_lock:
        try:
            current_proc = subprocess.Popen([SPD_SAY, text], start_new_session=True)
            current_proc.wait()
            return current_proc.returncode == 0
        except OSError:
            return False
        finally:
            current_proc = None


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8787)
    parser.add_argument("--bind", default="127.0.0.1")
    args = parser.parse_args()

    os.chdir(WEB_ROOT)
    server = HTTPServer((args.bind, args.port), Handler)
    print(f"Serving {WEB_ROOT} on http://{args.bind}:{args.port}/")
    if SPD_SAY:
        print(f"Local TTS API enabled ({SPD_SAY})")
    else:
        print("Local TTS API disabled (install speech-dispatcher and spd-say)")
    server.serve_forever()


if __name__ == "__main__":
    main()