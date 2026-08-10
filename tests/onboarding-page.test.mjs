import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../onboarding/pp-new-customer-welcome-widget.html', import.meta.url), 'utf8');
const guide = await readFile(new URL('../docs/onboarding/CUSTOMER-ONBOARDING-GHL-GUIDE.md', import.meta.url), 'utf8');

test('welcome page uses the approved arrival-window language', () => {
  assert.match(html, /10(?:–|-)45 minutes/i);
  assert.match(html, /heads-up, not an exact appointment time/i);
  assert.doesNotMatch(html, /exact ETA/i);
});

test('welcome page accurately describes billing', () => {
  assert.match(html, /pay <strong>per visit<\/strong>/i);
  assert.match(html, /charged when the en-route text is sent/i);
  assert.doesNotMatch(html, /charged (?:after|when) (?:the )?(?:visit|service) is complete/i);
});

test('welcome page preserves public-page security boundaries', () => {
  assert.match(html, /noindex,follow/i);
  assert.doesNotMatch(html, /<form\b/i);
  assert.doesNotMatch(html, /GHL_WEBHOOK|META_CAPI_TOKEN|api[_-]?key/i);
  assert.doesNotMatch(html, /gtag\s*\(|fbq\s*\(|generate_lead|track.*Lead/i);
});

test('welcome page provides accessible contact and accordion controls', () => {
  assert.match(html, /href="sms:\+13179615865"/i);
  assert.match(html, /href="tel:\+13179615865"/i);
  assert.ok((html.match(/<details class="ppw-faq"/g) || []).length >= 5);
  assert.match(html, /other\.open = false/);
});

test('implementation guide never promises an exact ETA', () => {
  assert.match(guide, /10(?:–|-)45 minutes/i);
  assert.match(guide, /Do not call this an “exact ETA\.”/i);
  assert.doesNotMatch(guide, /send an exact ETA|exact ETA when/i);
});
