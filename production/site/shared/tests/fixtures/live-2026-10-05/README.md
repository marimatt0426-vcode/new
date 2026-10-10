# Pinned copy of the LIVE quote source (October 5, 2026)

These two files are byte-for-byte copies of `production/quote/src/widget.js` and `production/quote/src/worker.template.mjs`
at commit `aa9f81d` of the production repository (`marimatt0426-vcode/new`, the merge of PR #4, the release that is live).
They were written with `git show aa9f81d:<path>`; nothing was edited.

Why they are here: the engine's tests (`shared/tests/`) and checkers (`shared/verify/`) compare the engine with the live
tool's own code. The production checkout has since moved to the Worker candidate branch, where `widget.js` no longer
stands in `production/quote/src/`, so the tests could not start. They now read this pinned copy by default.

- To compare against another source, set `PP_PRODUCTION_SRC=<folder holding widget.js and worker.template.mjs>`.
- Read-only reference. Never edit, never deploy from here. When a new Worker release becomes the live one, add a new
  dated folder beside this one and change `PINNED_LIVE_SRC` in `shared/tests/helpers/live-source.mjs` and
  `shared/verify/pinned-live-source.mjs`.
