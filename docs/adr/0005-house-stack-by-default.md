# Use a House stack by default, never the source stack by inference

YoinkIt implementations default to the House stack: React, Bun, Vite, Lenis,
GSAP, and CSS Modules. A project can override the stack explicitly in
`00-config.json`, but YoinkIt does not infer or copy the source site's framework,
libraries, or architecture as the implementation target.

This is worth recording because clone-app's proven workflow leans heavily on
source fidelity, while YoinkIt's compounding payoff depends on reusable,
cross-yoink components that share one implementation vocabulary. Barba.js remains
a deferred candidate for inter-page transitions, because page transitions are out
of first-client scope.

Lenis is default-on in the House stack. YoinkIt calibrates it toward measured
source smooth-scroll behavior when available, otherwise uses House Lenis
settings; disabling it requires an explicit override or human-approved exception.

CSS-authored motion stays CSS when it can be ported cleanly and faithfully. GSAP
is the default implementation layer for Signature motion that needs an animation
runtime: choreography, scroll-triggered motion, timelines, staged reveals, and
complex hover sequences. Other motion libraries require an explicit stack
override.
