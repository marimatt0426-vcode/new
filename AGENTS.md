# Purge Pros production source

`production/` is the current approved website and quote-form source. `legacy/` is the superseded August implementation and is not a deployment source. The October 2 Impeccable mockups were rejected and must not be published or incorporated without a new explicit owner decision.

Keep source edits, tests, GitHub synchronization and live deployment as separate states. A repository update must not silently deploy to Cloudflare or GHL. Preserve production pricing, consent, idempotency, seven-day quote resumption, attribution and integrations unless the owner explicitly authorizes a change.

Before updating from another release, reconcile native/public state and owner edits. Update source provenance and checksums only after explaining the intentional change. Run `npm run build`, `npm run check`, and `npm test`; validate relevant webpage behavior for UI changes. Record the commit/push and separate live status in the private D:/scoop operations notes when working there.

This repository is public. Do not add credentials, runtime secret values, private account exports, customer records, test-owner contact details or private Obsidian notes. Existing public business contact information and public site links are not customer records. GHL-hosted assets remain externally referenced; do not claim this repository is a complete account backup.
