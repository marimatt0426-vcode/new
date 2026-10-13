// Builds assets/map/communities.json: the 26 accepted communities with approximate town-centre coordinates,
// projected x/y (0..100) for an illustrative map, page slug where a city page exists, and accepted ZIPs from spec/cities.json.
import { readFileSync, writeFileSync } from "node:fs";
const R = new URL("../../", import.meta.url);
const cities = JSON.parse(readFileSync(new URL("spec/cities.json", R), "utf8"));
const zipTo = cities.lookups?.zipToCommunity || {};
const pts = [
  ["Indianapolis", 39.7684, -86.1581, "indianapolis"], ["Carmel", 39.9784, -86.1180, "carmel"], ["Fishers", 39.9568, -86.0134, "fishers"],
  ["Noblesville", 40.0456, -86.0086, "noblesville"], ["Westfield", 40.0428, -86.1275, "westfield"], ["Anderson", 40.1053, -85.6803, "anderson"],
  ["Avon", 39.7628, -86.3997, "avon"], ["Brownsburg", 39.8434, -86.3978, "brownsburg"], ["Danville", 39.7606, -86.5264, "danville"],
  ["Fortville", 39.9323, -85.8480, "fortville"], ["Greenfield", 39.7851, -85.7694, "greenfield"], ["Greenwood", 39.6137, -86.1067, "greenwood"],
  ["Ingalls", 39.9570, -85.8050, "ingalls"], ["Lawrence", 39.8387, -86.0253, "lawrence"], ["McCordsville", 39.9081, -85.9228, "mccordsville"],
  ["New Palestine", 39.7220, -85.8891, "new-palestine"], ["Plainfield", 39.7042, -86.3994, "plainfield"],
  ["Cicero", 40.1239, -86.0133, "cicero"], ["Lapel", 40.0684, -85.8483, "lapel"], ["Markleville", 39.9778, -85.6147, "markleville"], ["Pendleton", 39.9975, -85.7466, "pendleton"],
  ["Whitestown", 39.9973, -86.3458, "whitestown"], ["Zionsville", 39.9509, -86.2619, "zionsville"], ["Camby", 39.6625, -86.3164, "camby"], ["Mooresville", 39.6128, -86.3742, "mooresville"], ["Pittsboro", 39.8639, -86.4669, "pittsboro"],
];
const lat0 = 39.87, k = Math.cos((lat0 * Math.PI) / 180);
const xs = pts.map((p) => p[2] * k), ys = pts.map((p) => p[1]);
const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
const span = Math.max(maxX - minX, (maxY - minY)), pad = 8;
const sx = (lon) => +(pad + ((lon * k - minX) / span) * (100 - 2 * pad) + ((span - (maxX - minX)) / span) * (100 - 2 * pad) / 2).toFixed(2);
const sy = (lat) => +(pad + ((maxY - lat) / span) * (100 - 2 * pad) + ((span - (maxY - minY)) / span) * (100 - 2 * pad) / 2).toFixed(2);
const zipsFor = (name) => Object.entries(zipTo).filter(([, v]) => { const n = typeof v === "string" ? v : v.community || v.name || v.primary || ""; const alt = (v && v.alternates) || []; return n === name || alt.includes(name); }).map(([z]) => z).sort();
const out = {
  _note: "Illustrative map data. Coordinates are approximate town centres (not boundaries); x and y are percentages of a square map, north at the top. Verify before using for anything other than an illustrative map. Service is decided by ZIP code, never by this map.",
  ring: { name: "I-465 (approximate)", cx: sx(-86.1581), cy: sy(39.7784), r: +(((0.165 * k) / span) * (100 - 2 * pad)).toFixed(2) },
  communities: pts.map(([name, lat, lon, slug]) => ({ name, slug, hasPage: !!slug, lat, lon, x: sx(lon), y: sy(lat), zips: zipsFor(name) })),
};
writeFileSync(new URL("assets/map/communities.json", R), JSON.stringify(out, null, 1));
console.log(out.communities.length, "communities;", out.communities.filter((c) => !c.zips.length).map((c) => c.name).join(", ") || "all have ZIPs");
console.log(JSON.stringify(out.ring), JSON.stringify(Object.entries(zipTo).slice(0, 2)));
