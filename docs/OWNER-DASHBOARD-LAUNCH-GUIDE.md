# Purge Pros quote system v3 — exact owner launch guide

**Authoritative guide:** August 6, 2026  
**Owner tools:** HighLevel dashboard, Cloudflare dashboard, and the HighLevel website builder  
**Owner terminal/build work:** none  
**Paste-ready code:** `dist/COPY-PASTE-INTO-purge-lead-relay.js`

This is the only implementation guide to follow. Older migration documents in this repository are historical and should not be mixed into this launch.

## 1. Final decision

Use the custom Purge Pros widget, the existing Cloudflare account, a new clean HighLevel pipeline, and one new HighLevel workflow. Keep Housecall Pro for customer/job setup and its secure card request only after the customer approves the proposed service day.

Do not rebuild the website, replace HighLevel, automate route assignment, add a database, create SQL migrations, use Netlify, or run NPM/PowerShell/Wrangler.

The production-safe architecture is:

```text
Existing GHL website buttons (#quote)
                  |
                  v
Existing purge-lead-relay Cloudflare Worker
  GET /purge-quote.js = new responsive widget
  GET /demo           = private launch preview
  GET /reviews        = live Google rating/review count
  POST /submit        = new v3 submission -> new GHL workflow
  POST /              = old widget submission -> old GHL workflow
                  |
                  v
New GHL Quote Funnel v3 + one v3 Intake workflow
                  |
                  v
Manual route-day review and customer approval
                  |
                  v
Housecall Pro setup + secure card request
```

The separate existing `purge-quote` Worker remains untouched as the rollback copy. The upgraded relay preserves the old `POST /` behavior, so the old widget and old workflows continue to work during the transition.

## 2. What is already final in the code

The copy/paste file already contains all code values that can safely be embedded:

- the complete branded desktop overlay and full-screen mobile experience;
- Purge Pros colors and pet-waste-specific copy;
- ZIP checking, including Enter-key submission on desktop;
- all back buttons before final submission;
- transparent standard pricing before contact collection;
- custom-estimate handling for unpublished combinations;
- no WYSIWASH option;
- the recurring-customer offer `Initial cleanup fee ($39.99+ value): WAIVED`, based on the factual minimum cleanup fee rather than an unsupported average, with a prominent main-card statement that it does not apply to one-time cleanups;
- an offer-details popup showing the $39.99 first 30 minutes, $1-per-minute additional time, and a clearly labeled 60-minute `$69.99` example;
- optional Cloudflare `PROMO_*` variables so an offer can be changed or disabled without rebuilding the widget or workflow;
- Text, Email, and Phone call reply choices;
- an unchecked non-marketing service-SMS checkbox required only when the customer chooses Text;
- no promotional-SMS permission or marketing checkbox in the quote flow;
- a separate Terms checkbox for service requests;
- phone normalization and 10-digit validation;
- server-side ZIP, price, intent, and consent verification;
- Google Ads service-request label `AW-17767139897/g9smCM7pkL4cELmUhJhC`;
- removal of the old phone-unlock conversion from v3;
- Meta browser/CAPI `Lead` event-ID deduplication;
- your existing Google Place ID and existing Cloudflare secret names;
- no `/submit-true` dependency.

You do not edit any of those values in Cloudflare code.

The one value that cannot exist until you create it is the new HighLevel Inbound Webhook URL. You will paste that URL into a new Cloudflare secret named `GHL_WEBHOOK_URL_V3`; you will not paste it into the code.

## 3. Do not change the live system yet

Until section 10, leave all of these alone:

- the script URL currently installed on the GHL website;
- the existing `purge-quote` Worker code;
- the existing `GHL_WEBHOOK_URL` secret;
- the current Quote Funnel pipeline and opportunities;
- all current legacy workflows and their Published status;
- Google Ads, GA4, GTM, Meta Pixel, Meta CAPI, campaigns, and audiences;
- Housecall Pro and your manual route-approval process.

This is not because the new system needs them. It is because leaving them untouched gives you a one-line rollback and allows already-enrolled legacy contacts to finish their existing automation.

## 4. Create the new HighLevel pipeline

Go to **HighLevel → Opportunities → Pipelines** and create:

`Purge Pros — Quote Funnel v3`

Create the stages in this exact top-to-bottom order:

| Order | Stage name | Probability | Exact meaning |
|---:|---|---:|---|
| 1 | `Quote / Inquiry Follow-Up` | 10% | A quote copy or question was submitted, but service has not been requested. This is an open lead/inquiry holding stage, not an automated nurture campaign and not permission for promotional SMS. |
| 2 | `Custom Estimate` | 30% | The yard/configuration needs human pricing review. |
| 3 | `Service Requested / Route Review` | 50% | The customer requested service; staff is selecting and proposing the correct service day. |
| 4 | `Booked` | 85% | The customer approved the day and HCP/customer payment setup is underway. |
| 5 | `Won` | 100% | HCP setup is complete, the secure card is saved, and service is activated. |

Use HighLevel's native **Lost** or **Abandoned** opportunity status. Do not add a `Lost` stage to this new pipeline.

Do not move old opportunities into this pipeline. The old pipeline is historical/legacy; the new webhook creates only new v3 opportunities here.

The probabilities are launch assumptions, not scores assigned to an individual person. After at least 30 resolved opportunities have entered a stage, replace the estimate with the observed conversion rate from that stage.

If you already created the first stage as `In Nurture`, rename that existing stage to `Quote / Inquiry Follow-Up`; do not delete and recreate it. Verify the Quote Copy and Question opportunity actions display the new label after the rename.

There is deliberately no automated nurture workflow at launch. This first stage is used as follows:

- Quote Copy and Question submissions enter it so they remain visible and measurable as open, lower-intent inquiries.
- The immediate requested SMS/email acknowledgment is sent by the intake workflow; no later promotional sequence is implied.
- A Question also creates a human reply task. A Quote Copy creates staff work only when the customer selected Phone Call or later replies.
- Review this stage at least weekly. When a customer submits a separate service request, close the older Quote/Inquiry card with lost reason `Superseded by service request` so only the address-specific Service Requested opportunity remains open. When an inquiry is resolved without a service request, close it with a truthful reason such as `Question answered — no service requested` or `No response`.
- Do not add automated promotional follow-up unless a separate workflow, appropriate marketing consent, quiet-hour controls, stop-on-response behavior, and measurement plan are deliberately approved later.

## 5. Create the minimal v3 contact and opportunity fields

The CRM model deliberately keeps one contact for each person/phone/email while allowing that person to request quotes for more than one relative, property, or service address. Property data therefore belongs on the opportunity and in the submission note—not in the contact's single standard address.

### 5.1 Contact fields

Go to **HighLevel → Settings → Custom Fields → Contact**. Create the following as **Single Line Text** fields unless an identical field already exists:

| Display name | Purpose | Incoming webhook field |
|---|---|---|
| `Quote Reply Preference` | text, email, or call | `preferredContact` |
| `Quote SMS Consent` | yes or no | `consent` |
| `Quote SMS Consent Timestamp` | ISO date/time evidence | `smsConsentCapturedAt` |
| `Quote Request ID` | troubleshooting and duplicate reference | `requestId` |

### 5.2 Opportunity fields

Go to **HighLevel → Settings → Custom Fields → Opportunity** and create these as **Single Line Text** fields:

| Display name | Purpose | Incoming webhook field |
|---|---|---|
| `Quote Service Address` | Keeps each property attached to its own opportunity | `serviceAddress` |
| `Opportunity Quote Request ID` | Identifies the exact submission on the opportunity | `requestId` |

Do not create a separate field for every quote answer. The relay generates `quoteSummary`, a staff-readable note that preserves the service address, complete plan, price, dog count, named yard scope, desired start, reply preference, service-SMS consent evidence, Terms evidence, attribution summary, customer question, and request ID.

## 6. Create the one new HighLevel workflow

Create a workflow named:

`Purge Pros — Widget Intake v3`

Keep it in **Draft** while building it. Configure its **Workflow Settings** as follows:

| Workflow setting | Value | Reason |
|---|---:|---|
| Allow Re-entry | On | A returning person may submit another property, quote, question, or corrected request after the prior execution finishes. |
| Allow multiple Opportunities | Off | This intake is triggered by an inbound webhook, not an opportunity event. The workflow-level toggle is for separate opportunity-triggered executions and is not the account setting that permits multiple property cards. |
| Stop on Response | On | If a future step is added after a customer message, a reply removes that contact from this workflow instead of allowing more automated messages. The current acknowledgment is already the final customer message. |
| Timezone | Account/Location timezone (`America/New_York`) | The service area is in Central Indiana. |
| Communication Time Window | Off/unrestricted for this intake workflow | Its only automated customer messages are immediate, requested acknowledgments. Staff call tasks are handled during business hours. Do not reuse this setting for promotional nurture. |

Separately, during the coordinated section 12 cutover, enable **Sub-Account Settings → Objects → Opportunities → Allow Multiple Opportunities per Contact**. That account-level setting permits separate property/request cards; it is different from the workflow-level Allow multiple Opportunities toggle.

### 6.1 Add the trigger and obtain the only new secret value

1. Select **Add New Trigger**.
2. Choose **Inbound Webhook**.
3. Copy the generated webhook URL **before trying to save**.
4. Do **not** save the trigger yet. Current HighLevel requires a received sample to be selected as the **Mapping Reference** before it will save.
5. Leave this unsaved trigger open in its browser tab.
6. In a separate browser tab, complete section 7: add the copied URL as `GHL_WEBHOOK_URL_V3`, paste the Cloudflare code, and deploy it.
7. Return to this open HighLevel trigger and continue with section 8.1 to capture the sample, select the Mapping Reference, and then save the trigger.

That copied URL is the value for `GHL_WEBHOOK_URL_V3` in section 7. It is unique to your HighLevel account/workflow and is the only missing runtime value.

The temporary circular-looking sequence is expected: HighLevel generates the URL before saving, Cloudflare needs that URL to send the sample, and HighLevel needs the received sample before saving. Keep the HighLevel trigger tab open while configuring Cloudflare in another tab.

### 6.2 Do not apply any legacy trigger tags

The v3 workflow must not add these old entry tags:

- `quote-unlocked`
- `service-requested`
- `estimate-requested`
- `question-asked`
- `out-of-area`

Those tags launch the old workflows and would cause duplicate or incorrect texts. The new workflow branches directly on the inbound `stage` value.

## 7. Upgrade the existing Cloudflare relay with one paste

Open **Cloudflare → Workers & Pages → purge-lead-relay**.

### 7.1 Keep the five bindings already shown in your screenshot

Do not delete, rename, reveal, or replace these existing values:

| Type | Name | Action |
|---|---|---|
| Secret | `GHL_WEBHOOK_URL` | Leave untouched; this preserves the old workflow. |
| Plaintext | `GOOGLE_PLACE_ID` | Leave as `ChIJwxBb4j_CQ2IRKXPCYz1Nk78`. |
| Secret | `GOOGLE_PLACES_API_KEY` | Leave untouched. |
| Secret | `META_CAPI_TOKEN` | Leave untouched. |
| Secret | `META_PIXEL_ID` | Leave untouched. |

### 7.2 Add exactly two bindings

Under **Settings → Variables and Secrets**, add:

| Type | Name | Value |
|---|---|---|
| Secret | `GHL_WEBHOOK_URL_V3` | Paste the new Inbound Webhook URL copied in section 6.1. |
| Plaintext | `ALLOWED_ORIGINS` | `https://itspurgepros.com,https://www.itspurgepros.com,https://purge-quote.purgepros.workers.dev` |

Spelling and capitalization must match exactly. Do not put quotation marks around the values.

### 7.2a Optional promotion controls

No promotion variable is required for launch; the tested code already includes the waived-initial-cleanup offer. Later, you can change or disable that campaign from **Cloudflare → purge-lead-relay → Settings → Variables and Secrets** without editing code, GHL, analytics, or the website.

The most commonly used plaintext variables are:

| Name | Example | Effect |
|---|---|---|
| `PROMO_ENABLED` | `false` | Hides the promotional card and link. Delete the variable or set `true` to show it. |
| `PROMO_BADGE` | `SUMMER OFFER · AUTOMATICALLY APPLIED` | Changes the small green campaign label. |
| `PROMO_TITLE` | `Summer cleanup offer: $20 off` | Changes the prominent offer headline. |
| `PROMO_DETAIL` | `Start by August 31 and receive $20 off your first visit.` | Changes the short explanation. |
| `PROMO_ELIGIBILITY` | `Recurring service only — does not apply to one-time cleanups.` | Changes the prominent eligibility line on the main offer card. |
| `PROMO_DISCLAIMER` | `New recurring customers only. Ends August 31, 2026.` | Changes the popup fine print. |

For a campaign that changes the popup calculation, also use `PROMO_MODAL_TITLE`, `PROMO_MODAL_INTRO`, `PROMO_FIRST_LABEL`, `PROMO_FIRST_VALUE`, `PROMO_ADDITIONAL_LABEL`, `PROMO_ADDITIONAL_VALUE`, `PROMO_EXAMPLE_LABEL`, `PROMO_EXAMPLE_VALUE`, `PROMO_CUSTOMER_LABEL`, and `PROMO_CUSTOMER_VALUE`. If you only want to pause the current offer, set `PROMO_ENABLED=false`; do not alter any other setting.

After changing a promotion variable, save it and allow up to five minutes for the public widget script cache to refresh. The promotion changes only customer-facing offer copy. Pricing calculations, GHL fields, workflows, Google events, and Meta deduplication stay unchanged.

### 7.3 Paste the complete tested code

1. Open **Edit code** for `purge-lead-relay`.
2. Select the entire current editor contents.
3. Replace it with the entire contents of `dist/COPY-PASTE-INTO-purge-lead-relay.js`.
4. Do not change anything inside the pasted file.
5. Select **Deploy**.

This replacement does not discard the old relay contract. The pasted code explicitly preserves the old root submission route and points it to the untouched `GHL_WEBHOOK_URL` secret.

### 7.4 Confirm the three safe GET routes

Open these in a browser:

- `https://purge-lead-relay.purgepros.workers.dev/demo`
- `https://purge-lead-relay.purgepros.workers.dev/purge-quote.js`
- `https://purge-lead-relay.purgepros.workers.dev/reviews`

Expected results:

- `/demo` shows the new branded quote experience;
- `/purge-quote.js` shows JavaScript text rather than an error;
- `/reviews` shows JSON with a rating and count.

Do not change the website script yet.

## 8. Capture a HighLevel sample and finish the v3 workflow

HighLevel's Inbound Webhook field picker learns the incoming field names from a sample. You do not manually type JSON or upload a schema.

### 8.1 Capture the sample

1. Return to the still-open, unsaved **Inbound Webhook** trigger from section 6.1.
2. Select **Test Trigger** or the equivalent sample-listening control.
3. In another tab, open `https://purge-lead-relay.purgepros.workers.dev/demo`.
4. Submit an in-area standard recurring service request with obviously test-only information.
5. Return to HighLevel. If necessary, select **Load More** or refresh the received-reference list.
6. Select the newest received request and inspect its body. Confirm it contains `schemaVersion` = `cloudflare-widget.v3`, the test phone/email, `stage` = `service_requested`, a combined `serviceAddress` value, `consent`, and `smsConsentCapturedAt`.
7. Set that received request as the **Mapping Reference**.
8. Now save the Inbound Webhook trigger. The Mapping Reference error should be gone.
9. HighLevel should then direct you to or create the **Create/Update Contact** action; continue with section 8.2.

Do not select an older payload from the former phone-gated widget. If the body contains `phone_captured` or lacks `schemaVersion: cloudflare-widget.v3`, it is the wrong Mapping Reference.

The Cloudflare demo suppresses production Meta CAPI while it is running on `workers.dev` unless a Meta test code is deliberately added. The preview also has no installed website Google tag, so this sample should not create a production ad conversion.

### 8.2 Create/update the contact

Add **Create/Update Contact** immediately after the trigger. Use the merge-field/data picker under **Inbound Webhook** for every mapped value:

| HighLevel destination | Inbound value |
|---|---|
| First Name | `firstName` |
| Last Name | `lastName` |
| Phone | `phoneE164` |
| Email | `email` |
| Contact Source | fixed text `Purge Pros Website Quote v3` |
| Quote Reply Preference | `preferredContact` |
| Quote SMS Consent | `consent` |
| Quote SMS Consent Timestamp | `smsConsentCapturedAt` |
| Quote Request ID | `requestId` |

Do not type merge syntax by memory. Click the picker and choose the visible inbound field from the captured sample.

Do not map `street`, `city`, `state`, or `zip` into the contact's standard address fields. One person may request service for their own property and later for a relative or another property. Mapping a service address to the contact would overwrite the previous property and falsely imply that it is the person's one permanent address. The opportunity field and quote note preserve each submitted service location separately.

**If you already finished the v3 workflow:** do not rebuild the pipeline, branches, opportunities, notifications, tasks, or contact-preference routers. The final one-checkbox widget uses the original `consent` and `smsConsentCapturedAt` mappings already in the workflow. Do not create marketing-consent fields or marketing-confirmation actions. If you created empty prototype marketing fields before launch, you may delete them or simply leave them unmapped and unused.

### 8.3 Add the complete quote as a contact note

Add **Add to Notes** and use these exact settings:

- **Action name:** `Add v3 Quote Summary`
- **Note title:** `Purge Pros Website Quote v3`
- **Note body:** select inbound `quoteSummary` using the custom-value picker
- **Note color:** optional; use blue if you want these website submissions to be visually recognizable

This is the staff record of what the customer actually submitted, including the service address for service/custom-estimate requests. Do not reconstruct the price in HighLevel. The `perVisitPrice` in the webhook was recalculated and approved by Cloudflare.

### 8.4 Add the main request-type If/Else

Add an **If/Else** action and use **Build My Own**.

- **Action name:** `Route by v3 Request Stage`
- For every branch, select **Inbound Webhook Trigger → stage** as the field. Do not select Contact Details and do not use the stored Contact Source field.
- Use the text operator **Equals**. If the interface labels the exact-match operator **Is**, use **Is**; it means the same exact comparison here.
- Keep the comparison side as a manually entered/static value, not a second dynamic field.

Create four sibling branches with **Add Branch**:

| Order | Branch name | Field | Operator | Static comparison value |
|---:|---|---|---|---|
| 1 | `Service Requested` | Inbound Webhook Trigger → `stage` | Equals/Is | `service_requested` |
| 2 | `Custom Estimate Requested` | Inbound Webhook Trigger → `stage` | Equals/Is | `estimate_requested` |
| 3 | `Quote Copy Requested` | Inbound Webhook Trigger → `stage` | Equals/Is | `quote_requested` |
| 4 | `Question Submitted` | Inbound Webhook Trigger → `stage` | Equals/Is | `question_submitted` |

Each branch has only one condition, so no AND/OR segment is needed. These must be four branches inside the same If/Else action, not four separate nested If/Else actions.

HighLevel automatically creates the final **None** branch. Rename it `Unexpected Stage`. Do not add a condition to it. Later, place only an internal alert there such as `Unrecognized v3 widget stage — inspect contact note`; it must not send a customer message.

### 8.5 Opportunity logic in every valid branch

The relationship model is:

- one deduplicated CRM contact per phone/email;
- more than one opportunity may belong to that contact;
- service/custom-estimate opportunities are matched by submitted service address;
- quote-copy/question submissions without an address are matched only by Request ID.

Keep **Allow Duplicate Contacts** off. The separate account-wide **Allow Duplicate Opportunity / Allow Multiple Opportunities per Contact** setting will be enabled during the coordinated cutover in section 12, after the legacy intake workflow is turned off. That allows a person to request service for multiple relatives/properties without fragmenting their contact/conversation history.

For each of the four request branches, add **Find Opportunity**, select **Most Recently Created Opportunity**, and save it to produce the automatic Found/Not Found paths.

Use these exact Find filters:

| Request branch | Required filters; HighLevel combines them with AND |
|---|---|
| `service_requested` | Pipeline **Is** v3; Status **Is** Open; Opportunity Name **Contains** dynamic inbound `serviceAddress` |
| `estimate_requested` | Pipeline **Is** v3; Status **Is** Open; Opportunity Name **Contains** dynamic inbound `serviceAddress` |
| `quote_requested` | Pipeline **Is** v3; Status **Is** Open; Opportunity Name **Contains** dynamic inbound `requestId` |
| `question_submitted` | Pipeline **Is** v3; Status **Is** Open; Opportunity Name **Contains** dynamic inbound `requestId` |

Use the custom-value picker for the right side of the third filter: **Inbound Webhook Trigger → serviceAddress** or **Inbound Webhook Trigger → requestId**. Do not type webhook merge syntax from memory. The standard Opportunity Name field is used for matching because the current Find Opportunity interface may not expose opportunity custom fields in this inbound-webhook workflow.

For the two address-based branches, do not search only by contact/pipeline: that would cause a second property submitted by the same person to overwrite the first property's opportunity. Quote-copy and question names must include their Request ID so a retried webhook can find the exact submission.

Under **Opportunity Found**, use **Update Opportunity**. Under **Opportunity Not Found**, use **Create Opportunity**. Keep status Open until intentionally marked Won/Lost/Abandoned and use fixed source `Purge Pros Website Quote v3`.

Use these destinations:

| Inbound stage | Pipeline stage | Opportunity value |
|---|---|---:|
| `service_requested` | Service Requested / Route Review | inbound `perVisitPrice` |
| `estimate_requested` | Custom Estimate | 0 until priced |
| `quote_requested` | Quote / Inquiry Follow-Up | inbound `perVisitPrice` |
| `question_submitted` | Quote / Inquiry Follow-Up | fixed value 0 |

Use these opportunity-name patterns:

- Service/custom estimate: `[Inbound firstName] [Inbound lastName] — [Inbound serviceAddress] — [Inbound frequency]`
- Quote copy: `[Inbound firstName] [Inbound lastName] — Quote Copy — [Inbound frequency] — [Inbound zip] — [Inbound requestId]`
- Question: `[Inbound firstName] [Inbound lastName] — Website Question — [Inbound zip] — [Inbound requestId]`

Build names with the picker. A blank last name on a quote-copy/question request is acceptable.

#### Exact `service_requested` Update Opportunity settings

Under **Opportunity Found**, configure the blank **Update Opportunity** action as follows:

- **Action name:** `Update Found Opportunity — Service Requested`
- **Allow Opportunity to Move to Any Previous Stage:** Off
- Add field **Pipeline:** `Purge Pros — Quote Funnel v3`
- Add field **Pipeline Stage:** `Service Requested / Route Review`
- Add field **Status:** `Open`
- Add field **Opportunity Name:** build `Inbound firstName` + space + `Inbound lastName` + ` — ` + `Inbound serviceAddress` + ` — ` + `Inbound frequency` using the custom-value picker
- Add field **Opportunity Source:** fixed text `Purge Pros Website Quote v3`
- Add field **Opportunity Value:** select **Inbound Webhook Trigger → perVisitPrice** using the custom-value picker; this value is already in dollars, so do not use `serverPriceCents`
- If available in this action, add opportunity custom field **Quote Service Address:** inbound `serviceAddress`
- If available in this action, add opportunity custom field **Opportunity Quote Request ID:** inbound `requestId`

The Update action automatically uses the opportunity returned by the immediately preceding Find Opportunity action. Do not select an opportunity ID manually.

#### Exact `service_requested` Create Opportunity settings

Under **Opportunity Not Found**, configure the blank **Create Opportunity** action as follows:

- **Action name:** `Create Opportunity — Service Requested`
- **Pipeline:** `Purge Pros — Quote Funnel v3`
- **Pipeline Stage:** `Service Requested / Route Review`
- **Opportunity Name:** build the same dynamic name used above
- **Opportunity Source:** fixed text `Purge Pros Website Quote v3`
- **Status:** `Open`
- **Opportunity Value:** select **Inbound Webhook Trigger → perVisitPrice**
- If available in this action, add opportunity custom field **Quote Service Address:** inbound `serviceAddress`
- If available in this action, add opportunity custom field **Opportunity Quote Request ID:** inbound `requestId`

Do not enter a dollar sign in Opportunity Value and do not select `serverPriceCents`; for example, the incoming `perVisitPrice` is `22.49`, while `serverPriceCents` would be `2249`.

If either opportunity custom field is absent from the Update/Create field picker, skip it. Do not substitute a contact field. The Opportunity Name and the earlier `quoteSummary` note retain the matching and operational information.

#### Exact Update/Create settings for the other three branches

Use the same field list as the service-request actions, with these branch-specific values:

| Branch | Found action name | Not Found action name | Pipeline stage | Opportunity name | Opportunity value | Optional opportunity custom fields |
|---|---|---|---|---|---:|---|
| Custom Estimate Requested | `Update Found Opportunity — Custom Estimate` | `Create Opportunity — Custom Estimate` | Custom Estimate | address-based pattern above | 0 | service address and request ID |
| Quote Copy Requested | `Update Found Opportunity — Quote Copy` | `Create Opportunity — Quote Copy` | Quote / Inquiry Follow-Up | quote-copy pattern above | inbound `perVisitPrice` | request ID only |
| Question Submitted | `Update Found Opportunity — Website Question` | `Create Opportunity — Website Question` | Quote / Inquiry Follow-Up | question pattern above | 0 | request ID only |

For every **Update Opportunity** action, keep backward-stage movement Off and add Pipeline, Pipeline Stage, Status Open, Opportunity Name, Opportunity Source, and Opportunity Value. For every **Create Opportunity** action, set those same values directly. The fixed Opportunity Source is always `Purge Pros Website Quote v3`.

If **Duplicate Opportunity** is directly configurable inside a Create Opportunity action, turn it On. If the control only redirects to account settings, do not change Contact Deduplication and do not enable duplicate contacts; leave the workflow in Draft and use **Settings → Objects → Opportunities → Allow Multiple Opportunities per Contact** during the coordinated section 12 cutover.

HighLevel has two different account-wide concepts:

- **Allow Duplicate Contacts:** creates multiple CRM contact records for the same phone/email; keep this off.
- **Allow Duplicate Opportunity / Allow Multiple Opportunities per Contact:** permits more than one opportunity card for a contact in the same pipeline. This is required for different relatives/properties under one person and is enabled only after the legacy intake workflow stops receiving new widget submissions.

#### Continue both Found/Not Found paths without duplicating every message

The Found/Not Found split decides only whether HighLevel updates or creates the opportunity. After that database action, both paths must share one response path:

- Build the shared staff actions and customer-response router underneath **Opportunity Found → Update Opportunity**.
- Under **Opportunity Not Found → Create Opportunity**, add **Go To**.
- Point Go To to the first shared action under the Found path.
- If the branch has a common staff notification/task, that is the Go To destination; otherwise, the contact-preference router is the destination.

Use these exact destinations:

| Main request branch | First shared action under Found | Not Found Go To destination |
|---|---|---|
| Service Requested | `Notify Team — New Service Request` | that notification |
| Custom Estimate Requested | `Notify Team — Custom Estimate` | that notification |
| Quote Copy Requested | `Contact Preference Router — Quote Copy` | that router |
| Question Submitted | `Notify Team — Website Question` | that notification |

Do not duplicate the entire SMS/email/call sequence under both Found and Not Found. Do not point Service Requested directly to its router, because its common notification and route-review task must run first.

### 8.6 Customer-response guard used in every branch

Create one **If/Else** called `Contact Preference Router — [request type]` on the shared Found path for each main request branch. Create three sibling branches inside it, in this order:

| Router branch | Exact conditions |
|---|---|
| `Text — Allowed` | Inbound `preferredContact` **Is** static text `text` **AND** inbound `consent` **Is** static text `yes` |
| `Email` | Inbound `preferredContact` **Is** static text `email` |
| `Phone Call` | Inbound `preferredContact` **Is** static text `call` |

Use **Is**, which is HighLevel's current exact-match operator. Enter `text`, `yes`, `email`, and `call` as lowercase static values without quotation marks. The left side comes from **Inbound Webhook Trigger**; do not use the stored contact fields for this router.

Rename the automatic None branch `Invalid Contact Preference`. Put only an internal alert there; do not send a customer message.

Do not add a DND condition and do not add an action that changes DND. HighLevel automatically skips workflow SMS for an SMS-DND contact. The explicit guard here proves that the customer selected Text and supplied the required service-message consent; HighLevel supplies the final DND enforcement.

### 8.7 `service_requested` branch

Build these shared actions underneath **Opportunity Found → Update Opportunity**, before the contact router:

1. Add **Internal Notification** named `Notify Team — New Service Request`, send it to the route reviewer, and use:

   **Title:** `ACTION REQUIRED: New service request — [Inbound firstName] [Inbound lastName] — [Inbound zip]`

   **Body:**

   > A customer submitted a Purge Pros service request and needs route/day review.
   >
   > Name: [Inbound firstName] [Inbound lastName]  
   > Phone: [Inbound phoneE164]  
   > Email: [Inbound email]  
   > Preferred contact: [Inbound preferredContact]  
   > Service address: [Inbound serviceAddress]  
   > Requested plan: [Inbound frequency]  
   > Quoted price: $[Inbound perVisitPrice] per visit  
   > Request ID: [Inbound requestId]
   >
   > Submitted details:
   >
   > [Inbound quoteSummary]
   >
   > Next step: review the route, determine the proposed service day, and respond using the customer's selected contact method. Nothing is confirmed or charged yet.
2. Add a task named `Review route/service day — [First Name] [Last Name] — [zip]`. Use a same-business-day due date, assign it to the person who reviews routes, and place inbound `quoteSummary` in the description.
3. Add the section 8.6 router named `Contact Preference Router — Service Requested`.

Under **Opportunity Not Found → Create Opportunity**, point Go To to `Notify Team — New Service Request`. Both Found and Not Found will now run the notification and task exactly once before choosing the response channel.

Inside the router:

- Under **Text — Allowed**, add a nested If/Else named `One-Time or Recurring Service`.
- Create branch `One-Time Cleanup`: inbound `frequencyId` **Is** static text `onetime`.
- Rename the automatic None branch `Recurring Service`.
- Put the one-time SMS under One-Time Cleanup and the recurring SMS under Recurring Service.
- Under **Email**, add the service-request email below.
- Under **Phone Call**, add an ordinary **Add Task** action named `Create Call Task — Service Request`. Use title `Call customer about service request — [Inbound firstName] [Inbound lastName]`, include inbound phone, service address, preferred contact, request ID, and `quoteSummary` in the description, assign it to the caller, and use the next appropriate business-hours due time. The common route-review task has already been created above the router.
- Under **Invalid Contact Preference**, add only an internal alert.

Recurring SMS:

> Purge Pros: Hi [First name]—we received your service request. We’re confirming the best recurring service day for your area and will text you with the proposed day. Nothing is scheduled or charged yet. Msg frequency varies. Msg & data rates may apply. Reply HELP for help or STOP to opt out.

One-time SMS:

> Purge Pros: Hi [First name]—we received your one-time cleanup request. We’ll review the details and follow up with availability. Nothing is scheduled or charged yet. Msg frequency varies. Msg & data rates may apply. Reply HELP for help or STOP to opt out.

Email subject:

`We received your Purge Pros request`

Email body:

> Hi [First name],
>
> We received your Purge Pros service request. Our team will review your service area and the best available service day, then follow up using the contact method you selected. Nothing has been scheduled or charged yet.
>
> Your submitted details:
>
> [quoteSummary]
>
> Purge Pros  
> (317) 961-5865

For Phone Call preference, do not send an SMS. The shared route-review task already exists; this branch adds only the separate assigned call task. Do not use Manual Call in this intake workflow: Manual Call holds the contact active until staff explicitly clears the manual action, which can prevent another inbound submission from re-entering in the meantime.

### 8.8 `estimate_requested` branch

Under **Opportunity Found → Update Opportunity**, add **Internal Notification** named `Notify Team — Custom Estimate`, send it to the estimator, and use:

**Title:** `ACTION REQUIRED: Custom estimate — [Inbound firstName] [Inbound lastName] — [Inbound zip]`

**Body:**

> A customer submitted a Purge Pros configuration that requires manual pricing review.
>
> Name: [Inbound firstName] [Inbound lastName]  
> Phone: [Inbound phoneE164]  
> Email: [Inbound email]  
> Preferred contact: [Inbound preferredContact]  
> Service address: [Inbound serviceAddress]  
> Requested plan: [Inbound frequency]  
> Request ID: [Inbound requestId]
>
> Submitted details:
>
> [Inbound quoteSummary]
>
> Next step: review the yard/service configuration, prepare accurate pricing, and respond using the customer's selected contact method. Nothing is confirmed or charged yet.

Immediately after that notification, add a task action named `Prepare Custom Estimate Task` with title:

`Prepare custom yard estimate — [First Name] [Last Name] — [zip]`

Assign it to the estimator, use a same-business-day due date, and include inbound `quoteSummary` in the description. Add `Contact Preference Router — Custom Estimate` immediately after the task. Under **Opportunity Not Found → Create Opportunity**, point Go To to `Notify Team — Custom Estimate`, not directly to the task or router.

Inside the router:

- Text — Allowed → send the custom-estimate SMS below.
- Email → send the custom-estimate email below.
- Phone Call → add ordinary **Add Task** named `Create Call Task — Custom Estimate`, title it `Call customer about custom estimate — [Inbound firstName] [Inbound lastName]`, assign it for the next appropriate business-hours time, and do not send SMS.
- Invalid Contact Preference → copy the same internal-only invalid-preference alert used in Service Requested. Change its action name to `Alert — Invalid Preference — Custom Estimate`. Do not contact the customer from this fallback.

Custom-estimate SMS:

> Purge Pros: Hi [First name]—we received your request. This setup needs a quick custom review, and we’ll follow up with pricing and availability. Nothing is scheduled or charged yet. Msg frequency varies. Msg & data rates may apply. Reply HELP for help or STOP to opt out.

Email subject:

`Your Purge Pros custom estimate request is in`

Email body:

> Hi [Inbound firstName],
>
> We received your Purge Pros custom estimate request. Your yard or service configuration needs individual review before we can confirm pricing. A team member will review the submitted details and follow up using the contact method you selected. Nothing has been scheduled or charged yet.
>
> Your submitted details:
>
> [Inbound quoteSummary]
>
> Purge Pros  
> (317) 961-5865

Build every bracketed value with **Inbound Webhook Trigger**. Do not invent a price or schedule for this branch.

### 8.9 `quote_requested` branch

This is a quote copy, not a service request. Do not create a route-review task and do not claim that service has been scheduled.

Under **Opportunity Found → Update Opportunity**, add `Contact Preference Router — Quote Copy` immediately. Under **Opportunity Not Found → Create Opportunity**, point Go To directly to that router.

Do not add a general internal notification before this router. A routine quote-copy request is automatically fulfilled and does not require staff work. If the customer selected Phone Call, the Phone Call branch's assigned call task supplies the required staff queue item. This avoids noisy alerts that train the team to ignore truly action-required notifications.

Inside the router:

- Text — Allowed → send the quote-copy SMS below.
- Email → send the quote email below.
- Phone Call → add ordinary **Add Task** named `Create Call Task — Quote Request`, title it `Call customer about quote — [Inbound firstName] — [Inbound zip]`, assign it for the next appropriate business-hours time, and do not send SMS.
- Invalid Contact Preference → copy the same internal-only invalid-preference alert and rename it `Alert — Invalid Preference — Quote Copy`.

Quote-copy SMS:

> Purge Pros: Hi [Inbound firstName]—your [Inbound frequency] scoop-service quote is $[Inbound perVisitPrice] per visit. We saved your yard and service selections. This is a quote, not a confirmed service day. Reply here if you’d like us to review availability. Msg frequency varies. Msg & data rates may apply. Reply HELP for help or STOP to opt out.

This keeps Quote Copy to one clear Text action without referring to a removed add-on.

Email subject:

`Your Purge Pros quote`

Email body:

> Hi [Inbound firstName],
>
> Here is a copy of the Purge Pros quote you requested:
>
> [Inbound quoteSummary]
>
> This quote is not a confirmed service day, appointment, or charge. Reply to this email if you would like our team to review service availability.
>
> Purge Pros  
> (317) 961-5865

Do not enroll quote-copy contacts in promotional SMS nurture. This widget's `consent=yes` value covers only the requested quote/service conversation and is not marketing permission.

### 8.10 `question_submitted` branch

Under **Opportunity Found → Update Opportunity**, add **Internal Notification** named `Notify Team — Website Question`, send it to the person monitoring new leads, and use:

**Title:** `ACTION REQUIRED: New website question — [Inbound firstName] — [Inbound zip]`

**Body:**

> A customer submitted a question through the Purge Pros quote experience.
>
> Name: [Inbound firstName]  
> Phone: [Inbound phoneE164]  
> Email: [Inbound email]  
> Preferred contact: [Inbound preferredContact]  
> Question: [Inbound question]  
> Request ID: [Inbound requestId]
>
> Related quote details:
>
> [Inbound quoteSummary]
>
> Next step: review the question and respond using the customer's selected contact method. Do not send service-confirmation language unless the customer separately requests service.

Immediately after that notification, add a task action named `Reply to Website Question Task` with title:

`Reply to website question — [First Name] — [zip]`

Assign it to the person monitoring new leads and include inbound `question`, contact information, and `quoteSummary` in its description. Add `Contact Preference Router — Website Question` immediately after the task. Under **Opportunity Not Found → Create Opportunity**, point Go To to `Notify Team — Website Question`, not directly to the task or router.

Inside the router:

- Text — Allowed → send the question acknowledgment below.
- Email → send an acknowledgment containing the inbound `question`.
- Phone Call → add ordinary **Add Task** named `Create Call Task — Website Question`, title it `Call customer about website question — [Inbound firstName] — [Inbound zip]`, assign it for the next appropriate business-hours time, and do not send SMS.
- Invalid Contact Preference → copy the same internal-only invalid-preference alert and rename it `Alert — Invalid Preference — Website Question`.

Question SMS:

> Purge Pros: Hi [Inbound firstName]—we received your question and will reply as soon as we can. If there’s anything else we should know, reply here. Msg frequency varies. Msg & data rates may apply. Reply HELP for help or STOP to opt out.

Email subject:

`We received your Purge Pros question`

Email body:

> Hi [Inbound firstName],
>
> We received your question and will respond as soon as we can.
>
> Your message:
>
> [Inbound question]
>
> Details submitted with your question:
>
> [Inbound quoteSummary]
>
> Purge Pros  
> (317) 961-5865

For Email, send an acknowledgment with the inbound `question` included. For Call, use the assigned Add Task action described above. Do not send a service confirmation.

### 8.10a Automatic `Unexpected Stage` branch

This is the automatic None branch of the main stage router from section 8.4, not one of the contact-preference routers. Add exactly one **Internal Notification**:

- **Action name:** `Alert — Unexpected Widget Stage`
- **Title:** `Unrecognized v3 widget stage — inspect submission`
- **Recipient:** the person monitoring website leads
- **Message:**

> A Purge Pros widget submission reached the workflow with an unexpected stage value.
>
> Stage: [Inbound stage]  
> Request ID: [Inbound requestId]  
> Name: [Inbound firstName] [Inbound lastName]  
> Phone: [Inbound phoneE164]  
> Email: [Inbound email]  
> Preferred contact: [Inbound preferredContact]
>
> Submitted details:
>
> [Inbound quoteSummary]
>
> Inspect the inbound payload and contact note before responding manually.

Insert the bracketed values with **Inbound Webhook Trigger**. Do not add Find Opportunity, Create/Update Opportunity, SMS, Email, customer call task, or DND actions to Unexpected Stage.

### 8.11 Publish only after branch review

Review each branch and confirm:

- it writes to the new v3 pipeline;
- it does not apply a legacy trigger tag;
- it checks reply preference before choosing a channel;
- Text requires `preferredContact Is text` and `consent Is yes`; HighLevel supplies its built-in SMS-DND enforcement;
- Call never sends an SMS;
- Quote and Question do not fire service confirmation language;
- the contact note uses `quoteSummary`;
- service/custom requests create the appropriate staff task.

Then publish `Purge Pros — Widget Intake v3`.

## 9. What happens to the old workflows

Your screenshots show nine named workflow entries because `Workflow 4b` is a separate workflow even though the numbering treats it as a companion to Workflow 4. Nothing should be deleted.

During setup, leave every old workflow Published. At the coordinated cutover, Workflow 1 is the one exception: after the website is serving v3 and its short script cache has expired, turn Workflow 1 Draft/off before enabling multiple opportunities per contact. This prevents the global opportunity setting from changing how the old intake creates/moves opportunity cards. V3 does not use any legacy webhook trigger tags.

| Existing workflow | Launch action | Retirement action |
|---|---|---|
| Workflow 1 — Quote Widget — Intake | Leave Published during setup. After the website switches to v3 and the cache expires, put it Draft/off before enabling multiple opportunities per contact. | Keep Draft/off while v3 is live. For rollback, first turn the opportunity setting off, then republish this workflow. |
| Workflow 2 — Instant Quote Text | Leave Published for contacts already enrolled. V3 never uses `quote-unlocked`. | Draft/off when active executions are zero. |
| Workflow 3 — Abandoned Quote Nurture | Leave Published for contacts already enrolled. V3 has no phone-gate abandonment nurture. | Draft/off when active executions are zero. |
| Workflow 4 — Booking Confirmation | Leave Published for old `service-requested` contacts. | Draft/off after its legacy executions drain. The v3 intake now sends its own acknowledgment. |
| Workflow 4b — Scheduling Reminder | Leave Published for old route-review reminders. | Draft/off after its legacy executions drain. The v3 intake creates the new route-review task. |
| Workflow 5 — Custom Estimate Request | Leave Published for old `estimate-requested` contacts. | Draft/off after its legacy executions drain. |
| Workflow 6 — Question Asked | Leave Published for old `question-asked` contacts. | Draft/off after its legacy executions drain. |
| Workflow 7 — Out-of-Area Waitlist | Leave Published for old submissions. V3 checks ZIP before contact collection and does not submit out-of-area contacts. | Draft/off after legacy executions drain. |
| Workflow 8 — Stop Automation on Reply | Leave Published until Workflows 2 and 3 have no active executions. | Turn this one off last, after the old quote/nurture workflows are off. |

Recommended drain period for Workflows 2–8/4b: keep them available for at least 14 days after cutover, then check each workflow's active/enrolled execution list. An active legacy conversation is more important than the calendar: do not turn off a workflow that still has people waiting in it. Workflow 1 is turned off earlier because it is the old intake/opportunity creator, not a wait-based follow-up sequence.

Do not remove old contacts, notes, opportunities, workflow history, or the old pipeline. Draft/off is enough.

## 10. Private launch test matrix

Before changing the website script, test the Cloudflare `/demo` page and confirm each result in HighLevel.

| Test | Expected widget result | Expected GHL result |
|---|---|---|
| Press Enter after valid ZIP | Same as Check availability | No contact yet |
| Ineligible ZIP | Clear out-of-area result before contact | No contact and no opportunity |
| Standard weekly quote | Exact price shown before contact | No record until customer submits |
| Select 6 dogs | Weekly and Every Other Week are disabled; Twice Weekly, One-Time Cleanup, and Custom Booking remain available | No record until submission |
| Select 5 dogs | Every Other Week is disabled; other eligible choices remain available | No record until submission |
| Select 10+ dogs | Recurring published frequencies are disabled and Custom Booking is selected; One-Time Cleanup remains available | Custom Estimate if Custom Booking is submitted |
| Select Over 1 acre | Published frequencies are disabled and Custom Booking is selected | Custom Estimate if submitted |
| Select Custom Booking directly | Card identifies 10+ dogs, over 1 acre, kennels and commercial work; no price is invented | Custom Estimate stage |
| Two or three service areas selected | Price line names each selected area; no generic `2 service areas` wording | Named areas appear in note |
| Unsupported combination, such as weekly with 6 dogs | Custom estimate, no invented price | Custom Estimate stage |
| Text selected, service checkbox unchecked | Blocking warning with option to choose Email/Phone Call | No submission |
| Text selected, service checkbox checked | Submit allowed | Operational quote/service SMS only |
| Email selected | Submit without SMS consent | Email only; no SMS |
| Phone call selected | Submit with valid phone | Call task only; no SMS |
| Quote copy | Quote receipt language | Quote / Inquiry Follow-Up, not service requested |
| Question | Question receipt language | Quote / Inquiry Follow-Up plus reply task |
| Recurring request | Route-review language | Service Requested / Route Review plus task |
| One-time request | Cleanup-availability language | Service Requested / Route Review plus task |
| Same phone/email, same service address submitted again while Open | Submission accepted | Existing property opportunity updated; no duplicate contact/card |
| Same phone/email, different service address | Submission accepted | Same contact, separate property-specific opportunity after the cutover opportunity setting is enabled |
| Back buttons | Return through each pre-submit step without losing safe plan choices | No duplicate record |
| Success screen | No Back button because the request is already transmitted | Exactly one accepted request ID |
| Phone input | Letters/extra digits rejected or normalized to 10 digits | Normalized `+1` phone |

The final success screen deliberately has **Done**, not Back. Once HighLevel has accepted the request, going backward would suggest the already-sent record could be edited. Closing and reopening starts a new quote if the customer truly needs another submission.

## 11. Analytics verification before public cutover

Do not create new pixels, tags, conversion actions, GTM triggers, GA4 properties, or ad campaigns.

The v3 contract is:

| Customer action | Google `generate_lead` | Google Ads direct conversion | Meta browser `Lead` | Meta CAPI `Lead` |
|---|---:|---:|---:|---:|
| Standard service request accepted | Yes | Yes | Yes | Yes |
| Custom estimate request accepted | Yes | Yes | Yes | Yes |
| Quote copy accepted | No | No | No | No |
| Question accepted | No | No | No | No |
| ZIP/price/form step | No | No | No | No |

The direct Google Ads conversion uses the current service-request `send_to` label. The old phone-unlock label `AW-17767139897/vX_bCO_4kL4cELmUhJhC` is intentionally absent because v3 has no phone gate.

The Meta browser event and server CAPI event share the same request-based `eventID`; Meta should display one deduplicated Lead rather than two independent Leads.

After the v3 workflow works, place the new script temporarily on a non-ad test page or website preview that has the real analytics tags and submit one marked test service request. Confirm:

1. one accepted request in HighLevel;
2. one Google Ads conversion request using the retained label;
3. one Meta browser Lead and one matching server event ID;
4. Meta reports the pair as deduplicated;
5. a quote-copy test does not fire service conversions;
6. no `/submit-true` page or redirect is involved.

Do not repeatedly submit production service-conversion tests. Keep the request ID so test records can be identified.

## 12. Public website cutover

Only after the v3 workflow and tests pass:

1. Open the GHL website/funnel custom code area that currently loads the quote script.
2. Find the existing `purge-quote.js` script tag.
3. Change only its `src` to:

```html
<script src="https://purge-lead-relay.purgepros.workers.dev/purge-quote.js" defer></script>
```

4. Save and publish the website.
5. Hard-refresh and confirm the website now loads the v3 experience. Allow at least five minutes for the old script cache/open pages to clear.
6. Put **Workflow 1 — Quote Widget — Intake** in Draft/off. Keep Workflows 2–8/4b Published for their already-enrolled contacts.
7. In HighLevel, keep **Allow Duplicate Contacts** off.
8. Enable the separate opportunity setting: **Settings → Business Profile → General → Allow Duplicate Opportunity**, or in the newer navigation **Settings → Objects → Opportunities → Allow Multiple Opportunities per Contact**.
9. From the Cloudflare `/demo`, submit two service requests using the same phone/email but two different test service addresses. Confirm HighLevel keeps one contact and creates two property-specific v3 opportunities.
10. Submit the same address once more while its opportunity is Open. Confirm Find Opportunity updates that property card instead of creating a third card.
11. Do not paste the widget's generated source into GHL.
12. Do not delete the old script from Cloudflare.

### Button links

Every quote CTA should be an ordinary URL/link action with either:

- `#quote`; or
- `#get-quote`.

If a button currently uses GHL's built-in **Open Popup** action, change it to a URL/link action pointing to `#quote`. The script intercepts that link.

The same button works on every device:

- desktop/tablet displays the polished centered overlay;
- mobile displays the same experience full-screen inside the current page.

There is no separate mobile link and no second GHL popup to maintain.

### Paid-ad links that open the quote automatically

For Meta or another paid channel, use the branded website landing URL below instead of the Cloudflare preview:

```text
https://itspurgepros.com/?open_quote=1
```

When that page loads, the website widget opens automatically. Desktop receives the overlay and mobile receives the responsive full-screen presentation. The widget removes the one-time `open_quote` instruction after opening so closing and refreshing does not immediately reopen it.

In Meta Ads Manager, keep the Website URL above in the ad's **Destination** field. Put this separate string in the ad's **URL parameters** / **Build a URL parameter** field:

```text
utm_source={{site_source_name}}&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}
```

Do not add a leading `?` to the URL-parameter field. Meta appends the values to the Website URL, and the widget preserves them with `fbclid`, `_fbp`, and `_fbc` for attribution. These tracking labels do not display inside the quote and do not fire a conversion.

## 13. Live operational handoff

When a v3 service request reaches `Service Requested / Route Review`:

1. Review address, ZIP, plan, yard details, and notes.
2. Manually determine the correct route/service day.
3. Text/email/call the proposed day using the customer's recorded preference.
4. Do not claim the appointment is confirmed before the customer approves it.
5. When the customer approves the day, move the opportunity to `Booked`.
6. Create/update the customer and job in Housecall Pro.
7. Send the HCP secure card request link through the appropriate registered channel.
8. Never copy raw card information into GHL, Cloudflare, or a note.
9. After HCP setup and secure payment method are complete, move the opportunity to `Won` and set it Won.
10. If the customer declines or stops, use HighLevel's native Lost/Abandoned status and record the reason.

Automatic route scheduling is deliberately outside this launch. The workflow creates a clear manual task so speed improves without introducing incorrect route promises.

## 14. Rollback

If any customer-facing problem appears after cutover:

1. Turn **Allow Duplicate Opportunity / Allow Multiple Opportunities per Contact** off. Do not change Allow Duplicate Contacts.
2. Republish **Workflow 1 — Quote Widget — Intake**.
3. In the GHL website code, change the script URL back to the prior `purge-quote` Worker URL.
4. Save and publish.
5. Confirm an old quote opens and reaches Workflow 1.
6. Leave `Purge Pros — Widget Intake v3` published only long enough to finish any v3 request already submitted, or put it in Draft if it is itself causing the issue.
7. Keep the remaining old workflows Published during the initial rollback window.

If the relay deployment itself is the problem, first restore the website's old script URL, then use **Cloudflare → purge-lead-relay → Deployments → Roll back** to the previous deployment.

Do not delete the new pipeline, rotate working secrets, change ad campaigns, or remove historical records during rollback.

## 15. Definition of launch complete

The overhaul is complete when all of the following are true:

- the new pipeline exists in the exact five-stage order;
- the four minimal contact fields exist;
- the two property/request opportunity fields exist;
- duplicate contacts remain off;
- multiple opportunities per contact is enabled only after legacy Workflow 1 is off;
- the one v3 workflow is published and uses no legacy trigger tags;
- `purge-lead-relay` has both webhook secrets and the origin allowlist;
- the tested paste-ready file is deployed unchanged;
- all private test branches reach the correct pipeline stage/channel/task;
- service/custom requests produce one accepted Google lead and one deduplicated Meta lead;
- quote/question requests do not count as service conversions;
- the website loads the new script;
- every CTA uses `#quote` or `#get-quote`;
- manual route approval and HCP secure setup work as intended;
- old workflows remain available until their active executions drain;
- the rollback URL is retained.

## 16. Official dashboard references

- HighLevel Inbound Webhook trigger and Test Trigger mapping: <https://help.gohighlevel.com/support/solutions/articles/48001237383>
- HighLevel Add to Notes action: <https://help.gohighlevel.com/support/solutions/articles/155000003143-action-add-to-notes>
- HighLevel Find Opportunity: <https://help.gohighlevel.com/support/solutions/articles/155000004751-workflow-action-find-opportunity>
- HighLevel Update Opportunity: <https://help.gohighlevel.com/support/solutions/articles/155000004753-workflow-action-update-opportunity>
- HighLevel If/Else: <https://help.gohighlevel.com/support/solutions/articles/155000002471-workflow-action-if-else>
- HighLevel Task Notification: <https://help.gohighlevel.com/support/solutions/articles/155000003375-workflow-action-task-notification>
- HighLevel STOP/DND behavior: <https://help.gohighlevel.com/support/solutions/articles/48001186075/>
- HighLevel multiple opportunities for one contact: <https://help.gohighlevel.com/support/solutions/articles/48001066144-multiple-opportunities-for-the-same-person-in-the-same-pipeline>
- HighLevel contact deduplication preferences: <https://help.gohighlevel.com/a/solutions/articles/48001181714?portalId=48000045315>
- Cloudflare Worker secrets: <https://developers.cloudflare.com/workers/configuration/secrets/>
- Google Ads transaction IDs: <https://support.google.com/google-ads/answer/6386790>
