/**
 * What the tenant's modules say when an invoice moves its orders (issuing: completed → invoiced;
 * voiding: back to completed), on the seeded demo database with the real modules: a checklist left
 * open on a done order stops neither; a module that refuses an order's move stops the invoice, with
 * the order's number, and moves none of its orders. The refusing module is a stand-in at the save
 * hook, the modules' seam: no real module refuses these moves.
 */
import { describe, expect, test, vi } from "vite-plus/test";

import { issueInvoice, voidInvoice } from "#modules/invoices/invoice-status.remote.ts";
import { createInvoice } from "#modules/invoices/invoices.remote.ts";
import { as, north, organizationId, rows, submit, value } from "#unit/lib/server/harness/index.ts";

import { invoiceOf } from "./support.ts";

const northId = organizationId("north");

// The order whose move a module refuses (none: they're all let through to the real modules).
const refusing = vi.hoisted(() => ({ orderId: 0 }));
vi.mock(import("#lib/orders/server/hooks.ts"), async (importOriginal) => {
	const real = await importOriginal();
	return {
		...real,
		saveOrderParts: async (...args: Parameters<typeof real.saveOrderParts>) => {
			const [change] = args;
			if (change.order.id === refusing.orderId) {
				throw new real.OrderRefused([{ message: "Its parts are on hold." }]);
			}
			return real.saveOrderParts(...args);
		},
	};
});

/** A customer of North's completed orders that aren't on an invoice that isn't void, by id. */
const billableOrders = async () => {
	const found = await rows<{ customer_id: number; id: number; number: string }>(
		`select o.customer_id, o.id, o.number from "order" o where o.organization_id = ?
		 and o.status = 'completed' and not exists (
			select 1 from invoice_line l join invoice i on i.id = l.invoice_id
			where l.order_id = o.id and i.status != 'void')
		 and o.customer_id = (
			select customer_id from "order" b where b.organization_id = ? and b.status = 'completed'
			and not exists (select 1 from invoice_line l join invoice i on i.id = l.invoice_id
				where l.order_id = b.id and i.status != 'void')
			group by customer_id having count(*) >= 2 order by customer_id limit 1)
		 order by o.id`,
		[northId, northId],
	);
	return { customerId: found[0].customer_id, orders: found };
};

const statusOf = (id: number) => value<string>(`select status from "order" where id = ?`, [id]);

/** A draft invoice of `orders`, made as North's owner: its id and number. */
async function draftOf(customerId: number, orders: { id: number }[]) {
	const made = await as(north.owner, () =>
		submit(createInvoice, {
			customerId: String(customerId),
			orderIds: orders.map((o) => String(o.id)),
		}),
	);
	const number = decodeURIComponent(made.location!.split("/").at(-1)!);
	return { id: (await invoiceOf(number, northId)).id, number };
}

describe("issuing and voiding an invoice, as the modules see it", () => {
	test("a checklist left open on a done order stops neither issuing nor voiding", async () => {
		// One of North's billable orders with a checklist, reopened: as if it was completed while the
		// checklists module was off, and the module switched on since.
		const [done] = await rows<{ id: number; customer_id: number; checklist: number }>(
			`select o.id, o.customer_id, c.id as checklist from "order" o
			 join checklist c on c.order_id = o.id
			 where o.organization_id = ? and o.status = 'completed' and not exists (
				select 1 from invoice_line l join invoice i on i.id = l.invoice_id
				where l.order_id = o.id and i.status != 'void')
			 order by o.id limit 1`,
			[northId],
		);
		expect(done).toBeDefined();
		await value(`update checklist set status = 'draft' where id = ?`, [done.checklist]);
		const invoice = await draftOf(done.customer_id, [done]);

		expect(
			await as(north.owner, () => submit(issueInvoice, { id: String(invoice.id) })),
		).toMatchObject({ status: 200 });
		expect(await statusOf(done.id)).toBe("invoiced");
		expect(
			await as(north.owner, () => submit(voidInvoice, { id: String(invoice.id) })),
		).toMatchObject({ status: 200 });
		expect(await statusOf(done.id)).toBe("completed");
	});

	test("a module that refuses an order stops issuing it, naming the order; nothing moves", async () => {
		const { customerId, orders } = await billableOrders();
		const [first, second] = orders;
		const invoice = await draftOf(customerId, [first, second]);
		refusing.orderId = second.id;
		try {
			expect(
				await as(north.owner, () => submit(issueInvoice, { id: String(invoice.id) })),
			).toMatchObject({
				status: 400,
				issues: [{ message: `${second.number}: Its parts are on hold.` }],
			});
		} finally {
			refusing.orderId = 0;
		}
		expect((await invoiceOf(invoice.number, northId)).status).toBe("draft");
		expect(await statusOf(first.id)).toBe("completed");
		expect(await statusOf(second.id)).toBe("completed");
	});
});
