# Purge Pros project documentation

This directory is the durable reference for the production quote widget, website, CRM workflow, analytics, advertising, and SEO decisions. Start here instead of relying on old chat history.

## Current production system

- [Project handoff and current-state summary](PROJECT-HANDOFF.md)
- [Owner dashboard launch guide](OWNER-DASHBOARD-LAUNCH-GUIDE.md)
- [Cloudflare launch guide](CLOUDFLARE-LAUNCH-GUIDE.md)
- [Email deliverability](email-deliverability.md)
- [Owner reset plan](OWNER-RESET-PLAN.md)

## Analytics and paid acquisition

- [Conversion tracking contract](ads-tracking-setup.md)
- [Meta/Facebook ads launch guide](facebook-ads/META-ADS-LAUNCH-GUIDE.md)
- [Meta creative copy pack](facebook-ads/META-AD-COPY-PACK.md)
- [Final creative QA](facebook-ads/FINAL-CREATIVE-QA.md)

## Audits and roadmaps

- [SEO audit — August 9, 2026](audits/SEO-AUDIT-2026-08-09.md)

## Rules for maintaining these notes

1. Update the relevant guide when production behavior changes.
2. Add the date and status to audits and time-sensitive recommendations.
3. Never commit webhook URLs, API tokens, passwords, customer exports, card data, or other secrets.
4. Treat generated Worker and demo files as build outputs; edit source and regenerate them.
5. Keep rejected drafts and temporary experiments out of the production documentation index.
