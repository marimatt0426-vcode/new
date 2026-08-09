# Purge Pros Meta/Facebook ads launch guide

**Decision date:** August 9, 2026

**Status:** Approved starting structure

**Initial daily budget:** `$50/day`

This guide records the launch decisions for the redesigned website and v3 quote widget. It supersedes advice based on the former phone-gated `Quote Unlocked` funnel.

## What Meta should optimize for

- Objective: **Leads**
- Conversion location: **Website**
- Dataset/pixel: the existing Purge Pros Meta dataset connected to the production website and Cloudflare CAPI
- Optimization event: standard Meta **Lead**

The v3 `Lead` event represents an accepted `service_requested` or `estimate_requested` submission. The customer must complete the service-request path and Cloudflare must receive acceptance from GoHighLevel. The legacy `Quote Unlocked` event is not part of this funnel and must not be selected as the optimization event.

Quote-copy and question submissions remain useful CRM activity, but they do not fire the service Lead event.

## Initial campaign structure

Use one controlled prospecting campaign:

```text
Campaign: PP | Leads | Website | Indianapolis | V3
  Ad set: PP | Local Prospecting | Broad | $50 Day
    Ad 1: PP | Direct | Dog Closeup
    Ad 2: PP | Problem | Messy Yard
    Ad 3: PP | Outcome | Clean Yard
    Ad 4: PP | Offer | Fee Waived
```

Do not create four separate campaigns or four separate ad sets. At `$50/day`, splitting the budget would slow learning and make it harder to distinguish creative performance from delivery differences.

## Audience

- Target only the real service territory.
- Use the smallest accurate geographic configuration supported by the account; do not include cities or ZIP codes the team cannot reliably serve.
- Begin broad within that service territory rather than stacking narrow dog-owner interests.
- Use adult age ranges that match the actual customer base without unnecessarily restricting delivery.
- Exclude existing customers when a reliable customer list or custom audience is available and current.
- Keep prospecting and retargeting separate if retargeting is introduced later.

The website's ZIP check remains the final operational availability control. It does not justify paying for impressions far outside the realistic route territory.

## Placements and creative controls

- Start with Advantage+ placements unless an actual preview breaks the design or disclaimer.
- Preview Facebook Feed, Instagram Feed, Facebook Stories, and Instagram Stories before publishing.
- Keep Meta's automated text generation and AI creative variations off during the first controlled comparison.
- Do not allow automatic image expansion if it changes the composition, logo, or offer disclaimer.
- Use the same landing page, audience, optimization event, attribution setting, and primary-text length across the initial four-ad comparison.

## Destination and attribution

**Website URL**

```text
https://itspurgepros.com/?open_quote=1
```

**URL parameters**

```text
utm_source={{site_source_name}}&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}
```

Paste the Website URL in the ad's Destination field. Paste only the parameter string in **URL parameters** or **Build a URL parameter**. Do not add a leading `?` and do not paste the destination a second time.

Meta's notice that it stores the campaign, ad-set, and ad names at publication is expected. The dynamic replacements refer to the original published names even if the objects are renamed later. Use clear names before the initial publication.

The widget captures the UTM values and Meta click identifiers before consuming `open_quote=1`. Closing and refreshing does not continually reopen the quote tool.

### Ad-landing startup behavior

The production widget recognizes the ad instruction while the GHL page is still loading. If the script arrives before the page body exists, it displays **Opening your 60-second price check...** and opens the quote as soon as the body is available. It does not wait for the entire homepage, review widgets, or other GHL sections to finish parsing.

This behavior is intentionally limited to URLs containing `open_quote=1` or the supported quote hash. Ordinary homepage visits do not receive a loading overlay, and normal website quote buttons retain their instant click behavior. Attribution is captured before the one-time instruction is removed.

## Why the starting budget is $50 per day

`$50/day` is a deliberate middle position, not a universal Meta rule:

- `$35/day` would reduce financial exposure but could make the first read too slow when locally reported acquired-customer costs are around `$75–$150`.
- `$75/day` can produce decisions faster, but it increases the cost of learning before the new creative and redesigned funnel have proven themselves.
- `$50/day` equals `$350/week`, which is enough to generate a useful first operating sample without treating an unproven launch as a mature campaign.

The community figures discussed are closer to **cost per acquired customer** than ordinary top-of-funnel CPL. They are directional context, not a guaranteed Purge Pros outcome. The correct budget ultimately depends on contribution margin, retention, route density, close rate, and operational capacity.

## Launch and evaluation window

1. Confirm production browser and CAPI Lead events are deduplicating.
2. Publish the four ads together.
3. Avoid routine edits during the first 72 hours unless there is a broken link, policy problem, incorrect claim, tracking failure, or obvious geographic error.
4. Let the initial test reach at least seven days and approximately `$350` of spend before drawing a normal conclusion.
5. Do not judge from clicks alone or from one early lead.

Urgent reasons to intervene early:

- No delivery
- Broken landing page or quote tool
- Leads not reaching GoHighLevel
- Duplicate browser/server conversions
- Spend outside the service area
- Materially misleading creative or offer language
- Extreme lead-quality failure visible across multiple submissions

## Scorecard

Record these by campaign, ad set, and ad:

| Metric | Meaning |
|---|---|
| Spend | Media cost |
| Landing-page views | People who reached the site |
| Accepted Meta Leads | Completed service/custom-estimate requests counted by the widget |
| GHL requests | Matching CRM submissions |
| Route-approved prospects | Requests the team can actually serve |
| Customers created in HCP | Operational customer setup completed |
| Won customers | Route approved and payment/customer setup complete |
| Cost per accepted Lead | Spend / accepted Meta Leads |
| Cost per route-approved prospect | Spend / route-approved prospects |
| Cost per acquired customer | Spend / Won customers |

The business decision metric is cost per acquired customer and resulting customer value—not Meta's raw form count.

## Scaling and cutting rules

- Keep a creative when it generates qualified requests at an economically acceptable cost.
- Do not keep an ad solely because its click-through rate is high.
- Do not kill an ad solely because another ad received Meta's early delivery preference.
- When a winner is stable, increase budget gradually rather than making repeated daily changes.
- Introduce one new creative angle at a time after the initial comparison.
- If `$50/day` cannot produce enough accepted requests to evaluate after a reasonable test window, diagnose the offer, creative, geography, delivery, and funnel before simply doubling spend.
- If results are strong and operations can accept more customers, move toward `$60–$75/day` in measured steps and watch acquired-customer cost and route quality.

## Future optimization event

At current volume, the accepted service-request Lead gives Meta more usable signal than a much rarer downstream customer event. Continue judging actual quality in GoHighLevel and Housecall Pro.

If the business later produces enough consistent downstream conversions, consider sending a separate qualified or Won event through CAPI and testing optimization toward it. Do not replace the working Lead event until the downstream event is reliable, deduplicated, timely, and sufficiently frequent.

## Related files

- `docs/ads-tracking-setup.md`
- `docs/facebook-ads/META-AD-COPY-PACK.md`
- `docs/facebook-ads/FINAL-CREATIVE-QA.md`
- `ads/meta/01-direct-service.png`
- `ads/meta/02-problem-solution.png`
- `ads/meta/03-clean-yard-outcome.png`
- `ads/meta/04-initial-cleanup-offer.png`

## Reference

- Meta Conversions API: <https://developers.facebook.com/docs/marketing-api/conversions-api/>
