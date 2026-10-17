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

/** Cards on the portal's page of one of the customer's units: e.g. its inspection status. */
export const unit = defineSlot<{ serialNumber: string }>("client.unit");
