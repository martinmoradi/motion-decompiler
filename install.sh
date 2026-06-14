#!/usr/bin/env bash
# install.sh — set up the DevTools-snippet fallback for motion-decompiler.
#
# The PRIMARY way to use this tool is the unpacked extension in extension/,
# which injects window.__cap on every page automatically (see README). You only
# need this script if you want the `capture-snippet` clipboard fallback for
# pasting the engine into Chrome DevTools > Sources > Snippets.
#
# It copies the engine to ~/.local/share/motion-decompiler/ and installs the
# `capture-snippet` helper into ~/.local/bin/.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/motion-decompiler"
BIN_DIR="$HOME/.local/bin"

mkdir -p "$DATA_DIR" "$BIN_DIR"
cp "$REPO/extension/capture-animation.js" "$DATA_DIR/capture-animation.js"
install -m 0755 "$REPO/bin/capture-snippet.sh" "$BIN_DIR/capture-snippet"

echo "✓ engine        -> $DATA_DIR/capture-animation.js"
echo "✓ capture-snippet -> $BIN_DIR/capture-snippet"
echo
echo "Primary path (recommended): load the unpacked extension once —"
echo "  chrome://extensions → Developer mode → Load unpacked → $REPO/extension"
echo
case ":$PATH:" in
    *":$BIN_DIR:"*) ;;
    *) echo "Note: $BIN_DIR is not on your PATH; add it to use 'capture-snippet'." ;;
esac
