// Entry point for:  node --test "<...>/shared/tests/"
//
// Newer Node versions (21 and later) treat a directory given to --test as one
// module to run, which resolves to this file; it then loads every *.test.mjs
// beside it. Older Node versions (20) search the directory themselves and run
// each test file directly, so there this file does nothing (otherwise every
// test would run twice).
//
// Each test file can also be run on its own:
//   node --test "<...>/shared/tests/contract.test.mjs"
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

// When Node itself found this file while searching the directory, the script
// path it was given ends in "index.js". When the directory was the argument,
// the script path is the directory.
const startedDirectly = path.basename(String(process.argv[1] || "")) === "index.js";

if (!startedDirectly) {
  const files = fs.readdirSync(__dirname).filter((name) => /\.test\.mjs$/.test(name)).sort();
  (async function loadAll() {
    for (const name of files) {
      await import(pathToFileURL(path.join(__dirname, name)).href);
    }
  })().catch((error) => {
    // A test file that cannot even be loaded must fail the run loudly.
    console.error(error);
    process.exitCode = 1;
  });
}
