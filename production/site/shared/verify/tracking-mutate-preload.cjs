// Preload for running the test suite against an engine broken in ONE place, without writing any file:
// the engine source is altered as Node compiles it.
//
//   PP_TRACKING_MUTATION=<index> node --require <this file> --test <test files>
//
// Only code that loads the engine with require() sees the fault (tests/helpers/make-store.mjs does).
// Tests that read the engine file as text and run it in node:vm see the real file.
const Module = require("node:module");
const path = require("node:path");
const list = require("./tracking-mutations.cjs");
const index = Number(process.env.PP_TRACKING_MUTATION);
if (process.env.PP_TRACKING_MUTATION !== undefined && process.env.PP_TRACKING_MUTATION !== "" && Number.isInteger(index) && list[index]) {
  const from = list[index][1];
  const to = list[index][2];
  const target = path.resolve(__dirname, "../pp-quote-core.js").toLowerCase();
  const compile = Module.prototype._compile;
  Module.prototype._compile = function (content, filename) {
    if (path.resolve(filename).toLowerCase() === target) {
      const text = String(content).split("\r\n").join("\n");
      if (text.split(from).length !== 2) throw new Error("tracking-mutate-preload: fault " + index + " (" + list[index][0] + ") does not apply exactly once");
      content = text.replace(from, () => to);
    }
    return compile.call(this, content, filename);
  };
}
