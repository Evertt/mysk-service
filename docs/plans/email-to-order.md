# Orders from email

An idea of 23 October 2026 (Cloudflare features worth using), not grilled yet. It's one of three,
with [voice-notes.md](voice-notes.md) and [service-report-pdf.md](service-report-pdf.md).

## Problem

Most customers report a fault by email, not through the customer portal. Someone in the office
reads the mail, finds the customer, site and unit, and types an order. That's slow, and it's the
office's least favourite job. We sell to the office, so this is where the product shows first.

## Idea

Each tenant gets an intake address, e.g. `acme@in.fieldworks.app` (or forwards their own
`service@acme.nl` to it). A Cloudflare **Email Worker** receives each message. **Workers AI**
reads it and suggests a customer, site, unit and description. The result becomes an **order
awaiting acceptance**, the queue a planner already works through for the customer portal's reports
(`src/lib/orders/server/acceptance.ts`, the `accept` and `reject` verbs in `#lib/orders/lifecycle.ts`). Nothing
is created that a person hasn't accepted.

## Design

### Receiving

- An `email()` handler in `cloudflare/entry.ts`, next to `fetch()`. Email Routing sends every
  address under `in.fieldworks.app` to it. On Node there's no such handler. A dev-only route takes
  a raw `.eml` file, which the e2e tests use too.
- The tenant comes from the address's local part: a column on the organization with its intake
  slug. An unknown address is rejected (`message.setReject()`), so senders find out.
- The raw message is parsed (`postal-mime`) and stored in R2 (`INTAKE_MAIL` bucket) with its
  attachments, under the tenant's id. The order links to it, so the planner can read the original
  and its photos.
- Spam and loops: drop auto-replies (`Auto-Submitted`, `Precedence: bulk`), and cap messages per
  sender per hour.

### Understanding

- The handler doesn't call the model inside a transaction. It enqueues the message (a
  **Queue**, or a Workflow if retries need steps) and returns, and the consumer does the rest.
- **Matching first, AI second.** The sender's address is looked up among the tenant's customer
  contacts. That alone settles the customer for most mail. Serial numbers and order numbers in the
  text are matched exactly against the tenant's units and orders.
- The model (Workers AI, a small instruction model with JSON output) gets the text plus the
  candidates found above. It returns: a short description, a likely unit and site among the
  candidates, an urgency, and whether this is about an existing order. It never invents ids: any id
  it returns that isn't among the candidates is dropped.
- A reply to an existing order (by number in the subject, or `In-Reply-To` of a mail we sent) adds a
  note to that order instead of creating one.

### The order

- `createOrders(tx, drafts)` creates it with status "awaiting acceptance", like the customer
  portal's reports, and `recordActivity` logs it as created by the system with the note "from
  email". The bell's rule for new reports picks it up.
- The acceptance card shows the original mail (subject, sender, text, attachments) beside the
  suggested fields. The planner corrects them and accepts, or rejects with a reason.
- An unknown sender becomes an order without a customer. The card asks the planner to pick or
  create one before accepting.

### Settings

A manager's settings page shows the intake address, a switch to turn it off, and optionally the
domains whose mail is accepted. This could be an optional module (`src/modules/email-intake/`),
since a tenant may not want it.

## Open questions

- Module or core? A module fits "a tenant can switch it off", but it needs a hook in acceptance's
  card.
- Do we answer the sender ("We've received your report, number ORD-…")? That's nice, but it's mail
  sent on the tenant's behalf, which needs their sending domain.
- Which model, and what does it cost per message? Measure on a few hundred real Dutch mails before
  choosing.
- The order data the model sees: Workers AI runs on Cloudflare, so customer data doesn't leave the
  platform. Still worth saying in the privacy terms.

## Steps

1. The intake address per tenant and the Email Worker storing raw mail in R2. A mail becomes an
   order awaiting acceptance with the subject as its description, without AI.
2. Matching by sender and by numbers in the text.
3. The model's suggestions, behind a setting.
4. Replies to existing orders as notes.

## Tests

- Server specs: the parser, the matching, and that a model's made-up id is dropped (with a stubbed
  model). Isolation: mail to North's address never shows a South customer as a candidate.
- E2e: post a fixture `.eml` to the dev route and accept the order on the acceptance card.
