#!/usr/bin/env bash
cd "$(dirname "$0")/desktop"
exec dx serve --platform desktop "$@"