#!/usr/bin/env bash
# usage: _hovercap.sh "<css-sel>" <id> [waitms]
export AGENT_BROWSER_SESSION=yoink
cd /home/martin/src/perso/yoinkit/claude || exit 1
SEL="$1"; ID="$2"; WAITMS="${3:-1700}"
echo "--- $ID : $SEL ---"
echo "count: $(agent-browser get count "$SEL" 2>/dev/null | tail -1)"
agent-browser scrollintoview "$SEL" >/dev/null 2>&1
agent-browser eval "(function(){try{__cap.scan('$SEL',{trigger:'hover'});return 'armed'}catch(e){return 'ERR '+e.message}})()" 2>&1 | tail -1
agent-browser hover "$SEL" >/dev/null 2>&1
agent-browser wait "$WAITMS" >/dev/null 2>&1
agent-browser eval 'JSON.stringify(window.__cap.dump())' --max-output 200000 > "/tmp/cap_$ID.txt" 2>/dev/null
python3 _save.py "/tmp/cap_$ID.txt" "timelines/$ID.json"
