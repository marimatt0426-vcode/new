# Email Deliverability — Keeping GHL Email Out of Spam

Symptom this fixes: GHL confirmation / waitlist emails landing in the Gmail **spam**
folder. That's an email **authentication** problem, not a content problem — Gmail (since
its Feb 2024 bulk-sender rules) drops mail that isn't properly authenticated for the
domain it claims to come from. Out of the box GHL either sends from a shared domain with
no reputation, or — the most common killer — from an address it has no authority to send
as (e.g. a `@gmail.com` From). Either way SPF/DKIM/DMARC don't line up and the mail gets
filtered.

> Your time-critical messaging is **SMS** (Workflows 2/3/4), so email-to-spam is **not a
> launch blocker** — the booking-confirmation email is optional and the out-of-area
> waitlist isn't time-sensitive. Fix this in parallel with going live.

## 1. Set up a Dedicated Sending Domain in GHL (the real fix)

GHL → **Settings → Email Services → Dedicated Domain** → add a **subdomain** (use a
subdomain, not the bare root), e.g. `send.itspurgepros.com`. GHL (Mailgun under the hood)
hands you a set of DNS records. **Use the exact values GHL shows you** — the keys and
tracking hostnames are unique to your account. The shape:

| Purpose | Type | Name (as GHL shows it) | Value (example shape) |
|---|---|---|---|
| **DKIM** (signature) | TXT | `smtp._domainkey.send.itspurgepros.com` | `k=rsa; p=MIGfMA0…` (long key) |
| **SPF** (authorizes sender) | TXT | `send.itspurgepros.com` | `v=spf1 include:mailgun.org ~all` |
| **Tracking** (opens/clicks) | CNAME | `email.send.itspurgepros.com` | `mailgun.org` (or `track-…mailgun.org`) |
| **Bounce handling** (optional, recommended) | MX | `send.itspurgepros.com` | `mxa.mailgun.org` (pri 10) · `mxb.mailgun.org` (pri 10) |
| **DMARC** (Gmail requires it) | TXT | `_dmarc.itspurgepros.com` | `v=DMARC1; p=none; rua=mailto:dmarc@itspurgepros.com` |

`p=none` on DMARC is the safe starting point — monitor-only, blocks nothing.

## 2. Entering them in Cloudflare

DNS → select the `itspurgepros.com` zone → Records → Add record.

⚠️ **The #1 Cloudflare mistake — the Name field.** Cloudflare **auto-appends the zone**,
so enter only the *subdomain part*, not the full hostname:

- GHL says `send.itspurgepros.com` → type **`send`**
- GHL says `smtp._domainkey.send.itspurgepros.com` → type **`smtp._domainkey.send`**
- GHL says `_dmarc.itspurgepros.com` → type **`_dmarc`**

(Paste the full name and Cloudflare creates `send.itspurgepros.com.itspurgepros.com` and
verification silently fails.)

⚠️ **Proxy status = DNS only (grey cloud)** for the **CNAME and MX** records. A proxied
(orange-cloud) CNAME breaks Mailgun verification. TXT records have no proxy toggle.

- **TTL:** Auto is fine.
- Save, then return to GHL and hit **Verify**. Propagation is usually minutes on
  Cloudflare but can take a few hours — re-check if it doesn't verify right away.

## 3. The two non-DNS must-dos

1. Set every email workflow's **From** address to `…@send.itspurgepros.com` (or
   `…@itspurgepros.com` if you authenticate the root). **Never `@gmail.com`** — sending
   "as" Gmail through GHL is an automatic DMARC failure and the single biggest cause of
   spam-foldering.
2. Run a test through **[mail-tester.com](https://www.mail-tester.com)** (throwaway
   address → 0–10 score). Aim for **8+** with SPF, DKIM, and DMARC all passing.

## 4. Content that helps you land in inbox

Applied in the message-10 / message-12 copy in the main README:

- A **physical postal address** in the footer (legally required on commercial mail; a
  trust signal everywhere).
- A **managed unsubscribe link** on commercial mail — insert via GHL's built-in
  Unsubscribe element, don't hand-type a URL (the managed link records the opt-out).
  Transactional receipts (booking confirmation) don't legally need one.
- Conversational, plain-text-friendly copy — avoid heavy images, ALL-CAPS, "FREE!!!",
  and link-stuffing (classic spam triggers).
- One clear purpose per email; a working reply-to; real personalization where the data
  exists (signals legitimacy).

## 5. Reputation / warm-up

A brand-new sending domain has **zero reputation** — even fully authenticated, early
volume can wobble into spam until it warms up. Don't blast; let volume ramp naturally
with real traffic, and the inbox placement firms up over the first couple of weeks.

## Quick checklist

- [ ] Dedicated sending subdomain added in GHL (`send.itspurgepros.com`)
- [ ] DKIM, SPF, tracking CNAME, (MX), DMARC records added in Cloudflare
- [ ] CNAME/MX set to **DNS only** (grey cloud); Name fields are subdomain-only
- [ ] Domain shows **Verified** in GHL
- [ ] Every email workflow's From is on the authenticated domain (not `@gmail.com`)
- [ ] DMARC TXT present at `_dmarc`
- [ ] mail-tester.com score 8+ with SPF/DKIM/DMARC passing
- [ ] Footer with physical address (+ unsubscribe on the commercial waitlist email)
