/**
 * The engineer portal's scope: what a field engineer may reach is the tenant's orders assigned to
 * them. Every query of a `forEngineers` remote function (and a module's
 * `moduleRemote(id, "engineer")`) on orders builds its `where` from these, so another engineer's
 * order (or another tenant's) is a 404, also by a tampered id; units and locations stay the
 * tenant's for every engineer (the QR pages). Records reached through an order (a checklist, a
 * unit on an order) join it and add `engineerOrders()`.
 *
 * The signed-in engineer's id is read here only: `currentEngineer()` doesn't hand it out, so code
 * outside this folder can't compare `order.engineerId` with it by hand
 * (`src/tests/unit/lib/server/auth/engineer-scope.spec.ts` checks the rest). A record written with
 * the engineer takes them from the order it reached (`order.engineerId`).
 */
import { error } from "@sveltejs/kit";
import { and, eq, ne, or, type SQL, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import type { EngineerActivity } from "#lib/notifications/extensions.ts";
import { db } from "#lib/server/db/index.ts";
import { literal } from "#lib/server/db/parameters.ts";
import {
	activity,
	customerSite,
	engineer,
	equipment,
	order,
	orderUnit,
} from "#lib/server/db/schema.ts";

import { idInTenant, inTenant, requireEngineer, tenantJoin } from "./session.ts";

/** How a request named an order: by id (a form's) or by number (the URL's). */
export type OrderRef = { id: number } | { number: string };

/**
 * For a query on `order` (from, joined or `with`): the current tenant's orders assigned to the
 * signed-in engineer. Reads the engineer itself, as `inTenant()` reads the tenant; the lookup is the
 * gate's, so it costs no query.
 */
export async function engineerOrders(): Promise<SQL> {
	const { engineer } = await requireEngineer();
	return and(inTenant(order), eq(order.engineerId, engineer.id))!;
}

/** For a query on `engineer`: the signed-in engineer's own record, which is all of them they read. */
export async function engineerSelf(): Promise<SQL> {
	const { engineer: self } = await requireEngineer();
	return idInTenant(engineer, self.id);
}

/**
 * For a query on `customerSite`: the sites of the signed-in engineer's orders, which is where they
 * see what's needed on a site (contacts, access notes). A site with a unit on one of their orders,
 * or, for an order without units, its customer's only site: the sites the work record finds
 * (`readWorkRecord()`). The units and locations stay the tenant's for every engineer (the QR pages).
 */
export async function engineerSites(): Promise<SQL> {
	const mine = await engineerOrders();
	const [, unitOfLink] = tenantJoin(equipment, orderUnit.equipmentId);
	const otherSite = alias(customerSite, "other_site");
	const withUnit = sql`exists (select 1 from ${orderUnit} inner join ${order} on ${eq(orderUnit.orderId, order.id)} inner join ${equipment} on ${unitOfLink} where ${and(eq(equipment.siteId, customerSite.id), inTenant(orderUnit), mine)})`;
	const withoutUnits = sql`exists (select 1 from ${order} where ${and(
		mine,
		eq(order.customerId, customerSite.customerId),
		sql`not exists (select 1 from ${orderUnit} where ${and(eq(orderUnit.orderId, order.id), inTenant(orderUnit))})`,
		sql`not exists (select 1 from ${customerSite} ${sql.identifier("other_site")} where ${and(eq(otherSite.customerId, customerSite.customerId), ne(otherSite.id, customerSite.id), inTenant(otherSite))})`,
	)})`;
	return and(inTenant(customerSite), or(withUnit, withoutUnits))!;
}

/** The one order `ref` names, if it's one of `engineerOrders()`. */
export async function engineerOrder(ref: OrderRef): Promise<SQL> {
	const named = "id" in ref ? eq(order.id, ref.id) : eq(order.number, ref.number);
	return and(named, await engineerOrders())!;
}

/**
 * The one refusal: a 404 that reads the same whether the order is missing, another engineer's or
 * another tenant's, with its number when the request named it.
 */
export function engineerOrderNotFound(ref: OrderRef): never {
	error(
		404,
		"number" in ref ? m.portal_not_found({ number: ref.number }) : m.portal_not_found_plain(),
	);
}

/**
 * For the engineer's notifications (`#lib/server/notifications/`): conditions on an `activity`
 * entry about one of the tenant's orders that gave it to the signed-in engineer, took it off them,
 * or is about an order of theirs now (`theirOrders`, a condition on `order`: the access registry's
 * `visible("order")` for them, which this file can't import without a cycle). The entries record the engineer as `changes.engineerId`
 * (before, after): an assignment, a plan, the order form, a creation with an engineer and a
 * deletion of an assigned order all do.
 */
export async function engineerActivity(theirOrders: SQL): Promise<EngineerActivity> {
	const { engineer } = await requireEngineer();
	const engineerWas = (side: 0 | 1) =>
		sql`json_extract(${activity.changes}, ${sql.raw(`'$.engineerId[${side}]'`)}) = ${engineer.id}`;
	const isOrder = sql`${activity.subjectType} = ${literal("order")}`;
	// Their orders now: `theirOrders`.
	const theirs = db
		.select({ id: order.id })
		.from(order)
		.where(and(eq(order.id, sql`cast(${activity.subjectId} as integer)`), theirOrders));
	return {
		assigned: sql`(${isOrder} and ${engineerWas(1)})`,
		unassigned: sql`(${isOrder} and ${engineerWas(0)})`,
		aboutTheirOrder: sql`(${isOrder} and exists ${theirs})`,
	};
}
