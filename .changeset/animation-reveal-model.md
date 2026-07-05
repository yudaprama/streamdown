---
"streamdown": patch
---

Rework the streaming text animation onto a single, controller-driven reveal over
a global, document-ordered segment space.

- Sibling sections no longer animate concurrently. Exactly one chunk is active at
  a time across all blocks, so a list finishes revealing before the next
  paragraph or heading begins.
- Every segment reveals in order with the correct staggered delay, including
  rich/inline content (bold, italics, links). Previously only the trailing
  newly-arrived words animated while earlier or nested content stayed static.
  Atomic elements — code blocks, images, math, and embeds — reveal as a unit.

A single shared processor/plugin tracks the reveal frontier in one
`AnimationController` over a global segment ordinal space. Already-shown words
carry stable per-segment keys, so they reconcile in place instead of remounting
or re-animating when the markdown re-parses mid-stream, and the controller is
stepped idempotently during render (no snap under React StrictMode / concurrent
rendering).

Adds an `animated={{ reserveSpace: true }}` option: by default unrevealed content
is collapsed (`display: none`) so the layout grows in as content reveals; set
`reserveSpace` to reserve the final layout up front and fade segments in place
for a shift-free layout.

Note: when `animated` is enabled, text is now wrapped in lightweight keyed spans
even once settled (they persist for reconciliation stability rather than being
torn down when streaming ends). Inline `code` now animates with the surrounding
text, while block code, images, math, and embeds reveal as a unit.
