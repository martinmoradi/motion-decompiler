#!/usr/bin/env bash
# usage: _scrollcap.sh "<css-sel>" <id> <above-scrollY> [waitms]
export AGENT_BROWSER_SESSION=yoink
cd /home/martin/src/perso/yoinkit/claude || exit 1
SEL="$1"; ID="$2"; ABOVE="$3"; WAITMS="${4:-3500}"
echo "--- $ID : $SEL (park@$ABOVE) ---"
agent-browser eval "(function(){var y=$ABOVE;if(window.lenis)window.lenis.scrollTo(y,{immediate:true});else scrollTo(0,y);return 'parked@'+Math.round(window.scrollY)})()" 2>&1 | tail -1
agent-browser wait 500 >/dev/null 2>&1
agent-browser eval "(function(){try{__cap.scan('$SEL',{trigger:'scroll'});return 'armed '+document.querySelectorAll('$SEL').length}catch(e){return 'ERR '+e.message}})()" 2>&1 | tail -1
agent-browser scrollintoview "$SEL" >/dev/null 2>&1
agent-browser wait "$WAITMS" >/dev/null 2>&1
agent-browser eval 'JSON.stringify(window.__cap.dump())' --max-output 200000 > "/tmp/cap_$ID.txt" 2>/dev/null
python3 _save.py "/tmp/cap_$ID.txt" "timelines/$ID.json"
