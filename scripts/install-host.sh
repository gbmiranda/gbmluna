#!/usr/bin/env bash
# Compila o gbml-host (release) e registra o manifest de Native Messaging no Chrome.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST_NAME="com.gbml.host"
# ID estável derivado da chave pública em extension/public/manifest.json ("key")
EXTENSION_ID="cmmoobhcnmhjadkifoefplkmlngoondj"

echo "Compilando gbml-host (release)…"
swift build -c release --package-path "$ROOT/host"

BIN_DIR="$(swift build -c release --package-path "$ROOT/host" --show-bin-path)"
HOST_PATH="$BIN_DIR/gbml-host"

MANIFEST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
mkdir -p "$MANIFEST_DIR"

sed -e "s|__HOST_PATH__|$HOST_PATH|" \
    -e "s|__EXTENSION_ID__|$EXTENSION_ID|" \
    "$ROOT/host/manifest/$HOST_NAME.json" > "$MANIFEST_DIR/$HOST_NAME.json"

echo "Host instalado: $HOST_PATH"
echo "Manifest registrado: $MANIFEST_DIR/$HOST_NAME.json"
echo "Reinicie o Chrome para que o host seja reconhecido."
