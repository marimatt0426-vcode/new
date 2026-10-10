// The pinned Terms version label (shared/terms-version.json): what a service request must carry as termsVersion.
// Until the switch day it is the live tool's own label. set-switch-day.mjs changes it together with the engine.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
export const TERMS_PIN = JSON.parse(fs.readFileSync(path.resolve(here, "../../terms-version.json"), "utf8"));
export const TERMS_VERSION = TERMS_PIN.termsVersion;
export const SWITCH_DAY = TERMS_PIN.switchDay;   // null until the switch day, then "YYYY-MM-DD"
