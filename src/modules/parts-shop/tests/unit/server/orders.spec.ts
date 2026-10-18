/**
 * The shop's orders on the seeded demo database: a partner's contact checks out with its Parts
 * Credit (the order, the spend and the stock set aside in one go, logged), and is refused what the
 * checkout can't take (more than the credit, a product on request or not in the shop, more than in
 * stock, an empty cart, a customer that isn't a partner) with nothing stored; the office confirms
 * and cancels it (the credit given back as the credit it was, the stock released); and a contact
 * reads its own customer's orders only, also by a tampered number. The server side of
 * `shop.test.ts` and `shop.tenancy.test.ts`, which keep the pages and one tampered cart.
 */
import { describe, expect, test } from "vite-plus/test";

import { formatCents } from "#lib/i18n/index.ts";
import {
	getClientShop,
	getClientShopOrder,
	getClientShopOrders,
	placeClientShopOrder,
} from "#modules/parts-shop/client/client-shop.remote.ts";
import {
	getShopOrder,
	getShopOrderCounts,
	takeShopOrderStep,
} from "#modules/parts-shop/orders.remote.ts";
import {
	as,
	call,
	data,
	demoAccount,
	organizationId,
	rows,
	shltr,
	submit,
	value,
} from "#unit/lib/server/harness/index.ts";

const shltrId = organizationId("shltr");
const riedelContact = shltr.customer;
const weggemansContact = demoAccount("rob@weggemans.example");
const year = Temporal.Now.plainDateISO("Europe/Amsterdam").year;

/** Riedel's seeded, delivered order. */
const riedelOrder = `SH-${year}-007`;

/** One of SHLTR's customers, by name. */
const customerNamed = async (name: string) =>
	(
		await rows<{ id: number; code: string }>(
			`select id, code from customer where organization_id = ? and name = ?`,
			[shltrId, name],
		)
	)[0];

/** SHLTR's shop product of a material, by SKU, with the material's price and stock. */
const productOf = async (sku: string) =>
	(
		await rows<{ id: number; material_id: number; price: number; stock: number; name: string }>(
			`select p.id, p.material_id, m.unit_price as price, m.stock, m.name from shop_product p
			 join material m on m.id = p.material_id where p.organization_id = ? and m.sku = ?`,
			[shltrId, sku],
		)
	)[0];

const stockOf = (materialId: number) =>
	value<number>(`select stock from material where id = ?`, [materialId]);

/** A shop order as stored, by number. */
const shopOrderOf = async (number: string) =>
	(
		await rows<{ id: number; status: string; total: number; vat: number; placed_by: string }>(
			`select id, status, total, vat, placed_by from shop_order where organization_id = ? and number = ?`,
			[shltrId, number],
		)
	)[0];

/** A customer's wallet entries, in the order they were made. */
const walletOf = (customerId: number) =>
	rows<{ kind: string; amount: number; valid_until: string | null; note: string | null }>(
		`select kind, amount, valid_until, note from partner_wallet_entry where customer_id = ? order by id`,
		[customerId],
	);

/** What a customer's wallet holds. */
const balanceOf = async (customerId: number) =>
	Number(
		await value(`select coalesce(sum(amount), 0) from partner_wallet_entry where customer_id = ?`, [
			customerId,
		]),
	);

/** The stock movements whose note is a shop order's number. */
const movementsOf = (number: string) =>
	rows<{ material_id: number; quantity: number; kind: string }>(
		`select material_id, quantity, kind from stock_movement where organization_id = ? and note = ?
		 order by id`,
		[shltrId, number],
	);

/** The materials whose stock isn't the sum of their movements. */
const unbalancedStock = () =>
	rows(
		`select m.sku from material m left join stock_movement s on s.material_id = m.id
		 where m.organization_id = ? group by m.id having round(m.stock, 2) <> round(coalesce(sum(s.quantity), 0), 2)`,
		[shltrId],
	);

/** The next shop order's number. */
const nextShopNumber = async () =>
	`SH-${year}-${String(
		Number(
			await value(
				`select max(cast(substr(number, 9) as integer)) from shop_order where organization_id = ?`,
				[shltrId],
			),
		) + 1,
	).padStart(3, "0")}`;

/** A shop order's log, oldest first. */
const logOf = (number: string) =>
	rows<{ action: string; parent_type: string; changes: string }>(
		`select action, parent_type, changes from activity where organization_id = ?
		 and subject_type = 'shop_order' and subject_label = ? order by id`,
		[shltrId, number],
	);

/** The checkout's form, as the cart's hidden fields send it. */
const cart = (...lines: [productId: number, quantity: number][]) => ({
	lines: lines.map(([productId, quantity]) => ({
		productId: String(productId),
		quantity: String(quantity),
	})),
});

/** What a refused checkout must leave as it was. */
const untouched = async (customerId: number) => ({
	orders: await value(`select count(*) from shop_order where organization_id = ?`, [shltrId]),
	wallet: await walletOf(customerId),
	movements: await value(`select count(*) from stock_movement where organization_id = ?`, [
		shltrId,
	]),
});

/** The order Riedel's contact places in this file. */
let placed = "";

describe("checking out", () => {
	test("pays with parts credit: the order, the spend and the stock set aside; logged", async () => {
		const riedel = await customerNamed("Riedel B.V.");
		const available = await balanceOf(riedel.id);
		const [cables, seal] = [await productOf("SD-002"), await productOf("SD-004")];
		const total = 2 * cables.price + seal.price;
		const shop = await as(riedelContact, () => data(getClientShop));
		expect(shop).toMatchObject({ partner: true, available });

		placed = await nextShopNumber();
		const answer = await as(riedelContact, () =>
			submit(placeClientShopOrder, cart([cables.id, 2], [seal.id, 1])),
		);
		expect(answer).toMatchObject({
			status: 303,
			location: `/parts-shop/portal/orders/${placed}?placed=1`,
		});
		expect(answer.refreshed).toEqual(
			expect.arrayContaining(["getClientShop", "getClientShopOrders"]),
		);

		const placedBy = await value(`select id from user where email = ?`, [riedelContact.email]);
		expect(await shopOrderOf(placed)).toMatchObject({
			status: "placed",
			total,
			vat: 0,
			placed_by: placedBy,
		});
		expect((await walletOf(riedel.id)).at(-1)).toMatchObject({
			kind: "spend",
			amount: -total,
			note: `Order ${placed}`,
		});
		expect(await balanceOf(riedel.id)).toBe(available - total);
		expect(await movementsOf(placed)).toEqual([
			{ material_id: cables.material_id, quantity: -2, kind: "reservation" },
			{ material_id: seal.material_id, quantity: -1, kind: "reservation" },
		]);
		expect(await stockOf(cables.material_id)).toBe(cables.stock - 2);
		expect(await stockOf(seal.material_id)).toBe(seal.stock - 1);
		expect(await unbalancedStock()).toEqual([]);
		const [entry] = await logOf(placed);
		expect(entry).toMatchObject({ action: "placed", parent_type: "customer" });
		expect(JSON.parse(entry.changes)).toEqual({ status: [null, "placed"], total: [null, total] });

		// The customer's orders list it, and the shop the credit that's left.
		const orders = await as(riedelContact, () => data(getClientShopOrders));
		expect(orders.map((order) => order.number)).toContain(placed);
		expect(await as(riedelContact, () => data(getClientShop))).toMatchObject({
			available: available - total,
		});
	});

	test("is refused what the checkout can't take, and stores nothing of it", async () => {
		const riedel = await customerNamed("Riedel B.V.");
		const available = await balanceOf(riedel.id);
		const [cylinder, panel, seal] = [
			await productOf("LV-001"),
			await productOf("SD-007"),
			await productOf("SD-004"),
		];
		const over = Math.floor(available / cylinder.price) + 1;
		expect(over).toBeLessThanOrEqual(cylinder.stock);
		const before = await untouched(riedel.id);
		const refusal = async (form: ReturnType<typeof cart>) => {
			const answer = await as(riedelContact, () => submit(placeClientShopOrder, form));
			expect(answer.status).toBe(400);
			return answer.issues?.map((issue) => issue.message);
		};
		expect(await refusal(cart([cylinder.id, over]))).toEqual([
			`The order comes to ${formatCents(over * cylinder.price)}, but only ${formatCents(available)} of parts credit is available.`,
		]);
		// A product on request, as a tampered cart sends it.
		expect(await refusal(cart([panel.id, 1]))).toEqual([
			`${panel.name} is on request: ask us for it.`,
		]);
		expect(await refusal(cart([999_999, 1]))).toEqual([
			"A product in your cart isn't in the shop.",
		]);
		await value(`update material set stock = 1 where id = ?`, [seal.material_id]);
		try {
			expect(await refusal(cart([seal.id, 2]))).toEqual([`Only 1 of ${seal.name} in stock.`]);
		} finally {
			await value(`update material set stock = ? where id = ?`, [seal.stock, seal.material_id]);
		}
		expect(await refusal(cart())).toEqual(["Your cart is empty."]);
		// The schema's: 1 to 99 at a time.
		expect(await refusal(cart([seal.id, 100]))).toHaveLength(1);
		expect(await untouched(riedel.id)).toEqual(before);
	});
});

describe("the customer portal", () => {
	test("shows a contact its own customer's orders only, also by a tampered number", async () => {
		expect(await as(weggemansContact, () => call(getClientShopOrder, riedelOrder))).toMatchObject({
			status: 404,
		});
		const theirs = await as(weggemansContact, () => data(getClientShopOrders));
		expect(theirs.map((order) => order.number)).not.toContain(riedelOrder);
		expect(theirs.map((order) => order.number)).not.toContain(placed);

		const own = await as(riedelContact, () => data(getClientShopOrder, riedelOrder));
		expect(own).toMatchObject({ number: riedelOrder, status: "delivered" });
		expect(own.lines.length).toBeGreaterThan(0);
		expect(await as(riedelContact, () => call(getClientShopOrder, "SH-1999-001"))).toMatchObject({
			status: 404,
		});
	});
});

describe("the office", () => {
	test("counts the open orders and those to confirm", async () => {
		const counts = await as(shltr.member, () => data(getShopOrderCounts));
		const stored = await rows<{ status: string }>(
			`select status from shop_order where organization_id = ?
			 and status in ('placed', 'confirmed', 'shipped')`,
			[shltrId],
		);
		expect(counts).toEqual({
			open: stored.length,
			placed: stored.filter((row) => row.status === "placed").length,
		});
	});

	test("confirms an order, and refuses a step its status doesn't allow; logged", async () => {
		const confirmed = await as(shltr.member, () =>
			submit(takeShopOrderStep, { number: placed, step: "confirm" }),
		);
		expect(confirmed).toMatchObject({ status: 200 });
		expect(confirmed.refreshed).toEqual(expect.arrayContaining(["getShopOrder", "getShopOrders"]));
		expect((await shopOrderOf(placed)).status).toBe("confirmed");

		const again = await as(shltr.member, () =>
			submit(takeShopOrderStep, { number: placed, step: "confirm" }),
		);
		expect(again.issues?.map((issue) => issue.message)).toEqual([
			`${placed} can't take that step now.`,
		]);
		expect(
			await as(shltr.member, () =>
				submit(takeShopOrderStep, { number: "SH-1999-001", step: "confirm" }),
			),
		).toMatchObject({ status: 404 });
		expect((await logOf(placed)).map((entry) => entry.action)).toEqual(["placed", "updated"]);
	});

	test("cancels it: its credit back as the credit it was, its stock released; logged", async () => {
		const riedel = await customerNamed("Riedel B.V.");
		const order = await shopOrderOf(placed);
		const balance = await balanceOf(riedel.id);
		const cables = await productOf("SD-002");
		const answer = await as(shltr.member, () =>
			submit(takeShopOrderStep, { number: placed, step: "cancel" }),
		);
		expect(answer).toMatchObject({ status: 200 });
		expect((await shopOrderOf(placed)).status).toBe("cancelled");
		// Last year's credit, valid until the end of this one.
		expect((await walletOf(riedel.id)).at(-1)).toMatchObject({
			kind: "reversal",
			amount: order.total,
			valid_until: `${year}-12-31`,
		});
		expect(await balanceOf(riedel.id)).toBe(balance + order.total);
		expect((await movementsOf(placed)).map((movement) => movement.kind)).toEqual([
			"reservation",
			"reservation",
			"release",
			"release",
		]);
		expect(await stockOf(cables.material_id)).toBe(cables.stock + 2);
		expect(await unbalancedStock()).toEqual([]);
		expect((await logOf(placed)).map((entry) => entry.action)).toEqual([
			"placed",
			"updated",
			"updated",
		]);
		const page = await as(shltr.member, () => data(getShopOrder, placed));
		expect(page.status).toBe("cancelled");
	});
});

describe("a customer that isn't a partner", () => {
	test("has no credit in the shop, and is refused the checkout", async () => {
		const weggemans = await customerNamed("Weggemans Logistiek");
		const seal = await productOf("SD-004");
		await value(`delete from partner_account where customer_id = ?`, [weggemans.id]);
		expect(await as(weggemansContact, () => data(getClientShop))).toMatchObject({
			partner: false,
			available: 0,
		});
		const before = await untouched(weggemans.id);
		const answer = await as(weggemansContact, () =>
			submit(placeClientShopOrder, cart([seal.id, 1])),
		);
		expect(answer.issues?.map((issue) => issue.message)).toEqual([
			"Only partners pay with parts credit: your company isn't in the partner programme.",
		]);
		expect(await untouched(weggemans.id)).toEqual(before);
	});
});
