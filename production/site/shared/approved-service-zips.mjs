// Owner-approved October 12 addition. Historical fixtures remain unchanged on disk.
// This models only the accepted-list delta; the actual candidate Worker is tested separately.
import assert from 'node:assert/strict';
export function approvedZipSource(source, kind) {
 const re = kind === 'worker' ? /var SERVICE_ZIPS = [^\n]*new Set\(\[([\s\S]*?)\]\);/ : /serviceZips:\s*\[([\s\S]*?)\]/;
 const m=source.match(re);assert.ok(m,'ZIP list marker');
 const zips=m[1].match(/\d{5}/g);assert.equal(new Set(zips).size,zips.length);
 if(zips.includes('46290')){assert.equal(zips.length,54);return source;}
 assert.equal(zips.length,53,'historical fixture count');assert.equal(zips.at(-1),'46280');
 const changed=m[0].replace('"46280"','"46280", "46290"');
 assert.notEqual(changed,m[0]);return source.replace(m[0],()=>changed);
}
