/**
 * The tenant's order type settings on the server (see `#lib/orders/types.ts`): which types
 * something needs offered, the settings as they work for the request's tenant, the labels the
 * server renders, and saving a manager's change, logged.
 */
import { getRequestEvent } from "$app/server";
import { invalid } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";

import { type OrderType, orderTypes } from "#lib/models.ts";
import { type AppModule, modules } from "#lib/modules/manifests.ts";
import { locales } from "#lib/paraglide/runtime.js";
import { recordActivity } from "#lib/server/activity/index.ts";
import { currentTenant, inTenant, systemTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { orderTypeSetting } from "#lib/server/db/schema.ts";

import {
	effectiveOrderTypes,
	nameOrderTypes,
	type OrderTypeProblem,
	orderTypeProblems,
	type OrderTypeSetting,
	type OrderTypeSettings,
} from "../types.ts";

/**
 * The types that must stay offered for a tenant with `enabled` modules, each with what needs it,
 * by name: breakdowns, which customers report in the customer portal, and the types the tenant's
 * modules make orders of or work with (`orderTypes` in their manifests, e.g. maintenance plans').
 */
export function requiredOrderTypes(enabled: readonly string[]): Map<OrderType, string[]> {
	const required = new Map<OrderType, string[]>([
		["breakdown", [m.orders_types_customer_portal()]],
	]);
	for (const module of modules as readonly AppModule[]) {
		if (!enabled.includes(module.id)) continue;
		for (const type of module.orderTypes ?? []) {
			required.set(type, [...(required.get(type) ?? []), module.label]);
		}
	}
	return required;
}

/**
 * The current tenant's settings as they work: as stored, but a type something needs offered isn't
 * hidden (`effectiveOrderTypes()`).
 */
export function tenantOrderTypes(): OrderTypeSettings {
	const { orderTypes: stored = {}, modules } = currentTenant();
	return effectiveOrderTypes(stored, new Set(requiredOrderTypes(modules).keys()));
}

/**
 * The request's tenant's settings as stored, for the labels: the system's tenant in a daily job,
 * else the signed-in user's; none outside a request (scripts).
 */
function requestOrderTypes(): OrderTypeSettings | undefined {
	const system = systemTenant();
	if (system) return system.orderTypes;
	try {
		return getRequestEvent().locals.tenant?.orderTypes;
	} catch {
		return undefined;
	}
}

/**
 * Makes the labels the server renders and formats use the request's tenant's names (see
 * `nameOrderTypes()`). Called once, by `hooks.server.ts`.
 */
export const nameOrderTypesOnServer = () => nameOrderTypes(requestOrderTypes);

/** Each type with the tenant's setting as stored, and what needs it offered: the settings page's. */
export function orderTypeSetup() {
	const { orderTypes: stored = {}, modules } = currentTenant();
	const required = requiredOrderTypes(modules);
	return orderTypes.map((type) => ({
		type,
		names: stored[type]?.names ?? {},
		hidden: (stored[type]?.hidden ?? false) && !required.has(type),
		requiredBy: required.get(type) ?? [],
	}));
}

/** A type's setting as the activity log compares it: a field per language, `null` for none. */
const logged = (setting: OrderTypeSetting | undefined) => ({
	...Object.fromEntries(
		locales.map((locale) => [`name_${locale}`, setting?.names[locale] || null]),
	),
	hidden: setting?.hidden ?? false,
});

/** Refuses a form with a message on one of its fields (`issue` of a remote form). */
interface TypeIssue {
	hidden(message: string): Parameters<typeof invalid>[number];
	names: Record<(typeof locales)[number], (message: string) => Parameters<typeof invalid>[number]>;
}

/** A problem as the manager reads it, on its field. */
function refusal(problem: OrderTypeProblem, issue: TypeIssue) {
	if (problem.reason === "required") {
		return issue.hidden(m.orders_type_hide_required({ needs: problem.by.join(", ") }));
	}
	return issue.names[problem.locale](m.orders_type_name_taken({ name: problem.name }));
}

/**
 * Gives the tenant's `type` the setting `next` (its names, trimmed; empty for the standard label;
 * and whether it's hidden), and logs it; refuses what `orderTypeProblems()` finds wrong. A setting
 * that's back to standard leaves no row.
 */
export async function saveOrderTypeSetting(
	type: OrderType,
	next: OrderTypeSetting,
	issue: TypeIssue,
) {
	const tenant = currentTenant();
	const names = Object.fromEntries(
		Object.entries(next.names).flatMap(([locale, name]) =>
			name?.trim() ? [[locale, name.trim()]] : [],
		),
	);
	const setting: OrderTypeSetting = { names, hidden: next.hidden };
	const saved = await db.transaction(async (tx) => {
		const rows = await tx
			.select({
				type: orderTypeSetting.type,
				names: orderTypeSetting.names,
				hidden: orderTypeSetting.hidden,
			})
			.from(orderTypeSetting)
			.where(inTenant(orderTypeSetting));
		const stored: OrderTypeSettings = Object.fromEntries(
			rows.map(({ type, names, hidden }) => [type, { names, hidden }]),
		);
		const problems = orderTypeProblems(stored, type, setting, requiredOrderTypes(tenant.modules));
		if (problems.length) invalid(...problems.map((problem) => refusal(problem, issue)));

		const where = and(inTenant(orderTypeSetting), eq(orderTypeSetting.type, type));
		const standard = !setting.hidden && !Object.keys(names).length;
		if (standard) await tx.delete(orderTypeSetting).where(where);
		else {
			await tx
				.insert(orderTypeSetting)
				.values({ organizationId: tenant.organizationId, type, ...setting })
				.onConflictDoUpdate({
					target: [orderTypeSetting.organizationId, orderTypeSetting.type],
					set: setting,
				});
		}
		await recordActivity(tx, {
			action: "updated",
			subject: { type: "order_type", id: type, label: type },
			before: logged(stored[type]),
			after: logged(setting),
		});
		const after: OrderTypeSettings = { ...stored, [type]: setting };
		if (standard) delete after[type];
		return after;
	});
	// The tenant was loaded at the start of this request: bring it up to date, so what this request
	// refreshes (and renders) has the new names.
	const { tenant: loaded } = getRequestEvent().locals;
	if (loaded) loaded.orderTypes = saved;
}
