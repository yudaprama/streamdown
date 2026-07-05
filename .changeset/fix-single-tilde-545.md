---
"streamdown": patch
---

fix: disable singleTilde in remark-gfm to prevent single ~ from rendering as strikethrough

Single tilde (`~foo~`) should not be interpreted as strikethrough markup.
This aligns with GitHub GFM behavior where only double tildes (`~~text~~`)
create strikethrough. Set `singleTilde: false` in the default remark-gfm
configuration.

Fixes #545
