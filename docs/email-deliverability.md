# GHL email deliverability — Purge Pros live configuration

This document records the current Purge Pros email setup and the rules for keeping
quote and service emails out of spam. It supersedes the generic sending-domain notes
from the older Claude branch.

## Current verified state

- Email service: LeadConnector email system.
- Dedicated sending domain: `replies.itspurgepros.com`.
- DNS provider: Cloudflare.
- DNS setup: authorized through the LeadConnector-to-Cloudflare connection.
- Domain verification: complete.
- SSL: issued.
- Sending IP: LeadConnector shared IP.
- Domain warmup: enabled; allow the staged warmup to progress naturally.

The Cloudflare authorization added the DKIM, SPF, DMARC, tracking CNAME, and MX
records requested by LeadConnector. Do not recreate, proxy, rename, or delete those
records while the domain remains verified. In particular, email-related CNAME and MX
records must remain **DNS only**, not Cloudflare-proxied.

No API key, email credential, or DNS secret belongs in this repository.

## Finish the sender identity in GHL

The domain can be technically verified while the Dedicated Header still has no
default name or email. In GHL, open the verified domain and set:

- **From name:** `Purge Pros`
- **From email:** an address GHL permits on the authenticated
  `replies.itspurgepros.com` domain
- **Reply-to:** an inbox the Purge Pros team actually monitors

Use the same branded sender consistently in the quote-copy, custom-estimate, and
question-response branches. Do not send through LeadConnector using an unrelated
`@gmail.com`, `@yahoo.com`, or other unauthenticated From address.

## Workflow rules

- A customer who requests an email quote or submits a question may receive the
  directly requested response immediately, including at night.
- Keep transactional messages concise and tied to the customer's request.
- Do not place a contact into unrelated promotional email automation merely because
  they requested a quote.
- Promotional or recurring marketing email must honor unsubscribe status and include
  GHL's managed unsubscribe element plus the required business identity/footer.
- Stop or suppress follow-up when the contact replies, opts out, is marked DND, is
  booked, or is otherwise moved into a state where the sequence no longer applies.
- SMS permission and email permission are separate. An email request does not create
  consent for promotional text messages.

## Warmup and reputation

The domain starts without an established sending reputation. At Purge Pros' expected
lead volume, normal one-to-one and requested workflow mail is an appropriate warmup;
do not manufacture volume or send a bulk blast to speed it up.

During warmup:

1. Send only real quote, question, and service communications.
2. Keep the From name/address stable.
3. Avoid image-heavy templates, URL shorteners, excessive links, all-caps subject
   lines, and exaggerated sales language.
4. Monitor bounces and complaints in GHL.
5. Remove invalid addresses instead of repeatedly retrying them.

## Verification checklist

- [x] `replies.itspurgepros.com` is verified in GHL.
- [x] SSL is issued.
- [x] Cloudflare DNS records were authorized and verified.
- [x] Domain warmup is active.
- [ ] Dedicated Header shows `Purge Pros` and the intended authenticated From email.
- [ ] Reply-to reaches a monitored inbox.
- [ ] Quote-copy, custom-estimate, and question emails use the dedicated domain.
- [ ] A test reaches Gmail without an authentication warning.
- [ ] A test reaches Outlook without an authentication warning.
- [ ] SPF, DKIM, and DMARC pass in the received message details or a reputable mail
      testing service.

Spam placement during the first warmup period does not automatically mean the DNS is
wrong. First confirm SPF, DKIM, and DMARC pass; then allow reputation to develop with
real, low-complaint sending.
