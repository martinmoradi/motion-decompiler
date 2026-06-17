# Re-express cleanly, never clone the source's code

YoinkIt reproduces what a site's motion and design *do* — faithful to the
experience — but emits **clean, idiomatic components with clear props and docs**,
never the source's code structure, framework, or libraries. We split fidelity in
two: **fidelity of understanding is high** (the capture must measure the signature
accurately enough to reproduce it "as good as possible"), **fidelity of
implementation is deliberately none**.

## Why this is worth recording

A reasonable reader will assume the opposite, because the obvious shortcut is what
`clone-app-pat-pro` does: it hits fidelity by copying the target's actual
code/framework and gating on static computed-style assertions. We considered that
path and rejected it. The whole point of YoinkIt is **copy-then-modify** — clean
named components are already remixable LEGOs; a code-level clone of minified
Webflow/GSAP is not something you can learn from, recolor, recompose, or shelve.

## Consequence

Refusing the shortcut moves the burden onto **capture quality** (we must truly
measure motion, not read source) and **decomposition** (turning a measurement
into a clean component). Re-expressing faithfully-but-cleanly is *harder* than
cloning, not easier. That difficulty is the moat — it is the part clone-app
cannot do for motion — but it means whole-page fidelity is expensive, which is why
scope is bounded to a single landing page for now.
