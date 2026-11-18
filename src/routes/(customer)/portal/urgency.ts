/**
 * An order's priority as the customer portal says it. Its top one reads "Standstill" ("Stilstand"),
 * as the customers say when a door stands still; the office keeps the enum's own label ("Urgent",
 * "Spoed"), so it isn't renamed there.
 */
import { label } from "#lib/i18n/index.ts";
import type { OrderPriority } from "#lib/models.ts";

export const portalPriority = (priority: OrderPriority) =>
	priority === "urgent" ? m.client_urgency_standstill() : label("orderPriority", priority);
