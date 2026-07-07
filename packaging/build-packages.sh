#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${ROOT}/packaging/dist"

cd "${ROOT}"
mkdir -p "${OUT}"

echo "==> Debian package (.deb)"
dx bundle --platform desktop --package-types deb
cp -f target/dx/mor_tweet_srs_desktop/bundle/linux/deb/*.deb "${OUT}/"

echo "==> Fedora/RHEL package (.rpm)"
dx bundle --platform desktop --package-types rpm
cp -f target/dx/mor_tweet_srs_desktop/bundle/linux/rpm/*.rpm "${OUT}/"

echo "==> Arch Linux package (.pkg.tar.zst)"
(
  cd "${ROOT}/packaging/arch"
  makepkg -f --noconfirm
  cp -f mor-tweet-srs-[0-9]*.pkg.tar.zst "${OUT}/"
)

echo
echo "Packages written to ${OUT}:"
ls -lah "${OUT}"