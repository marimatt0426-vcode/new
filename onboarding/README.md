# New-customer onboarding package

This folder contains the self-contained public welcome page for customers whose route day has been manually approved.

## Production file

- `pp-new-customer-welcome-widget.html` — paste the complete file into one GoHighLevel Custom Code element on `https://itspurgepros.com/welcome`.

## Operating rules

- The route day is consistent, but it is not a fixed appointment time.
- The en-route message is a heads-up sent when the technician is generally 10–45 minutes away. Never promise an exact ETA.
- The card is charged per visit when the en-route text is sent, not after completion and not through a monthly subscription.
- The public page contains no customer-specific information, secure Housecall Pro link, webhook, form, or card field.
- The welcome page is informational and must remain `noindex,follow`.
- Send the secure Housecall Pro card request and portal invitation separately.

The complete implementation and messaging instructions are in `docs/onboarding/CUSTOMER-ONBOARDING-GHL-GUIDE.md`.
