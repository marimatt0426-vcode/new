#!/usr/bin/env node
/**
 * Derive a Google Place ID (ChIJ…) from a full Google Maps URL.
 *
 * Usage:
 *   node place-id-from-url.js "https://www.google.com/maps/place/Business/...data=...!1s0x1234:0x5678!..."
 *
 * Google Maps place URLs embed the place's FTID — a pair of 64-bit hex values
 * that looks like "0x886b50…:0x9c3a…". The public Place ID is just that pair
 * wrapped in a tiny protobuf message and base64url-encoded:
 *
 *   bytes = 0x0A 0x12 0x09 <hex1 little-endian, 8 bytes> 0x11 <hex2 LE, 8 bytes>
 *   place_id = base64url(bytes)
 */
"use strict";

function ftidToPlaceId(hex1, hex2) {
  const le = (hexStr) => {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(BigInt(hexStr));
    return buf;
  };
  const bytes = Buffer.concat([
    Buffer.from([0x0a, 0x12, 0x09]), le(hex1),
    Buffer.from([0x11]), le(hex2)
  ]);
  return bytes.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function placeIdFromUrl(url) {
  const m = decodeURIComponent(url).match(/(0x[0-9a-fA-F]{1,16}):(0x[0-9a-fA-F]{1,16})/);
  if (!m) return null;
  return ftidToPlaceId(m[1], m[2]);
}

// Self-test against a publicly documented pair (Google Sydney office):
// ftid 0x6b12ae37b47f5b37:0x8eaddfcd1b32ca52 -> ChIJN1t_tDeuEmsRUsoyG83frY4
const SELF_TEST =
  ftidToPlaceId("0x6b12ae37b47f5b37", "0x8eaddfcd1b32ca52") === "ChIJN1t_tDeuEmsRUsoyG83frY4";

if (require.main === module) {
  if (!SELF_TEST) {
    console.error("Self-test failed — do not trust output.");
    process.exit(1);
  }
  const url = process.argv[2];
  if (!url) {
    console.error('Usage: node place-id-from-url.js "<full Google Maps URL>"');
    process.exit(1);
  }
  const id = placeIdFromUrl(url);
  if (!id) {
    console.error("No FTID (0x…:0x…) found in that URL. Make sure it's the full URL from the browser address bar, not the short maps.app.goo.gl link.");
    process.exit(1);
  }
  console.log("Place ID:", id);
}

module.exports = { ftidToPlaceId, placeIdFromUrl };
