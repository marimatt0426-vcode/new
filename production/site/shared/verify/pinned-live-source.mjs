// Where the checkers in this folder read the LIVE quote tool's source from.
// Default: the pinned copy of the October 5, 2026 release (commit aa9f81d), shared/tests/fixtures/live-2026-10-05/.
// Override: PP_PRODUCTION_SRC=<folder holding widget.js and worker.template.mjs>.
// (The production checkout is not used by default any more: it moves between branches, and on the Worker candidate
// branch widget.js is no longer in production/quote/src/.)
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
export const PINNED_LIVE_SRC = path.resolve(here, "../tests/fixtures/live-2026-10-05");
export const PRODUCTION_SRC = process.env.PP_PRODUCTION_SRC ? path.resolve(process.env.PP_PRODUCTION_SRC) : PINNED_LIVE_SRC;
export const WORKER_PATH = path.join(PRODUCTION_SRC, "worker.template.mjs");
export const WIDGET_PATH = path.join(PRODUCTION_SRC, "widget.js");
