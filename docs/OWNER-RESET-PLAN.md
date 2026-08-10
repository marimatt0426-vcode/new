# Purge Pros quote system — current decision

The reset decision is complete and has been expanded into the authoritative dashboard-only implementation guide:

`docs/OWNER-DASHBOARD-LAUNCH-GUIDE.md`

Use the paste-ready Cloudflare file:

`dist/COPY-PASTE-INTO-purge-lead-relay.js`

The owner does not run a terminal, NPM, Node, Wrangler, PowerShell, migrations, or manual code edits. The existing `purge-lead-relay` Worker is upgraded in place with one complete paste; its old root route remains compatible while v3 uses a separate route and separate GHL webhook.

Do not combine instructions from older guides with the current launch guide.

