#!/usr/bin/env python3
import json

d = json.load(open("animations.json"))
A = {a["id"]: a for a in d["animations"]}
out = []
w = out.append


def fmt_obj(o):
    if not isinstance(o, dict):
        return f"`{o}`"
    parts = []
    for k, v in o.items():
        parts.append(f"{k}: `{v}`")
    return ", ".join(parts)


def card(a, title=True):
    if title:
        w(f"#### {a['label']}")
        w("")
    w(f"- **id**: `{a['id']}`  ·  **trigger**: `{a['trigger']}`  ·  **mechanism**: {a['mechanism']}  ·  **confidence**: `{a['confidence']}`")
    w(f"- **locate**: `{a['selector']}`")
    if a.get("layers"):
        w(f"- **layers**: {a['layers']}")
    if a.get("stagger"):
        s = a["stagger"]
        extra = f" ({s['note']})" if s.get("note") else ""
        w(f"- **stagger**: {s.get('items')} items, ~{s.get('ms')}ms apart{extra}")
    lead = a.get("lead") or {}
    if lead:
        w(f"- **lead layer**: `{lead.get('selector','')}`")
        if lead.get("from"):
            w(f"    - from: {fmt_obj(lead['from'])}")
        if lead.get("to"):
            w(f"    - to: {fmt_obj(lead['to'])}")
        dur = lead.get("duration")
        ease = lead.get("ease")
        bez = lead.get("easeBezier")
        line = f"    - timing: `{dur}`"
        if ease:
            line += f" · ease: {ease}"
        if bez:
            line += f" · `{bez}`"
        w(line)
        if lead.get("spriteSheet"):
            w(f"    - sprite: `{lead['spriteSheet']}` (size `{lead.get('backgroundSize','')}`)")
    if a.get("timelineRef"):
        w(f"- **timeline**: `{a['timelineRef']}`")
    if a.get("notes"):
        w(f"- **notes**: {a['notes']}")
    w("")


# ---------------- header ----------------
m = d["meta"]
w(f"# Animation spec — {m['url']}")
w("")
w(f"Captured **{m['capturedAt']}** at viewport **{m['viewport'][0]}×{m['viewport'][1]}**. "
  f"Stack: **{', '.join(m['stack'])}**.")
w("")
w("> Rendered from `animations.json`. Every value here was measured or read from the page; "
  "GSAP-driven eases that computed style can't expose are flagged `unknown — verify`. "
  "This is a spec to recreate the motion, not code.")
w("")
w(f"**Method.** {m['method']}")
w("")
w(f"**Notes.** {m['notes']}")
w("")

# ---------------- tokens ----------------
w("## Tokens")
w("")
w("Recurring values lifted to reusable names.")
w("")
w("| token | value | notes |")
w("|---|---|---|")
for k, v in d["tokens"].items():
    if isinstance(v, dict):
        val = v.get("bezier") or v.get("timing") or json.dumps({kk: vv for kk, vv in v.items() if kk not in ("note", "usedBy", "gsap")})
        if v.get("gsap"):
            val += f"  (gsap: {v['gsap']})"
        note = v.get("note", "")
        if v.get("frames"):
            note = f"{v.get('frames')} frames @ {v.get('fps')}fps. " + note
    else:
        val, note = v, ""
    w(f"| `{k}` | {val} | {note} |")
w("")

# ---------------- ordered sections ----------------
SIGNATURE = [
    "hero-line-reveal", "section-overlap-parallax", "hero-image-parallax",
    "work-header-parallax", "work-card-image-zoom", "work-cover-crossfade",
    "3d-text-roll-button", "cta-wheel-scale-in", "wordmark-scroll-drift",
    "partners-logo-drift",
]
POLISH = ["services-cta-arrow", "accordion-expand", "vimeo-lightbox"]

w("## Signature moments")
w("")
w("Build these first — they carry the site's identity. Ordered roughly by impact.")
w("")
for i, aid in enumerate(SIGNATURE, 1):
    if aid in A:
        w(f"### {i}. {A[aid]['label']}")
        w("")
        card(A[aid], title=False)

# ---------------- patterns ----------------
w("## Patterns")
w("")
w("Reusable utilities — implement once, apply to every instance.")
w("")
for p in d["patterns"]:
    w(f"### {p['id']}")
    w("")
    w(f"- **trigger**: `{p['trigger']}`  ·  **confidence**: `{p['confidence']}`")
    w(f"- **applies to**: {p['appliesTo']}")
    w(f"- {p['summary']}")
    insts = [a for a in d["animations"] if a.get("patternId") == p["id"]]
    if insts:
        w("- **instances** (measured numbers):")
        for a in insts:
            lead = a.get("lead") or {}
            frm = fmt_obj(lead.get("from", {})) if lead.get("from") else ""
            to = fmt_obj(lead.get("to", {})) if lead.get("to") else ""
            st = a.get("stagger")
            stxt = f", stagger ~{st['ms']}ms" if st and st.get("ms") else ""
            w(f"    - `{a['id']}` — {frm} → {to}; `{lead.get('duration','')}`{stxt} ({a['confidence']})")
    w("")

# ---------------- polish ----------------
w("## Polish (table-stakes)")
w("")
for aid in POLISH:
    if aid in A:
        card(A[aid])

# ---------------- needs verify ----------------
w("## Needs verify")
w("")
w("Motion measured, but a value can't be read precisely from the page (GSAP/rAF easing, "
  "velocity-driven, or 3D-decomposed). Confirm against source if recreating exactly.")
w("")
w("| id | confidence | what to verify |")
w("|---|---|---|")
verify_reason = {
    "unknown — verify": "duration measured; **easing** is GSAP/rAF (not in computed style)",
    "_approx3d": "translate/scale exact; **3D rotation** decomposed from matrix3d (approx)",
    "unreadable": "canvas/WebGL — not spec-capturable",
}
for a in d["animations"]:
    if a["confidence"] != "measured":
        w(f"| `{a['id']}` | `{a['confidence']}` | {verify_reason.get(a['confidence'], '')} |")
w("")

# ---------------- can't spec-capture ----------------
w("## Can't spec-capture")
w("")
for u in d["unspecced"]:
    w(f"- **{u['id']}** — {u['note']}")
w("")

open("animations.md", "w").write("\n".join(out))
print("wrote animations.md (%d lines)" % len(out))
