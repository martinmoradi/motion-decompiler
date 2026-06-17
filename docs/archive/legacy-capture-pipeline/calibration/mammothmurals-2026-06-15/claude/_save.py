import sys, json
raw = open(sys.argv[1]).read()
v = json.loads(raw)
if isinstance(v, str):
    v = json.loads(v)
out = sys.argv[2]
json.dump(v, open(out, 'w'), indent=2)
if isinstance(v, dict):
    meta = v.get('meta', {})
    print("SAVED", out)
    print("  moved:", meta.get('elementsMoved'))
    print("  summary:", v.get('summary'))
    st = v.get('stagger')
    if st: print("  stagger:", st)
    for f in v.get('findings', []):
        if isinstance(f, dict) and f.get('type'):
            print(f"   - {f.get('selector')} [{f.get('type')}] {f.get('technique')} | timing={f.get('timing')}")
        elif isinstance(f, dict):
            print("   -", f.get('note'))
else:
    print("SAVED", out, "(type:", type(v).__name__, ")")
