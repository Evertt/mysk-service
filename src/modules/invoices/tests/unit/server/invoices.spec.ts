/**
 * Invoices on the server, on the seeded demo database: what a customer can be billed for, making a
 * draft and changing it, issuing, paying and voiding it (and what that does to its orders), what's
 * logged, the settings, the lists and the dashboard's receivables, the bulk actions, the PDF, and
 * that South can't see or change North's (the server side of `../../e2e/invoices.test.ts`,
 * `invoices.list.test.ts` and `orders.bulk.test.ts`, which keep the pages and one tampered form).
 * Credit notes are in `./credit-notes.spec.ts`.
 */
import { isHttpError } from "@sveltejs/kit";
import { beforeAll, describe, expect, test } from "vite-plus/test";

import { createAppTable } from "#lib/components/data-table/table.svelte.ts";
import { parseTableUrl } from "#lib/components/data-table/url-state.ts";
import { tableUrlSpec } from "#lib/components/data-table/url-sync.svelte.ts";
import { deleteOrder, getOrder } from "#lib/orders/order.remote.ts";
import invoiceBulkActions from "#modules/invoices/bulk-actions/orders.list.bulk.ts";
import { invoiceOrders } from "#modules/invoices/bulk.remote.ts";
import { getCreditNotes } from "#modules/invoices/credit-notes.remote.ts";
import {
	addLine,
	addToInvoice,
	removeLine,
	updateTerms,
} from "#modules/invoices/detail/draft.remote.ts";
import {
	bulkMarkPaid,
	issueInvoice,
	markPaid,
	voidInvoice,
} from "#modules/invoices/invoice-status.remote.ts";
import { invoiceTotals } from "#modules/invoices/invoice.ts";
import {
	createInvoice,
	getBillable,
	getInvoice,
	getInvoiceCustomers,
	getInvoices,
	getOrderInvoice,
	getReceivables,
} from "#modules/invoices/invoices.remote.ts";
import { creditNoteColumns } from "#modules/invoices/list/credit-note-columns.ts";
import { getInvoicingSettings, saveSettings } from "#modules/invoices/settings.remote.ts";
// The route as SvelteKit has it: the module's handler behind its guard.
import { GET as invoicePdf } from "#routes/(app)/(modules)/invoices/[number]/pdf/+server.ts";
import {
	as,
	call,
	data,
	north,
	organizationId,
	rows,
	south,
	submit,
	value,
	withoutModule,
} from "#unit/lib/server/harness/index.ts";

import {
	activityAbout,
	invoiceOf,
	invoiceSnapshot,
	lastSequence,
	linesOf,
	nameOf,
	sequenceOf,
	today,
	vatOf,
} from "./support.ts";

const [northId, southId] = [organizationId("north"), organizationId("south")];

/** A customer's completed orders that aren't on an invoice that isn't void, in SQL. */
const billable = `billable as (
	select o.* from "order" o where o.status = 'completed' and not exists (
		select 1 from invoice_line l join invoice i on i.id = l.invoice_id
		where l.order_id = o.id and i.status != 'void'))`;

const billableOrders = (customerId: number) =>
	rows<{ id: number; number: string }>(
		`with ${billable} select id, number from billable where customer_id = ?
		 order by completed_at, number`,
		[customerId],
	);

/** Customers of an organization with at least `n` orders to bill, by id. */
const customersToBill = (organization: string, n: number) =>
	rows<{ id: number; code: string }>(
		`with ${billable} select c.id, c.code from customer c where c.organization_id = ?
		 and (select count(*) from billable b where b.customer_id = c.id) >= ? order by c.id`,
		[organization, n],
	);

const statusesOf = async (ids: number[]) =>
	(
		await rows<{ status: string }>(
			`select status from "order" where id in (${ids.map(() => "?").join(",")}) order by id`,
			ids,
		)
	).map((row) => row.status);

/** The invoice number in a 303 to its page. */
const numberIn = (location: string | undefined) => decodeURIComponent(location!.split("/").at(-1)!);

/** What the PDF route answers `actor` for `number`: its status and headers, or the error's. */
const pdfOf = (number: string) =>
	// The guard refuses before the handler makes a promise.
	Promise.try(() =>
		(invoicePdf as (event: { params: { number: string } }) => Promise<Response>)({
			params: { number },
		}),
	).then(
		(response) => ({
			status: response.status,
			type: response.headers.get("content-type"),
			disposition: response.headers.get("content-disposition"),
		}),
		(thrown: unknown) => {
			if (isHttpError(thrown)) return { status: thrown.status };
			throw thrown;
		},
	);

/** North's customer with an active contract, completed orders to bill and a covered one. */
let customer: { id: number; code: string };
/** Another North customer with orders to bill. */
let other: { id: number; code: string };
/** A seeded North draft, for South to tamper with. */
let northDraft: { id: number; number: string; customerId: number };

beforeAll(async () => {
	const candidates = await rows<{ id: number; code: string }>(
		`with ${billable} select c.id, c.code from customer c where c.organization_id = ?
		 and exists (select 1 from contract k where k.customer_id = c.id
			and k.starts_on <= date('now', 'localtime') and k.ends_on >= date('now', 'localtime'))
		 and (select count(*) from billable b where b.customer_id = c.id) >= 2 order by c.id`,
		[northId],
	);
	// One whose orders include one a contract covers: its lines take something off.
	for (const candidate of candidates) {
		const { orders } = await as(north.owner, () => data(getBillable, candidate.id));
		if (orders.some((o) => o.lines.some((line) => line.amount < 0))) {
			customer = candidate;
			break;
		}
	}
	expect(customer).toBeDefined();
	[other] = (await customersToBill(northId, 1)).filter((c) => c.id !== customer.id);
	[northDraft] = await rows<typeof northDraft>(
		`select id, number, customer_id as customerId from invoice
		 where organization_id = ? and status = 'draft' order by id limit 1`,
		[northId],
	);
});

describe("a new invoice, in North", () => {
	let number: string;
	let orderIds: number[];

	test("offers the customer's completed orders that aren't billed, and this month's fees", async () => {
		const expected = await billableOrders(customer.id);
		const { orders, items } = await as(north.owner, () => data(getBillable, customer.id));
		expect(orders.map((o) => o.number)).toEqual(expected.map((o) => o.number));
		// Each order's lines add up to its total.
		for (const o of orders) {
			expect(
				o.lines.reduce((sum, line) => sum + line.amount, 0),
				o.number,
			).toBe(o.total);
		}

		// The contracts' monthly fees not billed yet, at the contract's fee.
		expect(items.length).toBeGreaterThan(0);
		for (const item of items) {
			const [, contractId] = item.reference.split(":");
			const [contract] = await rows<{ customer_id: number; monthly_fee: number }>(
				`select customer_id, monthly_fee from contract where id = ?`,
				[Number(contractId)],
			);
			expect(contract).toMatchObject({ customer_id: customer.id, monthly_fee: item.amount });
			expect(
				await value(
					`select count(*) from invoice_line l join invoice i on i.id = l.invoice_id
					 where l.source = ? and i.status != 'void'`,
					[item.reference],
				),
			).toBe(0);
		}
	});

	test("lists the tenant's customers to choose from", async () => {
		const customers = await as(north.owner, () => data(getInvoiceCustomers));
		expect(customers.map((c) => c.id).toSorted((a, b) => a - b)).toEqual(
			(
				await rows<{ id: number }>(
					`select id from customer where organization_id = ? order by id`,
					[northId],
				)
			).map((row) => row.id),
		);
	});

	test("is refused without something billable of the customer's", async () => {
		const before = await value(`select count(*) from invoice`);
		const [otherOrder] = await billableOrders(other.id);
		const [scheduled] = await rows<{ id: number }>(
			`select id from "order" where organization_id = ? and customer_id = ? and status != 'completed'
			 limit 1`,
			[northId, customer.id],
		);
		await as(north.owner, async () => {
			const fields = (orderIds: number[], items: string[] = []) => ({
				customerId: String(customer.id),
				orderIds: orderIds.map(String),
				items,
			});
			expect(await submit(createInvoice, fields([]))).toMatchObject({
				status: 400,
				issues: [{ name: "", message: "Choose at least one order or item to bill" }],
			});
			expect(scheduled).toBeDefined();
			for (const ids of [[otherOrder.id], [scheduled.id]]) {
				expect((await submit(createInvoice, fields(ids))).issues).toEqual([
					{
						name: "orderIds",
						path: ["orderIds"],
						message: "Only the customer's completed orders that aren't billed yet",
					},
				]);
			}
			expect((await submit(createInvoice, fields([], ["contracts:0:2020-01-01"]))).issues).toEqual([
				{
					name: "items",
					path: ["items"],
					message: "Only the customer's items that aren't billed yet",
				},
			]);
		});
		expect(await value(`select count(*) from invoice`)).toBe(before);
	});

	test("makes a draft with the next number and the tenant's terms, priced like the orders' pages", async () => {
		const { orders, items } = await as(north.owner, () => data(getBillable, customer.id));
		orderIds = orders.map((o) => o.id);
		const last = await lastSequence("invoice", northId);
		const answer = await as(north.owner, () =>
			submit(createInvoice, {
				customerId: String(customer.id),
				orderIds: orderIds.map(String),
				items: items.map((item) => item.reference),
			}),
		);
		expect(answer).toMatchObject({ status: 303 });
		expect(answer.refreshed).toEqual(expect.arrayContaining(["getInvoices", "getBillable"]));
		number = numberIn(answer.location);
		expect(number).toMatch(new RegExp(`^INV-${today().year}-\\d{5}$`));
		expect(sequenceOf(number)).toBe(last + 1);

		const stored = await invoiceOf(number, northId);
		const settings = await rows<{ vat_rate: number; payment_term_days: number }>(
			`select vat_rate, payment_term_days from invoicing_settings where organization_id = ?`,
			[northId],
		);
		expect(stored).toMatchObject({
			status: "draft",
			customer_id: customer.id,
			vat_rate: settings[0].vat_rate,
			payment_term_days: settings[0].payment_term_days,
			issued_on: null,
			due_on: null,
		});
		const lines = await linesOf(stored.id);
		for (const line of lines) {
			expect(line.amount).toBe(Math.round(line.quantity * line.unit_price));
		}
		const byNumber = (a: number, b: number) => a - b;
		expect(
			[...new Set(lines.flatMap((l) => (l.order_id ? [l.order_id] : [])))].sort(byNumber),
		).toEqual([...orderIds].sort(byNumber));
		// A covered order shows what its contract includes as a line of its own.
		expect(lines.some((l) => l.order_id && l.amount < 0)).toBe(true);
		expect(
			lines.filter((l) => l.source).map((l) => ({ reference: l.source, amount: l.amount })),
		).toEqual(items.map((item) => ({ reference: item.reference, amount: item.amount })));

		// Each order's lines add up to the total on the order's page.
		for (const o of orders) {
			const { totals } = await as(north.owner, () => data(getOrder, o.number));
			const billed = lines.filter((l) => l.order_id === o.id).reduce((sum, l) => sum + l.amount, 0);
			expect(billed, o.number).toBe(totals.total);
		}

		// Its page totals the lines, with the VAT once on their sum.
		const subtotal = lines.reduce((sum, l) => sum + l.amount, 0);
		const shown = await as(north.owner, () => data(getInvoice, number));
		expect(shown.totals).toEqual({
			subtotal,
			vat: vatOf(subtotal, stored.vat_rate),
			total: subtotal + vatOf(subtotal, stored.vat_rate),
		});
		expect(shown).toMatchObject({ organization: "Fieldworks Noord", invoice: { state: "draft" } });

		// Logged by who made it, with what it bills.
		const [entry] = await activityAbout("invoice", stored.id, northId);
		expect(entry).toMatchObject({
			action: "created",
			subject_type: "invoice",
			subject_label: number,
			user_name: await nameOf(north.owner.email),
		});
		expect(entry.note).toContain(`${lines.length} lines`);

		// The orders' cards say they're on it, and they're billable no more.
		const card = await as(north.owner, () => data(getOrderInvoice, orders[0].number));
		expect(card).toMatchObject({ status: "completed", invoice: { number, status: "draft" } });
		const after = await as(north.owner, () => data(getBillable, customer.id));
		expect(after).toEqual({ orders: [], items: [] });
	});

	test("refuses what another draft bills already", async () => {
		expect(
			await as(north.owner, () =>
				submit(createInvoice, { customerId: String(customer.id), orderIds: [String(orderIds[0])] }),
			),
		).toMatchObject({ status: 400, issues: [{ name: "orderIds" }] });
	});

	test("a draft takes typed-in lines, logged with their amount", async () => {
		const { id } = await invoiceOf(number, northId);
		const answer = await as(north.owner, () =>
			submit(addLine, {
				kind: "invoice",
				id: String(id),
				description: "Call-out surcharge",
				quantity: 2,
				unitPrice: 37.5,
			}),
		);
		expect(answer).toMatchObject({ status: 200 });
		expect(answer.refreshed).toEqual(expect.arrayContaining(["getInvoice", "getInvoices"]));
		expect((await linesOf(id)).at(-1)).toMatchObject({
			description: "Call-out surcharge",
			quantity: 2,
			unit_price: 3750,
			amount: 7500,
			order_id: null,
			source: null,
		});
		expect((await activityAbout("invoice", id, northId)).at(-1)).toMatchObject({
			action: "created",
			subject_type: "invoice_line",
			subject_label: "Call-out surcharge",
			parent_type: "invoice",
			note: "2 × €37.50 = €75.00",
		});
	});

	test("removing an order's line takes all its lines off, to bill again; it can go back on", async () => {
		const { id } = await invoiceOf(number, northId);
		const covered = (await linesOf(id)).find((l) => l.order_id && l.amount < 0)!;
		const orderId = covered.order_id!;
		const lineCount = (await linesOf(id)).filter((l) => l.order_id === orderId).length;
		expect(lineCount).toBeGreaterThan(1);

		expect(
			await as(north.owner, () => submit(removeLine, { kind: "invoice", id: String(covered.id) })),
		).toMatchObject({ status: 200 });
		expect((await linesOf(id)).filter((l) => l.order_id === orderId)).toEqual([]);
		const removed = (await activityAbout("invoice", id, northId)).filter(
			(e) => e.subject_type === "invoice_line" && e.action === "deleted",
		);
		expect(removed).toHaveLength(lineCount);
		const { orders } = await as(north.owner, () => data(getBillable, customer.id));
		expect(orders.map((o) => o.id)).toEqual([orderId]);

		// Not by another customer's order, nor with nothing chosen.
		const [otherOrder] = await billableOrders(other.id);
		await as(north.owner, async () => {
			expect(
				(await submit(addToInvoice, { id: String(id), orderIds: [String(otherOrder.id)] })).issues,
			).toMatchObject([{ name: "orderIds" }]);
			expect((await submit(addToInvoice, { id: String(id) })).issues).toMatchObject([
				{ message: "Choose orders or items to add" },
			]);
		});

		expect(
			await as(north.owner, () =>
				submit(addToInvoice, { id: String(id), orderIds: [String(orderId)] }),
			),
		).toMatchObject({ status: 200 });
		expect((await linesOf(id)).filter((l) => l.order_id === orderId)).toHaveLength(lineCount);
	});

	test("a draft's terms change, logged", async () => {
		const { id } = await invoiceOf(number, northId);
		expect(
			await as(north.owner, () =>
				submit(updateTerms, { id: String(id), paymentTermDays: 14, notes: "  PO 4711 " }),
			),
		).toMatchObject({ status: 200 });
		expect(await invoiceOf(number, northId)).toMatchObject({
			payment_term_days: 14,
			notes: "PO 4711",
		});
		const entry = (await activityAbout("invoice", id, northId)).at(-1)!;
		expect(entry.action).toBe("updated");
		expect(JSON.parse(entry.changes!)).toMatchObject({ paymentTermDays: [30, 14] });
		// Back to the tenant's.
		await as(north.owner, () =>
			submit(updateTerms, { id: String(id), paymentTermDays: 30, notes: "" }),
		);
	});

	test("issuing it dates it, fixes its due date and invoices its orders, logged", async () => {
		const { id } = await invoiceOf(number, northId);
		const answer = await as(north.owner, () => submit(issueInvoice, { id: String(id) }));
		expect(answer).toMatchObject({ status: 200 });
		expect(answer.refreshed).toEqual(expect.arrayContaining(["getInvoice", "getInvoices"]));
		expect(await invoiceOf(number, northId)).toMatchObject({
			status: "sent",
			issued_on: today().toString(),
			due_on: today().add({ days: 30 }).toString(),
			vat_rate: 21,
		});
		expect(await statusesOf(orderIds)).toEqual(orderIds.map(() => "invoiced"));

		const issued = (await activityAbout("invoice", id, northId)).at(-1)!;
		expect(issued).toMatchObject({ action: "issued", subject_type: "invoice" });
		// The status and the date follow from the verb.
		expect(Object.keys(JSON.parse(issued.changes!))).toEqual(["dueOn"]);
		// Its orders' logs say which invoice invoiced them.
		for (const orderId of orderIds) {
			const entry = (await activityAbout("order", orderId, northId)).at(-1)!;
			expect(entry).toMatchObject({ action: "updated", note: `Invoice ${number}` });
			expect(JSON.parse(entry.changes!)).toEqual({ status: ["completed", "invoiced"] });
		}
		const card = await as(north.owner, () => data(getInvoice, number));
		expect(card.invoice.state).toBe("sent");
	});

	test("a sent invoice can't be changed, not even through a draft's form", async () => {
		const { id } = await invoiceOf(number, northId);
		const [line] = await linesOf(id);
		const before = await invoiceSnapshot(id);
		const refused = {
			status: 400,
			issues: [{ message: `${number} has been issued and can't be changed` }],
		};
		await as(north.owner, async () => {
			// The draft's remove button, with the sent invoice's line.
			expect(await submit(removeLine, { kind: "invoice", id: String(line.id) })).toMatchObject(
				refused,
			);
			expect(
				await submit(addLine, {
					kind: "invoice",
					id: String(id),
					description: "More",
					quantity: 1,
					unitPrice: 1,
				}),
			).toMatchObject(refused);
			expect(
				await submit(updateTerms, { id: String(id), paymentTermDays: 7, notes: "" }),
			).toMatchObject(refused);
			expect(await submit(addToInvoice, { id: String(id), orderIds: [] })).toMatchObject({
				status: 400,
			});
			expect(await submit(issueInvoice, { id: String(id) })).toMatchObject({
				status: 400,
				issues: [{ message: `${number} is sent, so it can't be issued` }],
			});
		});
		expect(await invoiceSnapshot(id)).toEqual(before);
	});

	test("its PDF downloads, as an attachment named by its number", async () => {
		expect(await as(north.owner, () => pdfOf(number))).toEqual({
			status: 200,
			type: "application/pdf",
			disposition: `attachment; filename="${number}.pdf"`,
		});
	});

	test("marking it paid records today; paid is final", async () => {
		const { id } = await invoiceOf(number, northId);
		expect(await as(north.owner, () => submit(markPaid, { id: String(id) }))).toMatchObject({
			status: 200,
		});
		expect(await invoiceOf(number, northId)).toMatchObject({
			status: "paid",
			paid_on: today().toString(),
		});
		expect((await activityAbout("invoice", id, northId)).at(-1)).toMatchObject({ action: "paid" });
		await as(north.owner, async () => {
			expect(await submit(voidInvoice, { id: String(id) })).toMatchObject({ status: 400 });
			expect(await submit(markPaid, { id: String(id) })).toMatchObject({ status: 400 });
		});
		const first = await orderNumber(orderIds[0]);
		const card = await as(north.owner, () => data(getOrderInvoice, first));
		expect(card).toMatchObject({ status: "invoiced", invoice: { number, status: "paid" } });
	});

	test("its log has its life by who did it, in order", async () => {
		const { id } = await invoiceOf(number, northId);
		const entries = await activityAbout("invoice", id, northId);
		expect(new Set(entries.map((e) => e.user_name))).toEqual(
			new Set([await nameOf(north.owner.email)]),
		);
		expect(entries.filter((e) => e.subject_type === "invoice").map((e) => e.action)).toEqual([
			"created",
			"updated",
			"updated",
			"issued",
			"paid",
		]);
	});

	test("an invoice with nothing on it can't be issued", async () => {
		// A draft made of a typed-in line, which then comes off.
		const [first] = await billableOrders(other.id);
		const made = await as(north.owner, () =>
			submit(createInvoice, { customerId: String(other.id), orderIds: [String(first.id)] }),
		);
		const empty = await invoiceOf(numberIn(made.location), northId);
		const [line] = await linesOf(empty.id);
		await as(north.owner, () => submit(removeLine, { kind: "invoice", id: String(line.id) }));
		expect(
			await as(north.owner, () => submit(issueInvoice, { id: String(empty.id) })),
		).toMatchObject({
			status: 400,
			issues: [{ message: "Add something to bill before issuing the invoice" }],
		});
		// Voided, as a draft that isn't needed is: its number stays taken.
		expect(
			await as(north.owner, () => submit(voidInvoice, { id: String(empty.id) })),
		).toMatchObject({ status: 200 });
		expect((await invoiceOf(empty.number, northId)).status).toBe("void");
	});

	test("voiding a sent invoice puts its orders back to completed, to bill again", async () => {
		const orders = await billableOrders(other.id);
		const ids = orders.map((o) => o.id);
		const made = await as(north.owner, () =>
			submit(createInvoice, { customerId: String(other.id), orderIds: ids.map(String) }),
		);
		const voided = numberIn(made.location);
		const { id } = await invoiceOf(voided, northId);
		await as(north.owner, () => submit(issueInvoice, { id: String(id) }));
		expect(await statusesOf(ids)).toEqual(ids.map(() => "invoiced"));

		expect(await as(north.owner, () => submit(voidInvoice, { id: String(id) }))).toMatchObject({
			status: 200,
		});
		const stored = await invoiceOf(voided, northId);
		expect(stored.status).toBe("void");
		expect(stored.voided_at).not.toBeNull();
		// It keeps its lines, but they no longer count.
		expect((await linesOf(id)).length).toBeGreaterThan(0);
		expect(await statusesOf(ids)).toEqual(ids.map(() => "completed"));
		expect((await activityAbout("invoice", id, northId)).at(-1)).toMatchObject({
			action: "voided",
		});
		for (const orderId of ids) {
			const entry = (await activityAbout("order", orderId, northId)).at(-1)!;
			expect(JSON.parse(entry.changes!)).toEqual({ status: ["invoiced", "completed"] });
		}

		const card = await as(north.owner, () => data(getOrderInvoice, orders[0].number));
		expect(card).toMatchObject({ status: "completed", invoice: null });
		expect(card.voided).toContain(voided);
		const again = await as(north.owner, () => data(getBillable, other.id));
		expect(again.orders.map((o) => o.id)).toEqual(ids);
	});

	test("an order on a draft can't be deleted, nor an invoiced one", async () => {
		const [onDraft] = await rows<{ id: number }>(
			`select o.id from "order" o join invoice_line l on l.order_id = o.id
			 where l.invoice_id = ? order by o.id limit 1`,
			[northDraft.id],
		);
		await as(north.owner, async () => {
			expect((await submit(deleteOrder, { id: String(onDraft.id) })).issues).toMatchObject([
				{ message: expect.stringContaining("such as an invoice") },
			]);
			expect((await submit(deleteOrder, { id: String(orderIds[0]) })).issues).toMatchObject([
				{ message: expect.stringContaining("is invoiced") },
			]);
		});
		expect(
			await value(`select count(*) from "order" where id in (?, ?)`, [onDraft.id, orderIds[0]]),
		).toBe(2);
	});
});

const orderNumber = (id: number) => value<string>(`select number from "order" where id = ?`, [id]);

describe("in South, which has invoicing but no contracts", () => {
	let southCustomer: { id: number; code: string };
	/** South's draft, made here. */
	let draft: { id: number; number: string };

	beforeAll(async () => {
		[southCustomer] = await customersToBill(southId, 2);
	});

	test("what can be billed has no contract fees", async () => {
		const { orders, items } = await as(south.owner, () => data(getBillable, southCustomer.id));
		expect(orders.map((o) => o.id)).toEqual(
			(await billableOrders(southCustomer.id)).map((o) => o.id),
		);
		expect(items).toEqual([]);
		const made = await as(south.owner, () =>
			submit(createInvoice, {
				customerId: String(southCustomer.id),
				orderIds: orders.slice(0, -1).map((o) => String(o.id)),
			}),
		);
		draft = await invoiceOf(numberIn(made.location), southId);
		const lines = await linesOf(draft.id);
		expect(lines.length).toBeGreaterThan(0);
		expect(lines.filter((l) => l.source !== null)).toEqual([]);
		// Its own series of numbers.
		expect(sequenceOf(draft.number)).toBe(await lastSequence("invoice", southId));
	});

	test("changing the invoicing settings is for managers, and logged", async () => {
		const before = await as(south.owner, () => data(getInvoicingSettings));
		expect(before.canManage).toBe(true);
		const fields = {
			vatRate: before.vatRate,
			paymentTermDays: 14,
			billFrom: before.billFrom.toString(),
		};
		expect(await as(south.member, () => submit(saveSettings, fields))).toMatchObject({
			status: 403,
		});
		expect((await as(south.member, () => data(getInvoicingSettings))).canManage).toBe(false);
		expect(await as(south.owner, () => submit(saveSettings, fields))).toMatchObject({
			status: 303,
			location: "/invoices",
		});
		const [entry] = await rows<{ action: string; subject_label: string; changes: string }>(
			`select action, subject_label, changes from activity where organization_id = ?
			 and subject_type = 'invoicing_settings' order by id desc limit 1`,
			[southId],
		);
		expect(entry).toMatchObject({ action: "updated", subject_label: "" });
		expect(JSON.parse(entry.changes)).toEqual({
			paymentTermDays: [before.paymentTermDays, 14],
		});
		// A new draft takes the new term; North's are North's.
		const [first] = await billableOrders(southCustomer.id);
		const made = await as(south.owner, () =>
			submit(createInvoice, { customerId: String(southCustomer.id), orderIds: [String(first.id)] }),
		);
		expect((await invoiceOf(numberIn(made.location), southId)).payment_term_days).toBe(14);
		expect((await as(north.owner, () => data(getInvoicingSettings))).paymentTermDays).toBe(30);
	});

	test("lists South's invoices only, and its customers", async () => {
		const listed = await as(south.owner, () => data(getInvoices));
		expect(listed.map((i) => i.id).toSorted((a, b) => a - b)).toEqual(
			(
				await rows<{ id: number }>(`select id from invoice where organization_id = ? order by id`, [
					southId,
				])
			).map((row) => row.id),
		);
		const customers = await as(south.owner, () => data(getInvoiceCustomers));
		expect(
			await value(
				`select count(*) from customer where organization_id != ? and id in (${customers.map(() => "?").join(",")})`,
				[southId, ...customers.map((c) => c.id)],
			),
		).toBe(0);
	});

	test("North's invoices, their PDFs, its customers' and orders' billing are 404s", async () => {
		const northOnly = await value<string>(
			`select number from invoice i where organization_id = ? and not exists
			 (select 1 from invoice s where s.organization_id = ? and s.number = i.number) limit 1`,
			[northId, southId],
		);
		const northOrder = await value<string>(
			`select number from "order" o where organization_id = ? and not exists
			 (select 1 from "order" s where s.organization_id = ? and s.number = o.number) limit 1`,
			[northId, southId],
		);
		await as(south.owner, async () => {
			expect(await call(getInvoice, northOnly)).toMatchObject({ status: 404 });
			expect(await pdfOf(northOnly)).toEqual({ status: 404 });
			expect(await call(getBillable, customer.id)).toMatchObject({ status: 404 });
			expect(await call(getOrderInvoice, northOrder)).toMatchObject({ status: 404 });
		});
	});

	test("a North customer is refused", async () => {
		const before = await value(`select count(*) from invoice`);
		const [northOrder] = await billableOrders(other.id);
		const answer = await as(south.owner, () =>
			submit(createInvoice, { customerId: String(other.id), orderIds: [String(northOrder.id)] }),
		);
		expect(answer).toMatchObject({
			status: 400,
			issues: [{ name: "customerId", message: "Unknown customer" }],
		});
		expect(await value(`select count(*) from invoice`)).toBe(before);
	});

	test("a North order can't be added to South's draft", async () => {
		const [northOrder] = await billableOrders(other.id);
		const before = await invoiceSnapshot(draft.id);
		const answer = await as(south.owner, () =>
			submit(addToInvoice, { id: String(draft.id), orderIds: [String(northOrder.id)] }),
		);
		expect(answer).toMatchObject({
			status: 400,
			issues: [
				{
					name: "orderIds",
					message: "Only the customer's completed orders that aren't billed yet",
				},
			],
		});
		expect(await invoiceSnapshot(draft.id)).toEqual(before);
		expect(
			await value(`select count(*) from invoice_line where order_id = ? and organization_id = ?`, [
				northOrder.id,
				southId,
			]),
		).toBe(0);
	});

	test("North's draft, by its id or its lines', is a 404 for each change", async () => {
		const [northLine] = await linesOf(northDraft.id);
		const before = await invoiceSnapshot(northDraft.id);
		const ownBefore = await invoiceSnapshot(draft.id);
		const id = String(northDraft.id);
		await as(south.owner, async () => {
			for (const [name, answer] of [
				["issue", await submit(issueInvoice, { id })],
				["void", await submit(voidInvoice, { id })],
				["pay", await submit(markPaid, { id })],
				["terms", await submit(updateTerms, { id, paymentTermDays: 1, notes: "" })],
				[
					"line",
					await submit(addLine, {
						kind: "invoice",
						id,
						description: "x",
						quantity: 1,
						unitPrice: 1,
					}),
				],
				["add", await submit(addToInvoice, { id, orderIds: [] })],
				["remove", await submit(removeLine, { kind: "invoice", id: String(northLine.id) })],
			] as const) {
				expect(answer, name).toMatchObject({ status: 404 });
			}
			expect(await call(bulkMarkPaid, { ids: [northDraft.id] })).toMatchObject({
				status: 200,
				data: { done: 0, missing: 1 },
			});
		});
		expect(await invoiceSnapshot(northDraft.id)).toEqual(before);
		expect(await invoiceSnapshot(draft.id)).toEqual(ownBefore);
	});

	test("the orders list's bulk action finds none of North's orders", async () => {
		const ids = (await billableOrders(other.id)).map((o) => o.id);
		expect(await as(south.owner, () => call(invoiceOrders, { ids }))).toMatchObject({
			status: 200,
			data: { done: 0, skipped: [], missing: ids.length },
		});
		expect(await statusesOf(ids)).toEqual(ids.map(() => "completed"));
	});
});

describe("without the module", () => {
	test("the PDF is a 404, before anything is looked up", async () => {
		await withoutModule("south", "invoices", async () => {
			const number = await value<string>(`select number from invoice where organization_id = ?`, [
				southId,
			]);
			expect(await as(south.owner, () => pdfOf(number))).toEqual({ status: 404 });
		});
	});
});

describe("the lists and the dashboard, in North", () => {
	/** North's sent and paid invoices with their totals, from their lines, and their credits. */
	async function expectedTotals() {
		const invoices = await rows<{
			id: number;
			number: string;
			status: string;
			due_on: string | null;
			vat_rate: number;
			subtotal: number;
		}>(
			`select i.id, i.number, i.status, i.due_on, i.vat_rate,
			 coalesce((select sum(amount) from invoice_line l where l.invoice_id = i.id), 0) as subtotal
			 from invoice i where i.organization_id = ?`,
			[northId],
		);
		const credits = await rows<{
			invoice_id: number;
			status: string;
			subtotal: number;
			vat_rate: number;
		}>(
			`select c.invoice_id, c.status, c.vat_rate, coalesce((select sum(amount) from credit_note_line l
			 where l.credit_note_id = c.id), 0) as subtotal from credit_note c
			 where c.organization_id = ? and c.invoice_id is not null and c.status in ('sent', 'paid')`,
			[northId],
		);
		return invoices.map((invoice) => {
			const totals = invoiceTotals([{ amount: invoice.subtotal }], invoice.vat_rate);
			const own = credits.filter((credit) => credit.invoice_id === invoice.id);
			const credited = own.reduce(
				(sum, credit) => sum + credit.subtotal + vatOf(credit.subtotal, credit.vat_rate),
				0,
			);
			const left = invoice.subtotal + own.reduce((sum, credit) => sum + credit.subtotal, 0);
			return {
				...invoice,
				total: totals.total,
				credited,
				// Nothing of a paid or void invoice, whatever its credit notes.
				remaining:
					invoice.status === "paid" || invoice.status === "void" || left <= 0
						? 0
						: Math.max(0, totals.total + credited),
			};
		});
	}

	test("the invoices' list has each with its total, what's credited and what's left", async () => {
		const expected = await expectedTotals();
		const listed = await as(north.member, () => data(getInvoices));
		expect(listed.map((i) => i.id)).toEqual(expected.map((i) => i.id).toSorted((a, b) => b - a));
		const byId = new Map(expected.map((i) => [i.id, i]));
		for (const row of listed) {
			const want = byId.get(row.id)!;
			expect(
				{ total: row.total, credited: row.credited, remaining: row.remaining },
				row.number,
			).toEqual({
				total: want.total,
				credited: want.credited,
				remaining: want.remaining,
			});
			const overdue =
				row.status === "sent" && row.dueOn !== null && row.dueOn.toString() < today().toString();
			expect(row.state, row.number).toBe(overdue ? "overdue" : row.status);
		}
		expect(listed.some((row) => row.credited < 0)).toBe(true);
	});

	test("the receivables add up what's left to pay on the sent ones, overdue apart, and the refunds", async () => {
		const sent = (await expectedTotals()).filter((i) => i.status === "sent");
		const overdue = sent
			.filter((i) => i.due_on! < today().toString())
			.sort((a, b) => a.due_on!.localeCompare(b.due_on!) || a.number.localeCompare(b.number));
		const refunds = await rows<{ subtotal: number; vat_rate: number }>(
			`select c.vat_rate, coalesce((select sum(amount) from credit_note_line l
			 where l.credit_note_id = c.id), 0) as subtotal from credit_note c
			 left join invoice i on i.id = c.invoice_id
			 where c.organization_id = ? and c.status = 'sent' and (i.id is null or i.status != 'sent')`,
			[northId],
		);
		expect(overdue.length).toBeGreaterThan(0);
		const sum = (list: { remaining: number }[]) =>
			list.reduce((total, i) => total + i.remaining, 0);
		const answer = await as(north.member, () => data(getReceivables));
		expect(answer).toMatchObject({
			outstanding: { count: sent.length, total: sum(sent) },
			overdue: { count: overdue.length, total: sum(overdue) },
			refunds: {
				count: refunds.length,
				total: -refunds.reduce((total, c) => total + c.subtotal + vatOf(c.subtotal, c.vat_rate), 0),
			},
			drafts: Number(
				await value(`select count(*) from invoice where organization_id = ? and status = 'draft'`, [
					northId,
				]),
			),
		});
		expect(answer.overdueInvoices.map((i) => i.number)).toEqual(
			overdue.slice(0, 6).map((i) => i.number),
		);
		// South's are South's.
		const southSent = Number(
			await value(`select count(*) from invoice where organization_id = ? and status = 'sent'`, [
				southId,
			]),
		);
		expect((await as(south.owner, () => data(getReceivables))).outstanding.count).toBe(southSent);
	});

	test("the refunds link to just the credit notes they add up: none offset against a sent invoice", async () => {
		const expected = await rows<{ id: number; settlement: string | null }>(
			`select c.id, case when c.status != 'sent' then null when i.status = 'sent' then 'offset'
			 else 'refund' end as settlement from credit_note c left join invoice i on i.id = c.invoice_id
			 where c.organization_id = ? order by c.id desc`,
			[northId],
		);
		const listed = await as(north.member, () => data(getCreditNotes));
		expect(listed.map((credit) => [credit.id, credit.settlement])).toEqual(
			expected.map((credit) => [credit.id, credit.settlement]),
		);
		// The seed has one of each: a standalone one to refund, and one against a sent invoice.
		expect(listed.map((credit) => credit.settlement)).toEqual(
			expect.arrayContaining(["refund", "offset"]),
		);

		// The card's link (`?settlement=refund`) on the credit notes' table.
		const table = createAppTable({ columns: creditNoteColumns, data: listed });
		const linked = parseTableUrl(new URLSearchParams("settlement=refund"), tableUrlSpec(table));
		table.setColumnFilters(linked.columnFilters);
		const shown = table.getRowModel().rows.map((row) => row.original);
		const { refunds } = await as(north.member, () => data(getReceivables));
		expect(refunds.count).toBeGreaterThan(0);
		expect({ count: shown.length, total: -shown.reduce((sum, c) => sum + c.total, 0) }).toEqual(
			refunds,
		);
	});

	test("selected invoices are marked paid, except those that aren't sent", async () => {
		const pick = (status: string) =>
			rows<{ id: number; number: string }>(
				`select id, number from invoice where organization_id = ? and status = ? order by id desc limit 1`,
				[northId, status],
			).then(([row]) => row);
		const [sent, draft] = [await pick("sent"), await pick("draft")];
		const before = await invoiceSnapshot(draft.id);
		const answer = await as(north.member, () => call(bulkMarkPaid, { ids: [sent.id, draft.id] }));
		expect(answer).toMatchObject({
			status: 200,
			data: {
				done: 1,
				skipped: [
					{ label: draft.number, reason: `${draft.number} is a draft, so it can't be marked paid` },
				],
				missing: 0,
			},
		});
		expect(await invoiceOf(sent.number, northId)).toMatchObject({
			status: "paid",
			paid_on: today().toString(),
		});
		expect(await invoiceSnapshot(draft.id)).toEqual(before);
		expect((await activityAbout("invoice", sent.id, northId)).at(-1)).toMatchObject({
			action: "paid",
			user_name: await nameOf(north.member.email),
		});
	});
});

describe("the orders list's Create invoice, in North", () => {
	const [createInvoiceAction] = invoiceBulkActions;
	const row = (customerId: number, status = "completed", number = "O-1") =>
		({ customer: { id: customerId }, status, number }) as Parameters<
			NonNullable<typeof createInvoiceAction.skip>
		>[0];

	test("is for the completed orders of one customer", () => {
		expect(createInvoiceAction.disabled!([row(1), row(1)])).toBeUndefined();
		expect(createInvoiceAction.disabled!([row(1), row(2)])).toBe("Select orders of one customer");
		expect(createInvoiceAction.skip!(row(1))).toBeUndefined();
		expect(createInvoiceAction.skip!(row(1, "scheduled", "O-7"))).toBe("O-7 isn't completed");
	});

	test("makes one draft of the selected orders that can be billed, skipping the others", async () => {
		const [busy] = await customersToBill(northId, 2);
		const picked = (await billableOrders(busy.id)).slice(0, 2);
		const [onInvoice] = await rows<{ id: number; number: string }>(
			`select o.id, o.number from "order" o where o.customer_id = ? and o.status = 'invoiced' limit 1`,
			[busy.id],
		);
		expect(onInvoice).toBeDefined();
		const ids = [...picked.map((o) => o.id), onInvoice.id];
		const answer = await as(north.member, () => call(invoiceOrders, { ids }));
		expect(answer.status).toBe(200);
		expect(answer.data).toMatchObject({
			done: 2,
			missing: 0,
			skipped: [{ label: onInvoice.number, reason: `${onInvoice.number} isn't completed` }],
		});
		const made = await invoiceOf(numberIn(answer.data!.href), northId);
		expect(made).toMatchObject({ status: "draft", customer_id: busy.id });
		expect(
			[...new Set((await linesOf(made.id)).map((l) => l.order_id))].toSorted((a, b) => a! - b!),
		).toEqual(picked.map((o) => o.id).toSorted((a, b) => a - b));
		expect((await activityAbout("invoice", made.id, northId))[0]).toMatchObject({
			action: "created",
		});

		// Again: they're on an invoice already.
		expect(
			await as(north.member, () => call(invoiceOrders, { ids: [picked[0].id] })),
		).toMatchObject({
			status: 200,
			data: { done: 0, skipped: [{ reason: `${picked[0].number} is on an invoice already` }] },
		});
	});

	test("refuses orders of several customers", async () => {
		const ids = await Promise.all(
			(await customersToBill(northId, 1))
				.slice(0, 2)
				.map(async (c) => (await billableOrders(c.id))[0].id),
		);
		expect(await as(north.member, () => call(invoiceOrders, { ids }))).toMatchObject({
			status: 400,
			message: "Select orders of one customer",
		});
	});
});
