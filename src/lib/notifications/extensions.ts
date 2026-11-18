/**
 * Notifications (the bell in each shell's header): the activity log's entries a user should know
 * about, picked by rules (`#lib/server/notifications/`). A rule is a value: who it's for, its
 * category, and the SQL condition on `activity` an entry matches. The core's rules are in
 * `#lib/server/notifications/rules.ts`; a module adds its own here, in its `server/index.ts`:
 *
 * ```ts
 * contribute(notificationRules, () => [
 * 	{ id: "docks.doorAlerts", audience: "office", category: "alerts", where: () => doorAlerts },
 * ]);
 * ```
 *
 * A module that's off adds none (the kernel asks only the modules that are on).
 */
import type { SQL } from "drizzle-orm";

import { defineCollector } from "#lib/extensions/define.ts";

/** Whose bell a rule rings: the office's, the engineer portal's, or the customer portal's. */
export type NotificationAudience = "office" | "engineer" | "customer";

/** What an office notification is about: its icon in the tray. */
export const officeCategories = ["reports", "alerts", "field", "mine"] as const;

/** What an engineer's notification is about: its icon in the tray. */
export const engineerCategories = ["assigned", "planned", "unassigned", "cancelled"] as const;

/**
 * What a customer's contact's notification is about: their orders accepted or rejected, planned or
 * moved, the engineer on the way, resolved, or cancelled.
 */
export const customerCategories = [
	"accepted",
	"rejected",
	"planned",
	"on_the_way",
	"resolved",
	"cancelled",
] as const;

type OfficeCategory = (typeof officeCategories)[number];
type EngineerCategory = (typeof engineerCategories)[number];
type CustomerCategory = (typeof customerCategories)[number];
export type NotificationCategory = OfficeCategory | EngineerCategory | CustomerCategory;

/**
 * The signed-in engineer's orders, as conditions on an `activity` entry, built by
 * `engineerActivity()` (`#lib/server/auth/engineer.ts`, where the engineer's id is read).
 */
export interface EngineerActivity {
	/** An entry whose changes give the order to the engineer (`engineerId` becomes theirs). */
	assigned: SQL;
	/** An entry whose changes take the order off the engineer (`engineerId` was theirs). */
	unassigned: SQL;
	/** An entry about an order that's the engineer's now (`engineerOrders()`). */
	aboutTheirOrder: SQL;
}

/**
 * The orders a customer's contact reads, as a condition on an `activity` entry, built by
 * `notificationsFor("customer")` from the access registry's `order` rule for them.
 */
export interface CustomerActivity {
	/** An entry about an order the contact may read now (their customer's, at their sites). */
	aboutTheirOrder: SQL;
}

/** What a rule's condition is built with, per request. */
interface RuleContext {
	/** The signed-in user's id: whose records are "mine". */
	userId: string;
	/** The engineer's orders, for the engineer's rules (`null` for the other audiences'). */
	engineer: EngineerActivity | null;
	/** The contact's orders, for the customer's rules (`null` for the other audiences'). */
	customer: CustomerActivity | null;
}

/**
 * A rule: an `activity` entry that `where` keeps is a notification of `category` for the
 * `audience`. Never the user's own entries, nor another tenant's, nor older than the window: the
 * query adds that. A rule may read the entry's columns (`action`, `subjectType`, `changes`, its
 * user) and the tenant's tables, correlated on `activity`; it binds only what it must (the user,
 * the engineer), writing its constants in with `literal()`.
 */
export interface NotificationRule {
	/** E.g. `orders.reported`, or `docks.doorAlerts` (the module's id first). */
	id: string;
	audience: NotificationAudience;
	category: NotificationCategory;
	where: (context: RuleContext) => SQL;
}

/**
 * The modules' notification rules: each module that's on answers its rules, at once. A module whose
 * rules fail is left out (and logged), so the bell still rings for the rest.
 */
export const notificationRules = defineCollector<void, NotificationRule[]>("notifications.rules", {
	onError: "skip",
	now: true,
});
