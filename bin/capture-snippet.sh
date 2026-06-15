#!/usr/bin/env bash
# capture-snippet — FALLBACK path for the web-animation capture engine.
#
# Primary use is the unpacked extension (extension/), which injects window.__cap
# on every page automatically. Use this only when you can't/won't load the
# extension: it copies the engine to the clipboard so you can paste it into
# Chrome DevTools > Sources > Snippets (one-time), then drive it from the
# Console:
#   __cap.on(sel) / __cap.scan(sel) / __cap.dump() / __cap.libs() / __cap.gsap()
#
# Chrome stores DevTools Snippets in an internal LevelDB, not a file, so there
# is no way to drop the snippet straight in from a script — hence clipboard.
#
# The engine is installed by ./install.sh to:
#   ~/.local/share/motion-decompiler/capture-animation.js
set -euo pipefail

ENGINE="${XDG_DATA_HOME:-$HOME/.local/share}/motion-decompiler/capture-animation.js"

if [[ ! -f "$ENGINE" ]]; then
    echo "capture-snippet: engine not found at $ENGINE" >&2
    echo "Run ./install.sh from the motion-decompiler repo first." >&2
    exit 1
fi

case "${1:-copy}" in
    copy)
        if command -v wl-copy >/dev/null 2>&1; then
            wl-copy < "$ENGINE"
            echo "✓ capture engine copied to clipboard ($(wc -l < "$ENGINE") lines)."
        elif command -v pbcopy >/dev/null 2>&1; then
            pbcopy < "$ENGINE"
            echo "✓ capture engine copied to clipboard ($(wc -l < "$ENGINE") lines)."
        elif command -v xclip >/dev/null 2>&1; then
            xclip -selection clipboard < "$ENGINE"
            echo "✓ capture engine copied to clipboard ($(wc -l < "$ENGINE") lines)."
        else
            echo "no clipboard tool (wl-copy/pbcopy/xclip) found — engine path:" >&2
            echo "$ENGINE"
            exit 1
        fi
        cat <<'EOF'

Paste it once into Chrome:
  DevTools (F12) → Sources → Snippets → New snippet → paste → Ctrl+S
Run it (Ctrl+Enter) on any page, then in the Console:
  __cap.libs()                          list animation libraries in use
  __cap.on('.selector')                 capture one element on hover (default)
  __cap.on('.sel',{trigger:'scroll'})   capture on scroll-into-view
  __cap.scan('.section')                find what moves in a region
                                        (use for layers you cannot click)
  __cap.gsap()                          inspect logged GSAP/CustomEase evidence
  __cap.boot({selectors:['h1'],ms:4000}) watch early load/reveal motion
  __cap.bootDump()                      finalize a boot capture
  __cap.dump()                          finalize → copies the .animation.json
EOF
        ;;
    path)  echo "$ENGINE" ;;
    print) cat "$ENGINE" ;;
    *) echo "usage: capture-snippet [copy|path|print]" >&2; exit 1 ;;
esac
