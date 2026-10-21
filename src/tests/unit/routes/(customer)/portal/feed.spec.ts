/**
 * The customer portal's feed of changes (`watchPortalChanges`, through `feedFor()`): a contact hears
 * of their customer's orders and units, and of those only at the sites they see; none of another
 * customer's, another tenant's, or the office's records; and never who made the change. The same
 * presenter as the engineer portal's (`(field)/my/portal.spec.ts`), asked as a contact.
 */
import { describe, expect, test } from "vite-plus/test";

import type { Change } from "#lib/server/changes.ts";
import { announceChange } from "#lib/server/changes.ts";
import { feedFor, liveFeed } from "#lib/server/live.ts";
import { watchPortalChanges } from "#routes/(customer)/portal/client.remote.ts";
import { contactOf, customerIdOf, idsOf } from "#unit/lib/server/access/support.ts";
import { as, data, north, organizationId, rows } from "#unit/lib/server/harness/index.ts";

const northId = organizationId("north");
const contactor = north.customer;

const change = (type: Change["type"], id: string | number | null, action = "updated"): Change => ({
	type,
	...(id === null ? {} : { id: String(id) }),
	action,
	user: { id: "someone-else", name: "Pieter" },
	at: 1,
});

/** What `contactor` hears of `changes`, as `type/id`. */
const heardBy = async (changes: Change[]) =>
	(await as(contactor, () => feedFor()(changes))).map((told) => `${told.type}/${told.id}`);

describe("the customer portal's feed of changes", () => {
	test("starts with none", async () => {
		expect(await as(contactor, () => data(watchPortalChanges))).toMatchObject({ changes: [] });
	});

	test("tells a contact of their customer's orders and units, not another customer's", async () => {
		const mine = String(await customerIdOf(contactor));
		const [own] = await idsOf("order", "org-north", "and customer_id = ?", [mine]);
		const [unit] = await idsOf("equipment", "org-north", "and customer_id = ?", [mine]);
		const [otherOrder] = await idsOf("order", "org-north", "and customer_id != ?", [mine]);
		const [otherUnit] = await idsOf("equipment", "org-north", "and customer_id != ?", [mine]);
		const [southOrder] = await idsOf("order", "org-south");
		const told = await as(contactor, () =>
			feedFor()([
				change("order", own, "scheduled"),
				change("order", otherOrder),
				change("order", southOrder),
				change("equipment", unit),
				change("equipment", otherUnit),
				change("member", 1),
			]),
		);
		expect(told.map((heard) => `${heard.type}/${heard.id}`)).toEqual([
			`order/${own}`,
			`equipment/${unit}`,
		]);
		// Neither who made it nor what was done, only that it changed.
		expect(told[0]).toEqual({
			type: "order",
			id: own,
			action: "updated",
			name: "",
			mine: false,
			at: 1,
		});
	});

	test("tells a deletion as one, and nothing of a change for its type only", async () => {
		const mine = String(await customerIdOf(contactor));
		const [own] = await idsOf("order", "org-north", "and customer_id = ?", [mine]);
		const told = await as(contactor, () =>
			feedFor()([change("order", own, "deleted"), change("order", null)]),
		);
		expect(told).toEqual([
			{ type: "order", id: own, action: "deleted", name: "", mine: false, at: 1 },
		]);
	});

	test("reaches the live query: a change to their order is told, one to another's is not", async () => {
		const mine = String(await customerIdOf(contactor));
		const [own] = await idsOf("order", "org-north", "and customer_id = ?", [mine]);
		const [other] = await idsOf("order", "org-north", "and customer_id != ?", [mine]);
		await as(contactor, async () => {
			const feed = liveFeed(["order"], feedFor());
			await feed.next();
			const next = feed.next();
			announceChange(northId, "order", { id: other, action: "updated" });
			announceChange(northId, "order", { id: own, action: "updated" });
			expect((await next).value?.changes).toEqual([
				expect.objectContaining({ type: "order", id: own, name: "" }),
			]);
			await feed.return(undefined);
		});
	});

	test("tells a contact limited to some sites of those sites' units and orders only", async () => {
		// Moved to a North customer with units at several sites, and limited to one of them.
		const contact = await contactOf(contactor);
		const [multi] = await rows<{ customer_id: number }>(
			`select customer_id from equipment where organization_id = 'org-north'
			 group by customer_id having count(distinct site_id) > 1 order by customer_id limit 1`,
		);
		expect(multi, "a North customer with units at two sites").toBeDefined();
		const mine = String(multi.customer_id);
		await rows(`update portal_contact set customer_id = ?, all_sites = 0 where id = ?`, [
			mine,
			contact.id,
		]);
		const [kept] = await rows<{ site_id: number }>(
			`select min(site_id) as site_id from equipment where organization_id = 'org-north' and customer_id = ?`,
			[mine],
		);
		await rows(
			`insert into portal_contact_site (organization_id, contact_id, customer_id, site_id)
			 values ('org-north', ?, ?, ?)`,
			[contact.id, mine, kept.site_id],
		);
		const units = (where: string) =>
			idsOf("equipment", "org-north", `and customer_id = ? and ${where}`, [mine]);
		const here = await units(`site_id = ${kept.site_id}`);
		const elsewhere = await units(`site_id != ${kept.site_id}`);
		const orders = await idsOf(
			"order",
			"org-north",
			`and customer_id = ? and id in (select order_id from order_unit where equipment_id in
				(select id from equipment where site_id = ?))`,
			[mine, String(kept.site_id)],
		);
		const otherOrders = await idsOf(
			"order",
			"org-north",
			`and customer_id = ? and id not in (select order_id from order_unit where equipment_id in
				(select id from equipment where site_id = ?))`,
			[mine, String(kept.site_id)],
		);
		expect([here.length, elsewhere.length, orders.length, otherOrders.length]).not.toContain(0);
		expect(
			await heardBy([
				...here.map((id) => change("equipment", id)),
				...elsewhere.map((id) => change("equipment", id)),
				...orders.map((id) => change("order", id)),
				...otherOrders.map((id) => change("order", id)),
			]),
		).toEqual([...here.map((id) => `equipment/${id}`), ...orders.map((id) => `order/${id}`)]);
	});
});
