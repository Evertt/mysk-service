/**
 * What the customer portal's remote functions and QR codes give a customer's contact on the seeded
 * demo database: Riedel's contact gets none of Weggemans' (another customer's) orders, units and
 * locations, nor another tenant's, also by tampered numbers and ids, can't report a breakdown of
 * another customer's unit, and is led by no QR code but their own customer's; North's contact sees
 * North's first customer and none of SHLTR's; and an order shows the engineer by first name only.
 * The server side of `src/tests/e2e/client.tenancy.test.ts` and `client.acceptance.test.ts`, which
 * keep a page's 404, the tampered report form and the redirects.
 */
import { beforeAll, describe, expect, test } from "vite-plus/test";

import { getCurrentUser } from "#lib/auth/session.remote.ts";
import { resolveQrCode } from "#lib/equipment/server/qr.ts";
import { db } from "#lib/server/db/index.ts";
import { member, portalContact, portalContactSite } from "#lib/server/db/schema.ts";
import {
	getPortalLocation,
	getPortalOrder,
	getPortalUnit,
	reportBreakdown,
} from "#routes/(customer)/portal/client.remote.ts";
import {
	as,
	call,
	data,
	demoAccount,
	north,
	organizationId,
	rows,
	shltr,
	submit,
	value,
} from "#unit/lib/server/harness/index.ts";

const [northId, southId, shltrId] = [
	organizationId("north"),
	organizationId("south"),
	organizationId("shltr"),
];
/** Riedel's facilities contact (all of Riedel's sites). */
const riedel = shltr.customer;
const weggemans = demoAccount("rob@weggemans.example");

/** One of `customer`'s done orders. */
const doneOrderOf = (customer: string) =>
	value<string>(
		`select o.number from "order" o join customer c on c.id = o.customer_id
		 where c.name = ? and o.status in ('completed', 'invoiced') order by o.id limit 1`,
		[customer],
	);

/** One of `customer`'s units with a location, and their codes' tokens. */
const unitOf = async (customer: string) =>
	(
		await rows<{
			id: number;
			serial_number: string;
			qr_token: string;
			location_id: number;
			location_token: string;
		}>(
			`select e.id, e.serial_number, e.qr_token, e.location_id, l.qr_token as location_token
			 from equipment e join customer c on c.id = e.customer_id
			 join equipment_location l on l.id = e.location_id
			 where c.name = ? order by e.id limit 1`,
			[customer],
		)
	)[0];

/** A unit's code's token of a tenant. */
const tokenIn = (organization: string) =>
	value<string>(`select qr_token from equipment where organization_id = ? order by id limit 1`, [
		organization,
	]);

const userId = (email: string) => value<string>(`select id from user where email = ?`, [email]);

let other: Awaited<ReturnType<typeof unitOf>>;

beforeAll(async () => {
	other = await unitOf("Weggemans Logistiek");
});

describe("another customer's records", () => {
	test("are a 404 for a customer's contact, also by their numbers and ids", async () => {
		const southern = await value<string>(
			`select number from "order" where organization_id = ? order by id limit 1`,
			[southId],
		);
		await as(riedel, async () => {
			expect(await call(getPortalOrder, await doneOrderOf("Weggemans Logistiek"))).toMatchObject({
				status: 404,
			});
			expect(await call(getPortalOrder, southern)).toMatchObject({ status: 404 });
			expect(await call(getPortalUnit, other.serial_number)).toMatchObject({ status: 404 });
			// Ids as the page's URL has them.
			expect(await call(getPortalLocation, String(other.location_id) as never)).toMatchObject({
				status: 404,
			});
			// Their own, as a check.
			expect(await call(getPortalOrder, await doneOrderOf("Riedel B.V."))).toMatchObject({
				status: 200,
			});
		});
	});

	test("can't be reported broken, by a tampered unit id, which makes no order", async () => {
		const count = () => value<number>(`select count(*) from "order"`);
		const before = await count();
		const answer = await as(riedel, () =>
			submit(reportBreakdown, {
				unitId: String(other.id),
				description: "Niet van ons",
				urgency: "normal",
			}),
		);
		expect(answer.status).toBe(400);
		expect(answer.issues).toContainEqual(
			expect.objectContaining({ name: "unitId", message: "Choose one of your units." }),
		);
		expect(await count()).toBe(before);
	});

	test("their units' and locations' QR codes, and other tenants', lead a contact nowhere", async () => {
		const contact = await userId(riedel.email);
		expect(await resolveQrCode(other.qr_token, contact)).toBeUndefined();
		expect(await resolveQrCode(other.location_token, contact)).toBeUndefined();
		expect(await resolveQrCode(await tokenIn(northId), contact)).toBeUndefined();
		expect(await resolveQrCode(await tokenIn(southId), contact)).toBeUndefined();
		// Their own customer's lead them to the report form.
		const own = await unitOf("Riedel B.V.");
		expect(await resolveQrCode(own.qr_token, contact)).toMatchObject({ viewer: "customer" });
	});
});

describe("a customer's contact of another tenant", () => {
	test("sees their own customer only, and none of SHLTR's", async () => {
		const first = await value<string>(
			`select name from customer where organization_id = ? order by id limit 1`,
			[northId],
		);
		await as(north.customer, async () => {
			expect((await data(getCurrentUser)).customer).toBe(first);
			expect(await call(getPortalOrder, await doneOrderOf("Riedel B.V."))).toMatchObject({
				status: 404,
			});
		});
		expect(
			await resolveQrCode(await tokenIn(shltrId), await userId(north.customer.email)),
		).toBeUndefined();
	});
});

describe("a contact in two organizations", () => {
	test("is led by a code of the other organization by the sites they see there, before it's their current one", async () => {
		// North's contact is also limited to one site of a SHLTR customer that has units at two.
		const [pair] = await rows<{ customerId: number; first: number; second: number }>(
			`select customer_id as customerId, min(site_id) as first, max(site_id) as second
			 from equipment where organization_id = ? group by customer_id
			 having count(distinct site_id) > 1 order by customer_id limit 1`,
			[shltrId],
		);
		const contact = await userId(north.customer.email);
		await db.insert(member).values({
			id: crypto.randomUUID(),
			organizationId: shltrId,
			userId: contact,
			role: "customer",
			createdAt: new Date(),
		});
		const [added] = await db
			.insert(portalContact)
			.values({
				organizationId: shltrId,
				customerId: pair.customerId,
				email: north.customer.email,
				userId: contact,
				allSites: false,
			})
			.returning();
		await db.insert(portalContactSite).values({
			organizationId: shltrId,
			contactId: added.id,
			customerId: pair.customerId,
			siteId: pair.first,
		});
		const tokenAt = (siteId: number) =>
			value<string>(`select qr_token from equipment where site_id = ? order by id limit 1`, [
				siteId,
			]);
		const locationAt = (siteId: number) =>
			value<string>(
				`select qr_token from equipment_location where site_id = ? order by id limit 1`,
				[siteId],
			);
		// The request is North's (their current tenant), the code SHLTR's.
		await as(north.customer, async () => {
			expect(await resolveQrCode(await tokenAt(pair.first), contact)).toMatchObject({
				viewer: "customer",
				target: { organizationId: shltrId },
			});
			expect(await resolveQrCode(await tokenAt(pair.second), contact)).toBeUndefined();
			expect(await resolveQrCode(await locationAt(pair.second), contact)).toBeUndefined();
			expect(await resolveQrCode(other.qr_token, contact)).toBeUndefined();
		});
	});
});

describe("an order in the portal", () => {
	test("names its engineer by their first name only", async () => {
		const [planned] = await rows<{ number: string; engineer: string }>(
			`select o.number, e.name as engineer from "order" o join customer c on c.id = o.customer_id
			 join engineer e on e.id = o.engineer_id where c.name = 'Weggemans Logistiek'
			 and e.name like '% %' order by o.id limit 1`,
			[],
		);
		const [first, ...rest] = planned.engineer.split(" ");
		const { order } = await as(weggemans, () => data(getPortalOrder, planned.number));
		expect(order.engineer).toBe(first);
		expect(JSON.stringify(order)).not.toContain(rest.join(" "));
	});
});
