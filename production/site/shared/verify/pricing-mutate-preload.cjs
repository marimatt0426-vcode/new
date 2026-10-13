// Preload for running the AUTHOR'S test suite against an engine broken in one place,
// without writing any file: the engine source is altered as Node compiles it.
//
//   PP_MUTATION=<index> NODE_OPTIONS="--require <this file>" node --test "<...>/shared/tests/"
//
// Only code that loads the engine with require() sees the fault (helpers/make-store.mjs does).
// Tests that read the engine file as text and run it in node:vm see the real file.
const Module = require("node:module");
const path = require("node:path");
const list = require("./pricing-mutations.cjs");
const index = Number(process.env.PP_MUTATION);
if (process.env.PP_MUTATION !== undefined && process.env.PP_MUTATION !== "" && Number.isInteger(index) && list[index]) {
  const from = list[index][1];
  const to = list[index][2];
  const target = path.resolve(__dirname, "../pp-quote-core.js");
  const compile = Module.prototype._compile;
  Module.prototype._compile = function (content, filename) {
    if (path.resolve(filename) === target) {
      const text = String(content).split("\r\n").join("\n");
      if (text.split(from).length !== 2) throw new Error("pricing-mutate-preload: fault " + index + " does not apply exactly once");
      content = text.replace(from, to);
      if (process.env.PP_MUTATION_DEBUG) console.error("pricing-mutate-preload: applied fault " + index + " (" + list[index][0] + ")");
    }
    return compile.call(this, content, filename);
  };
}
