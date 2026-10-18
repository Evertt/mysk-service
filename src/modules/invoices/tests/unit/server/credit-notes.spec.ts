/**
 * Credit notes on the server, on the seeded demo database: crediting an invoice in part or in
 * full (never more than is left), standalone ones, issuing, settling and voiding them, what that
 * does to the invoice they credit (paid by them, not voided while they hold credit), what's
 * logged, the lists, the PDF, and that South can't see or change North's (the server side of
 * `../../e2e/credit-notes.test.ts`, which keeps the pages).
 */
import { isHttpError } from "@sveltejs/kit";
import { beforeAll, describe, expect, test } from "vite-plus/test";

import { formatCents } from "#lib/i18n/index.ts";
import { db } from "#lib/server/db/index.ts";
import { createCreditNote as createModuleCreditNote } from "#modules/invoices/api/credit-notes.server.ts";
import {
	createCreditNote,
	createInvoiceCredit,
	getCreditable,
	getCreditNote,
	getCreditNotes,
} from "#modules/invoices/credit-notes.remote.ts";
import {
	addCreditLine,
	issueCreditNote,
	removeCreditLine,
	settleCreditNote,
	updateCreditReason,
	voidCreditNote,
} from "#modules/invoices/detail/credit-note.remote.ts";
import { markPaid, voidInvoice } from "#modules/invoices/invoice-status.remote.ts";
import { getInvoice, getInvoices } from "#modules/invoices/invoices.remote.ts";
import { GET as creditNotePdf } from "#modules/invoices/routes/(app)/credit-notes/[number]/pdf/+server.ts";
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
} from "#unit/lib/server/harness/index.ts";

import {
	activityAbout,
	creditLinesOf,
	creditOf,
	creditSnapshot,
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

/** One of the tenant's invoices of `status` with no credit notes, and a line worth € 100 or more. */
const uncredited = (organization: string, status: string) =>
	rows<{ id: number; number: string }>(
		`select i.id, i.number from invoice i where i.organization_id = ? and i.status = ?
		 and not exists (select 1 from credit_note c where c.invoice_id = i.id)
		 and exists (select 1 from invoice_line l where l.invoice_id = i.id and l.amount >= 10000)
		 and not exists (select 1 from invoice_line l where l.invoice_id = i.id and l.amount < 0)
		 order by i.id desc limit 1`,
		[organization, status],
	).then(([row]) => row);

/** The credit note number in a 303 to its page. */
const numberIn = (location: string | undefined) => decodeURIComponent(location!.split("/").at(-1)!);

/** The crediting form of an invoice as its page sends it: `amounts` (euros) by line id, checked. */
async function creditForm(invoiceId: number, reason: string, amounts: Map<number, number>) {
	const lines = await linesOf(invoiceId);
	return {
		invoiceId: String(invoiceId),
		reason,
		lines: lines.map((line) => ({
			lineId: String(line.id),
			credit: amounts.has(line.id),
			amount: amounts.get(line.id) ?? line.amount / 100,
		})),
	};
}

/** What the PDF route answers for `number`: its status and headers, or the error's. */
const pdfOf = (number: string) =>
	(creditNotePdf as (event: { params: { number: string } }) => Promise<Response>)({
		params: { number },
	}).then(
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

/** A standalone draft for the tenant's first customer, made by `actor`'s form. */
async function standaloneDraft(actor: typeof north.owner, organization: string, reason: string) {
	const customerId = await value<number>(`select min(id) from customer where organization_id = ?`, [
		organization,
	]);
	const made = await as(actor, () =>
		submit(createCreditNote, {
			customerId: String(customerId),
			reason,
			description: "Goodwill",
			amount: 40,
		}),
	);
	expect(made).toMatchObject({ status: 303 });
	return creditOf(numberIn(made.location), organization);
}

describe("crediting a paid invoice in part, in North", () => {
	let paid: { id: number; number: string };
	let line: { id: number; description: string; amount: number; order_id: number | null };
	let number: string;

	beforeAll(async () => {
		paid = await uncredited(northId, "paid");
		[line] = (await linesOf(paid.id)).filter((each) => each.amount >= 10_000);
	});

	test("offers each line with what's left of it", async () => {
		const creditable = await as(north.owner, () => data(getCreditable, paid.number));
		expect(creditable.creditable).toBe(true);
		const lines = await linesOf(paid.id);
		expect(creditable.left).toBe(lines.reduce((sum, each) => sum + each.amount, 0));
		expect(creditable.lines.map((each) => [each.id, each.left])).toEqual(
			lines.map((each) => [each.id, each.amount]),
		);
	});

	test("refuses more than is left of a line, and crediting nothing", async () => {
		const before = await value(`select count(*) from credit_note`);
		const tooMuch = await as(north.owner, async () =>
			submit(
				createInvoiceCredit,
				await creditForm(paid.id, "Returned part", new Map([[line.id, line.amount / 100 + 1]])),
			),
		);
		expect(tooMuch).toMatchObject({ status: 400 });
		expect(tooMuch.issues).toEqual([
			{
				name: "lines",
				path: ["lines"],
				message: `${line.description}: at most ${formatCents(line.amount)} is left to credit`,
			},
		]);
		const nothing = await as(north.owner, async () =>
			submit(createInvoiceCredit, await creditForm(paid.id, "Returned part", new Map())),
		);
		expect(nothing.issues).toMatchObject([{ message: "Choose something to credit" }]);
		expect(await value(`select count(*) from credit_note`)).toBe(before);
	});

	test("makes a draft against the line, at the invoice's rate, with the next number", async () => {
		const last = await lastSequence("credit_note", northId);
		const made = await as(north.owner, async () =>
			submit(
				createInvoiceCredit,
				await creditForm(paid.id, "Returned part", new Map([[line.id, 25]])),
			),
		);
		expect(made).toMatchObject({ status: 303 });
		expect(made.refreshed).toEqual(
			expect.arrayContaining(["getCreditNotes", "getInvoices", "getInvoice"]),
		);
		number = numberIn(made.location);
		expect(number).toMatch(new RegExp(`^CN-${today().year}-\\d{4}$`));
		expect(sequenceOf(number)).toBe(last + 1);

		const stored = await creditOf(number, northId);
		expect(stored).toMatchObject({
			status: "draft",
			invoice_id: paid.id,
			vat_rate: (await invoiceOf(paid.number, northId)).vat_rate,
			reason: "Returned part",
			issued_on: null,
		});
		expect(await creditLinesOf(stored.id)).toEqual([
			expect.objectContaining({
				description: line.description,
				quantity: 1,
				unit_price: -2500,
				amount: -2500,
				invoice_line_id: line.id,
				order_id: line.order_id,
			}),
		]);
		const shown = await as(north.owner, () => data(getCreditNote, number));
		expect(shown.totals).toEqual({
			subtotal: -2500,
			vat: vatOf(-2500),
			total: -2500 + vatOf(-2500),
		});
		expect(shown.creditNote.invoice?.number).toBe(paid.number);

		// A draft takes no typed-in lines: it credits the invoice's.
		expect(
			await as(north.owner, () =>
				submit(addCreditLine, {
					id: String(stored.id),
					description: "More",
					quantity: 1,
					unitPrice: 1,
				}),
			),
		).toMatchObject({
			status: 400,
			issues: [{ message: "A credit note against an invoice credits that invoice's lines only" }],
		});
		// What's left of the line is less by what the draft credits.
		const creditable = await as(north.owner, () => data(getCreditable, paid.number));
		expect(creditable.lines.find((each) => each.id === line.id)?.left).toBe(line.amount - 2500);
	});

	test("its reason changes while it's a draft", async () => {
		const { id } = await creditOf(number, northId);
		expect(
			await as(north.owner, () =>
				submit(updateCreditReason, { id: String(id), reason: "Returned part, unused" }),
			),
		).toMatchObject({ status: 200 });
		expect((await creditOf(number, northId)).reason).toBe("Returned part, unused");
	});

	test("issued, it's refunded once settled, while the invoice stays paid", async () => {
		const { id } = await creditOf(number, northId);
		expect(await as(north.owner, () => submit(issueCreditNote, { id: String(id) }))).toMatchObject({
			status: 200,
		});
		expect(await creditOf(number, northId)).toMatchObject({
			status: "sent",
			issued_on: today().toString(),
		});
		// Issued, it's no draft to change.
		expect(
			await as(north.owner, () => submit(updateCreditReason, { id: String(id), reason: "x" })),
		).toMatchObject({ status: 400 });

		expect(await as(north.owner, () => submit(settleCreditNote, { id: String(id) }))).toMatchObject(
			{ status: 200 },
		);
		expect(await creditOf(number, northId)).toMatchObject({
			status: "paid",
			settled_on: today().toString(),
		});
		expect((await invoiceOf(paid.number, northId)).status).toBe("paid");

		// The invoice's page lists it, with what's credited, and nothing left to pay: the invoice
		// was paid, so the credit is refunded (the credit note's business), not taken off what's owed.
		const credited = -(2500 + vatOf(2500));
		const { credits } = await as(north.owner, () => data(getInvoice, paid.number));
		expect(credits.notes.map((note) => [note.number, note.status, note.total])).toEqual([
			[number, "paid", credited],
		]);
		expect(credits).toMatchObject({ credited, remaining: 0 });
		const listed = (await as(north.owner, () => data(getInvoices))).find((i) => i.id === paid.id);
		expect(listed).toMatchObject({ credited, remaining: 0 });
		expect((await as(north.owner, () => data(getCreditNote, number))).remaining).toBe(0);
	});

	test("its log has its life, on the invoice's card too", async () => {
		const { id } = await creditOf(number, northId);
		const entries = await activityAbout("credit_note", id, northId);
		expect(entries.map((entry) => entry.action)).toEqual([
			"created",
			"updated",
			"issued",
			"settled",
		]);
		expect(new Set(entries.map((entry) => entry.user_name))).toEqual(
			new Set([await nameOf(north.owner.email)]),
		);
		const onInvoice = (await activityAbout("invoice", paid.id, northId)).filter(
			(entry) => entry.subject_type === "credit_note",
		);
		expect(onInvoice.map((entry) => entry.action)).toEqual([
			"created",
			"updated",
			"issued",
			"settled",
		]);
	});

	test("its PDF downloads, as an attachment named by its number", async () => {
		expect(await as(north.owner, () => pdfOf(number))).toEqual({
			status: 200,
			type: "application/pdf",
			disposition: `attachment; filename="${number}.pdf"`,
		});
	});
});

describe("crediting a sent invoice in full, in North", () => {
	let sent: { id: number; number: string };
	let number: string;

	test("its form credits everything left: each line that's worth something, in full", async () => {
		sent = await uncredited(northId, "sent");
		const { lines } = await as(north.owner, () => data(getCreditable, sent.number));
		// As the page sends it: everything left checked, at what's left.
		const made = await as(north.owner, () =>
			submit(createInvoiceCredit, {
				invoiceId: String(sent.id),
				reason: "Billed by mistake",
				lines: lines.map((line) => ({
					lineId: String(line.id),
					credit: line.left > 0,
					amount: line.left / 100,
				})),
			}),
		);
		number = numberIn(made.location);
		const { id } = await creditOf(number, northId);
		const worth = (await linesOf(sent.id)).filter((line) => line.amount !== 0);
		expect((await creditLinesOf(id)).map((line) => [line.invoice_line_id, line.amount])).toEqual(
			worth.map((line) => [line.id, -line.amount]),
		);
		// Nothing more is left to credit.
		const creditable = await as(north.owner, () => data(getCreditable, sent.number));
		expect(creditable).toMatchObject({ creditable: false, left: 0 });
	});

	test("issued, it pays the invoice, settled with it, logged", async () => {
		const { id } = await creditOf(number, northId);
		const answer = await as(north.owner, () => submit(issueCreditNote, { id: String(id) }));
		expect(answer).toMatchObject({ status: 200 });
		expect(answer.refreshed).toEqual(expect.arrayContaining(["getCreditNote", "getInvoice"]));
		expect(await creditOf(number, northId)).toMatchObject({
			status: "paid",
			issued_on: today().toString(),
			settled_on: today().toString(),
		});
		expect(await invoiceOf(sent.number, northId)).toMatchObject({
			status: "paid",
			paid_on: today().toString(),
		});
		const logged = await activityAbout("invoice", sent.id, northId);
		expect(logged.slice(-2)).toMatchObject([
			{ action: "paid", subject_type: "invoice", note: `Credited in full, with ${number}` },
			{ action: "settled", subject_type: "credit_note", note: `Offset against ${sent.number}` },
		]);
		const { credits } = await as(north.owner, () => data(getInvoice, sent.number));
		expect(credits).toMatchObject({ remaining: 0, creditable: 0 });
	});
});

describe("an invoice's credit notes and its status, in North", () => {
	/** A sent invoice of the seed's with a sent credit note against it. */
	let credited: { id: number; number: string; credit: string };

	beforeAll(async () => {
		[credited] = await rows<typeof credited>(
			`select i.id, i.number, c.number as credit from invoice i join credit_note c on c.invoice_id = i.id
			 where i.organization_id = ? and i.status = 'sent' and c.status = 'sent' limit 1`,
			[northId],
		);
	});

	test("a sent invoice with credit notes can't be voided", async () => {
		const before = await invoiceSnapshot(credited.id);
		const answer = await as(north.owner, () => submit(voidInvoice, { id: String(credited.id) }));
		expect(answer).toMatchObject({ status: 400 });
		expect(answer.issues?.[0].message).toBe(
			`${credited.number} has credit notes (${credited.credit}): void them first`,
		);
		expect(await invoiceSnapshot(credited.id)).toEqual(before);
	});

	test("its sent credit note is settled with it, not refunded", async () => {
		const { id } = await creditOf(credited.credit, northId);
		expect(await as(north.owner, () => submit(settleCreditNote, { id: String(id) }))).toMatchObject(
			{ status: 400, issues: [{ message: `It's settled when ${credited.number} is paid` }] },
		);
	});

	test("paying it settles its sent credit notes the same day", async () => {
		const answer = await as(north.owner, () => submit(markPaid, { id: String(credited.id) }));
		expect(answer).toMatchObject({ status: 200 });
		expect(answer.refreshed).toEqual(expect.arrayContaining(["getCreditNote"]));
		expect(await creditOf(credited.credit, northId)).toMatchObject({
			status: "paid",
			settled_on: today().toString(),
		});
		const { id } = await creditOf(credited.credit, northId);
		expect((await activityAbout("credit_note", id, northId)).at(-1)).toMatchObject({
			action: "settled",
			note: `Offset against ${credited.number}`,
		});
	});
});

describe("a standalone credit note, in North", () => {
	let number: string;

	test("is typed in for a customer, gets more lines on its draft, and loses them again", async () => {
		const stored = await standaloneDraft(north.owner, northId, "Goodwill after a repeat breakdown");
		number = stored.number;
		expect(stored).toMatchObject({ invoice_id: null, status: "draft" });
		const add = await as(north.owner, () =>
			submit(addCreditLine, {
				id: String(stored.id),
				description: "Travel costs back",
				quantity: 2,
				unitPrice: 10,
			}),
		);
		expect(add).toMatchObject({ status: 200 });
		const lines = await creditLinesOf(stored.id);
		expect(lines.map((line) => [line.description, line.amount])).toEqual([
			["Goodwill", -4000],
			["Travel costs back", -2000],
		]);

		const extra = await as(north.owner, () =>
			submit(addCreditLine, {
				id: String(stored.id),
				description: "Oops",
				quantity: 1,
				unitPrice: 5,
			}),
		);
		expect(extra).toMatchObject({ status: 200 });
		const oops = (await creditLinesOf(stored.id)).at(-1)!;
		expect(
			await as(north.owner, () => submit(removeCreditLine, { id: String(oops.id) })),
		).toMatchObject({
			status: 200,
		});
		expect(await creditLinesOf(stored.id)).toHaveLength(2);
		const logged = (await activityAbout("credit_note", stored.id, northId)).filter(
			(entry) => entry.subject_type === "credit_note_line",
		);
		expect(logged.map((entry) => [entry.action, entry.subject_label])).toEqual([
			["created", "Travel costs back"],
			["created", "Oops"],
			["deleted", "Oops"],
		]);
	});

	test("issued, it takes the tenant's VAT rate, to refund", async () => {
		const { id } = await creditOf(number, northId);
		expect(await as(north.owner, () => submit(issueCreditNote, { id: String(id) }))).toMatchObject({
			status: 200,
		});
		expect(await creditOf(number, northId)).toMatchObject({ status: "sent", vat_rate: 21 });
		const shown = await as(north.owner, () => data(getCreditNote, number));
		expect(shown.totals.total).toBe(-(6000 + vatOf(6000)));
		expect(shown.remaining).toBeNull();
	});

	test("a draft is voided, keeping its number, and is final", async () => {
		const { id, number: voided } = await standaloneDraft(north.owner, northId, "Not needed");
		expect(await as(north.owner, () => submit(voidCreditNote, { id: String(id) }))).toMatchObject({
			status: 200,
		});
		const stored = await creditOf(voided, northId);
		expect(stored.status).toBe("void");
		expect(stored.voided_at).not.toBeNull();
		expect(await as(north.owner, () => submit(issueCreditNote, { id: String(id) }))).toMatchObject({
			status: 400,
		});
	});

	test("the list has North's credit notes, with their totals", async () => {
		const expected = await rows<{ id: number; subtotal: number; vat_rate: number }>(
			`select c.id, c.vat_rate, coalesce((select sum(amount) from credit_note_line l
			 where l.credit_note_id = c.id), 0) as subtotal from credit_note c
			 where c.organization_id = ? order by c.id desc`,
			[northId],
		);
		const listed = await as(north.member, () => data(getCreditNotes));
		expect(listed.map((credit) => [credit.id, credit.total])).toEqual(
			expected.map((credit) => [
				credit.id,
				credit.subtotal + vatOf(credit.subtotal, credit.vat_rate),
			]),
		);
		expect(listed.find((credit) => credit.number === number)).toMatchObject({
			invoice: null,
			status: "sent",
		});
	});
});

describe("a credit note another module made, in North", () => {
	/** A draft standalone credit note, made as another module makes one (the partner programme's bonus). */
	async function madeElsewhere(reason: string) {
		const customerId = await value<number>(
			`select min(id) from customer where organization_id = ?`,
			[northId],
		);
		const made = await as(north.owner, () =>
			db.transaction((tx) =>
				createModuleCreditNote(tx, {
					customerId,
					reason,
					lines: [{ description: "Bonus", amount: 50_000, source: "elsewhere:bonus:1" }],
				}),
			),
		);
		return creditOf(made.number, northId);
	}

	test("keeps its lines and its reason as they were made: none added or removed", async () => {
		const stored = await madeElsewhere("Bonus 2025");
		const [line] = await creditLinesOf(stored.id);
		const before = await creditSnapshot(stored.id);
		const refused = `${stored.number} was made by another module, so its lines can't be changed`;
		await as(north.owner, async () => {
			expect(
				await submit(updateCreditReason, { id: String(stored.id), reason: "Changed" }),
			).toMatchObject({
				status: 400,
				issues: [
					{
						message: `${stored.number} was made by another module, so its reason can't be changed`,
					},
				],
			});
			expect(
				await submit(addCreditLine, {
					id: String(stored.id),
					description: "Bonus",
					quantity: 1,
					unitPrice: 500,
				}),
			).toMatchObject({ status: 400, issues: [{ message: refused }] });
			expect(await submit(removeCreditLine, { id: String(line.id) })).toMatchObject({
				status: 400,
				issues: [{ message: refused }],
			});
		});
		expect(await creditSnapshot(stored.id)).toEqual(before);
		expect(
			(await activityAbout("credit_note", stored.id, northId)).filter(
				(entry) => entry.subject_type === "credit_note_line" || entry.action === "updated",
			),
		).toEqual([]);
	});

	test("is still issued and settled, or voided", async () => {
		const { id, number } = await madeElsewhere("Bonus 2025");
		await as(north.owner, async () => {
			expect(await submit(issueCreditNote, { id: String(id) })).toMatchObject({ status: 200 });
			expect(await submit(settleCreditNote, { id: String(id) })).toMatchObject({ status: 200 });
		});
		expect(await creditOf(number, northId)).toMatchObject({
			status: "paid",
			reason: "Bonus 2025",
		});

		const other = await madeElsewhere("Bonus 2024");
		expect(
			await as(north.owner, () => submit(voidCreditNote, { id: String(other.id) })),
		).toMatchObject({ status: 200 });
		expect((await creditOf(other.number, northId)).status).toBe("void");
	});
});

describe("in South", () => {
	let northDraft: { id: number; number: string };
	let southDraft: { id: number; number: string };

	beforeAll(async () => {
		northDraft = await standaloneDraft(north.owner, northId, "North's draft");
		southDraft = await standaloneDraft(south.owner, southId, "South's draft");
	});

	test("numbers its own series", async () => {
		expect(sequenceOf(southDraft.number)).toBe(await lastSequence("credit_note", southId));
	});

	test("North's credit notes, their PDFs and invoices' credits are 404s", async () => {
		const [northNewest] = await rows<{ number: string }>(
			`select number from credit_note c where organization_id = ? and not exists
			 (select 1 from credit_note s where s.organization_id = ? and s.number = c.number)
			 order by id desc limit 1`,
			[northId, southId],
		);
		const northInvoice = await value<string>(
			`select number from invoice i where organization_id = ? and status = 'paid' and not exists
			 (select 1 from invoice s where s.organization_id = ? and s.number = i.number) limit 1`,
			[northId, southId],
		);
		await as(south.owner, async () => {
			expect(await call(getCreditNote, northNewest.number)).toMatchObject({ status: 404 });
			expect(await pdfOf(northNewest.number)).toEqual({ status: 404 });
			expect(await call(getCreditable, northInvoice)).toMatchObject({ status: 404 });
			const listed = await data(getCreditNotes);
			expect(listed.map((credit) => credit.id).toSorted((a, b) => a - b)).toEqual(
				(
					await rows<{ id: number }>(
						`select id from credit_note where organization_id = ? order by id`,
						[southId],
					)
				).map((row) => row.id),
			);
		});
	});

	test("North's draft, by its id or its lines', is a 404 for each change", async () => {
		const [northLine] = await creditLinesOf(northDraft.id);
		const [northBefore, ownBefore] = [
			await creditSnapshot(northDraft.id),
			await creditSnapshot(southDraft.id),
		];
		const id = String(northDraft.id);
		await as(south.owner, async () => {
			for (const [name, answer] of [
				["issue", await submit(issueCreditNote, { id })],
				["void", await submit(voidCreditNote, { id })],
				["settle", await submit(settleCreditNote, { id })],
				["reason", await submit(updateCreditReason, { id, reason: "Tampered" })],
				["line", await submit(addCreditLine, { id, description: "x", quantity: 1, unitPrice: 1 })],
				["remove", await submit(removeCreditLine, { id: String(northLine.id) })],
			] as const) {
				expect(answer, name).toMatchObject({ status: 404 });
			}
		});
		expect(await creditSnapshot(northDraft.id)).toEqual(northBefore);
		expect(await creditSnapshot(southDraft.id)).toEqual(ownBefore);
	});

	test("neither a North invoice nor its lines can be credited, nor a North customer", async () => {
		const before = await value(`select count(*) from credit_note`);
		const southPaid = await uncredited(southId, "paid");
		const [northInvoice] = await rows<{ id: number }>(
			`select id from invoice where organization_id = ? and status = 'paid' order by id limit 1`,
			[northId],
		);
		const [northLine] = await linesOf(northInvoice.id);
		const northCustomer = await value<number>(
			`select min(id) from customer where organization_id = ?`,
			[northId],
		);
		await as(south.owner, async () => {
			// The invoice's hidden id swapped for North's.
			const form = await creditForm(southPaid.id, "Tampered", new Map());
			expect(
				await submit(createInvoiceCredit, { ...form, invoiceId: String(northInvoice.id) }),
			).toMatchObject({
				status: 404,
			});
			// A line's hidden id swapped for one of North's invoice's.
			const lines = [{ lineId: String(northLine.id), credit: true, amount: 1 }];
			expect((await submit(createInvoiceCredit, { ...form, lines })).issues).toEqual([
				{ name: "lines", path: ["lines"], message: "Only the invoice's own lines can be credited" },
			]);
			expect(
				(
					await submit(createCreditNote, {
						customerId: String(northCustomer),
						reason: "Tampered",
						description: "Goodwill",
						amount: 1,
					})
				).issues,
			).toMatchObject([{ name: "customerId", message: "Unknown customer" }]);
		});
		expect(await value(`select count(*) from credit_note`)).toBe(before);
		expect(
			await value(`select count(*) from credit_note_line where invoice_line_id = ?`, [
				northLine.id,
			]),
		).toBe(0);
	});
});
