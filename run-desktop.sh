#!/usr/bin/env bash
cd "$(dirname "$0")"
exec dx serve --platform desktop "$@"