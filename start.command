#!/bin/bash
# Serves Strumline locally and opens it in the default browser.
cd "$(dirname "$0")"
PORT=8765
if ! lsof -ti:$PORT >/dev/null 2>&1; then
  python3 -m http.server $PORT --bind 127.0.0.1 >/dev/null 2>&1 &
  sleep 1
fi
open "http://127.0.0.1:$PORT/"
