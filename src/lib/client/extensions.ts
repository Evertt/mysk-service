/**
 * The customer portal's extension points (`src/routes/(customer)/portal`): where modules add to
 * its pages (see `#lib/extensions/define.ts`). The components load their own data through their
 * module's remote functions made for customers' contacts (`moduleRemote(id, "customer")`), which
 * scope it to the contact's customer and sites (`#lib/server/auth/customer.ts`). A module's own
 * pages in the portal are its routes in the `(customer)` group, listed in the portal's navigation
 * by its manifest's `portal` (see `#lib/modules/manifests.ts`).
 */
import { defineSlot } from "#lib/extensions/define.ts";

/** Cards on the portal's home page, after the open orders: e.g. the units needing attention. */
export const home = defineSlot<Record<string, never>>("client.home");

/**
 * Cards on the portal's page of one of the customer's orders, after its units: e.g. its checklists'
 * results and the signed work order to print.
 */
export const order = defineSlot<{ number: string }>("client.order");

/*
 * The portal's page of one of the customer's units (`portal/equipment/[serial]`, what scanning its
 * QR code opens) takes modules' parts in three places, by what they show:
 *
 * - `client.unit.badges`: a badge beside the unit's status in its card at the top (condition's);
 * - `client.unit.facts`: one fact in the grid below them, a `<dl>` of one `<DetailItem>` (checklists'
 *   inspection status, maintenance's last visit), two to a row;
 * - `client.unit`: a card after the page's main button and its links (checklists' completed
 *   inspections).
 *
 * Each component gets the unit's serial number and reads only what a customer may see of it.
 */

/** A badge beside the unit's status, at the top of its page: e.g. its condition. */
export const unitBadges = defineSlot<{ serialNumber: string }>("client.unit.badges");

/** A fact in the grid of the unit's card (a `<dl>` with one `<DetailItem>`): e.g. its last visit. */
export const unitFacts = defineSlot<{ serialNumber: string }>("client.unit.facts");

/** Cards on the portal's page of one of the customer's units: e.g. its completed inspections. */
export const unit = defineSlot<{ serialNumber: string }>("client.unit");
