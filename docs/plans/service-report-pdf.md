# Signed service reports as PDFs

An idea of 23 October 2026 (Cloudflare features worth using), not grilled yet. It's one of three,
with [email-to-order.md](email-to-order.md) and [voice-notes.md](voice-notes.md).

## Problem

When an order is completed, the customer expects a work order (werkbon) they can keep: what was
done, by whom, and both signatures. The checklists module can print one (`loadWorkOrder` in
`src/modules/checklists/server/work-order.ts`), but only from the browser's print dialog. Nobody
gets it by mail, and nothing keeps the version that was signed.

## Idea

When an order is completed, render its work order to a PDF with Cloudflare's **Browser
Rendering**, store it in **R2**, mail it to the customer's contact, and show it in the customer
portal and on the order. The PDF is the record of what was signed, so it doesn't change when the
order is edited later.

## Design

### What's rendered

- The work record as `readWorkRecord()` gives it to the customer: the order, the units at their
  sites, the sign-off with both signatures, and the checklists when that module is on. One page
  route, `/orders/[number]/report` (print styles, no app shell), which the printed work order and the
  PDF share. Moving the printed work order out of the checklists module into core, with checklists
  filling a slot, is the first step.
- The tenant's logo, name and address in the header (a settings field each).
- In Dutch or English, by the customer's language, not the engineer's.

### Rendering

- `@cloudflare/puppeteer` with a `BROWSER` binding. The Worker opens the report route with a
  short-lived signed token, so the browser needs no session, and calls `page.pdf()`.
- It runs **after** the completion's transaction, never inside it: Browser Rendering takes seconds,
  and on Cloudflare a transaction holds every other request. `afterCommit()` enqueues a job (a
  **Queue**, or a Workflow: render → store → mail, each step retried).
- On Node (local development, the e2e tests) a local Chromium through Playwright renders it instead,
  behind the same function. Or Node skips the PDF and tests check the HTML.

### Storing and sending

- The PDF goes to R2 (`REPORTS` bucket) under the tenant and order, with a row in a `service_report`
  table (order, version, created at, sent to). A new completion (after reopening) makes a new
  version; old ones stay.
- Mail to the order's contact through `sendMail()`, with the PDF attached (that needs attachments in
  `Mail`). The activity log records "report sent to …".
- The customer portal's order page links to it. So does the office's order page, with "send again".

## Open questions

- Who receives it: the contact who reported it, the site's contact, or an address on the customer?
  Probably a "reports go to" field on the customer, falling back to the contact.
- Sending as the tenant (their domain, their reply-to) or as Fieldworks? Reply-to the tenant is the
  minimum.
- Is the PDF also the invoice's attachment, for the invoicing module?
- Browser Rendering's limits and price per page at our volumes.

## Steps

1. The report route in core (the printed work order moves there; checklists fill a slot).
2. Rendering to PDF and storing it in R2 after completion, linked on the order.
3. Mailing it, and the customer portal's link.
4. Versions and "send again".

## Tests

- Server specs: a customer's contact can only fetch their own customer's reports, and only for their
  sites' units; North can't fetch South's by tampering with the id.
- E2e: complete an order in the engineer portal, then find the report on the order and in the
  outbox (`MAIL_OUTBOX`).
