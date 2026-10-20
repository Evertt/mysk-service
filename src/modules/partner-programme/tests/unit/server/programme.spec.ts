import { rmSync } from "node:fs";

import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import { asSystem, type Tenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { paidInvoiceLines } from "#modules/invoices/api/revenue.server.ts";
import { creditNote } from "#modules/invoices/api/schema.server.ts";
import { giveBackCredit } from "#modules/partner-programme/api/wallet.server.ts";
import {
	bonusLineSource,
	defaultCategoryRules,
	defaultTiers,
	walletSummary,
} from "#modules/partner-programme/model.ts";
import { saveClassification } from "#modules/partner-programme/server/classification.ts";
import {
	chooseBonus,
	closedYearsOf,
	closeYear,
	payBonusByCreditNote,
} from "#modules/partner-programme/server/close.ts";
import { figuresOf } from "#modules/partner-programme/server/partners.ts";
import { partnerRevenueSql } from "#modules/partner-programme/server/revenue.ts";
import { rulesFor } from "#modules/partner-programme/server/rules.ts";
import {
	bonusCreditNote,
	bonusYear,
	orderClassification,
	programmeYear,
	walletEntry,
} from "#modules/partner-programme/server/schema.ts";
import {
	addEntry,
	expireCredit,
	ledgerOf,
	type NewEntry,
	outstandingCredit,
} from "#modules/partner-programme/server/wallet.ts";

// No request: the system makes the changes (`asSystem()`), so nothing may ask for one.
// The invoices' settings remote functions (`defineTenantSettings()`) are made when imported.
vi.mock("$app/server", async () => ({
	getRequestEvent: () => {
		throw new Error("Asked for a request");
	},
	...(await import("#unit/lib/server/harness/stand-ins.ts")).remoteStandIns,
}));
vi.mock("#lib/server/modules/hooks.gen.ts", () => ({ generatedServerModules: () => [] }));

const current = Temporal.Now.plainDateISO().year;
const last = current - 1;

// A temporary database made by the app's migrations (see the maintenance module's spec).
const folder = await vi.hoisted(async () => {
	const [fs, os, path] = await Promise.all([
		import("node:fs"),
		import("node:os"),
		import("node:path"),
	]);
	return fs.mkdtempSync(path.join(os.tmpdir(), "partner-programme-spec-"));
});
vi.mock("#lib/server/db/index.ts", async () => {
	const path = await import("node:path");
	const { createClient } = await import("@libsql/client");
	const { drizzle } = await import("drizzle-orm/libsql");
	const { migrate } = await import("drizzle-orm/libsql/migrator");
	const { drizzleQueued } = await import("#lib/server/db/serialize.ts");
	const schema = await import("#lib/server/db/schema.ts");
	const moduleSchema = await import("#lib/server/db/modules.gen.ts");
	const client = createClient({ url: `file:${path.join(folder, "test.db")}` });
	await migrate(drizzle(client), { migrationsFolder: path.resolve("drizzle") });
	const year = new Date().getFullYear() - 1;
	await client.executeMultiple(`
		insert into organization (id, name, slug, created_at) values
			('north', 'North', 'north', 0), ('south', 'South', 'south', 0);
		insert into customer
			(id, organization_id, code, name, contact_name, email, phone, city, country, segment)
		values
			(1, 'north', 'C-1', 'Acme', 'Ann', 'ann@acme.test', '1', 'Utrecht', 'NL', 'enterprise'),
			(3, 'north', 'C-3', 'Beta', 'Bo', 'bo@beta.test', '1', 'Utrecht', 'NL', 'enterprise'),
			(2, 'south', 'C-1', 'Zenith', 'Zed', 'zed@zenith.test', '1', 'Breda', 'NL', 'enterprise');
		insert into partner_account (organization_id, customer_id, accepted_on) values
			('north', 1, '${year}-01-01'), ('north', 3, '${year}-06-01'), ('south', 2, '${year}-01-01');
		insert into "order" (id, organization_id, number, customer_id, type, status, priority, description)
		values
			(100, 'north', 'O-100', 1, 'project', 'invoiced', 'normal', 'Project'),
			(101, 'north', 'O-101', 1, 'breakdown', 'invoiced', 'normal', 'Breakdown'),
			(102, 'north', 'O-102', 1, 'installation', 'invoiced', 'normal', 'Installation'),
			(200, 'south', 'O-200', 2, 'breakdown', 'invoiced', 'normal', 'Breakdown');
		insert into invoice (id, organization_id, number, customer_id, status, payment_term_days,
			vat_rate, issued_on, paid_on)
		values
			(1, 'north', 'I-1', 1, 'paid', 30, 21, '${year}-03-01', '${year}-03-10'),
			(2, 'north', 'I-2', 1, 'void', 30, 21, '${year}-03-01', null),
			(3, 'north', 'I-3', 1, 'sent', 30, 21, '${year}-11-01', null),
			(4, 'north', 'I-4', 1, 'paid', 30, 21, '${year}-12-20', '${year + 1}-01-05'),
			(5, 'south', 'I-5', 2, 'paid', 30, 21, '${year}-03-01', '${year}-03-10');
		insert into invoice_line (organization_id, invoice_id, description, quantity, unit_price,
			amount, order_id, source)
		values
			('north', 1, 'Project', 1, 12000000, 12000000, 100, null),
			('north', 1, 'Breakdown', 1, 5000000, 5000000, 101, null),
			('north', 1, 'Contract', 1, 3000000, 3000000, null, 'contracts:1:${year}-03-01'),
			('north', 1, 'Typed in', 1, 500000, 500000, null, null),
			('north', 1, 'Installation', 1, 0, 0, 102, null),
			('north', 2, 'Voided', 1, 10000000, 10000000, 101, null),
			('north', 3, 'Unpaid', 1, 10000000, 10000000, 101, null),
			('north', 4, 'Next year', 1, 10000000, 10000000, 101, null),
			('south', 5, 'South', 1, 99999900, 99999900, 200, null);
	`);
	return { db: drizzleQueued(client, { schema: { ...schema, ...moduleSchema } }) };
});

afterAll(() => {
	db.$client.close();
	rmSync(folder, { recursive: true, force: true });
});

const tenant = (organizationId: string): Tenant => ({
	organizationId,
	name: organizationId,
	slug: organizationId,
	roles: ["owner"],
	modules: ["invoices", "partner-programme"],
});
const north = <T>(work: () => Promise<T>) => asSystem(tenant("north"), work);
const south = <T>(work: () => Promise<T>) => asSystem(tenant("south"), work);

const euros = (amount: number) => amount * 100;

beforeEach(async () => {
	await db.delete(bonusCreditNote);
	await db.delete(walletEntry);
	await db.delete(bonusYear);
	await db.delete(orderClassification);
	await db.delete(programmeYear);
	await db.$client.executeMultiple(`delete from activity;`);
	for (const organizationId of ["north", "south"]) {
		await db.insert(programmeYear).values({
			organizationId,
			year: last,
			tiers: defaultTiers,
			categories: defaultCategoryRules,
		});
	}
});

describe("a partner's figures", () => {
	test("count its paid invoices of the year, by their lines' categories", async () => {
		const figures = await north(async () => {
			const rules = (await rulesFor(last))!;
			return (await figuresOf(rules, [1])).get(1)!;
		});
		// Not the void, unpaid or next year's invoices, nor South's.
		expect(figures.partnerRevenue).toBe(euros(205_000));
		// The project counts only by agreement: it has none.
		expect(figures.bonusRevenue).toEqual({ cash: euros(85_000), credit: euros(85_000) });
		expect(figures.level?.level).toBe("PLATINUM");
		expect(figures.bonus).toEqual({ cash: euros(3_230), credit: euros(4_080) });
	});

	test("go by the latest year's rules for a year that isn't set up", async () => {
		const rules = await north(() => rulesFor(current));
		expect(rules?.year).toBe(current);
		expect(rules?.tiers).toEqual(defaultTiers);
		expect(await north(() => rulesFor(last - 1))).toBeUndefined();
	});

	test("are the same in SQL, for the list", async () => {
		const rows = await north(async () => {
			const revenue = partnerRevenueSql((await rulesFor(last))!);
			return db.select().from(revenue);
		});
		expect(rows).toEqual([{ customerId: 1, partnerRevenue: euros(205_000) }]);
	});

	test("follow the order form's classification, saved with the order and logged", async () => {
		const save = (part: Record<string, unknown>) =>
			north(() =>
				db.transaction((tx) =>
					saveClassification({
						tx,
						order: { id: 100, number: "O-100" },
						from: "completed",
						status: "invoiced",
						form: { partnerProgramme: part } as never,
					}),
				),
			);
		await save({ category: "", eligibility: "partial", share: 25 });
		const figures = await north(async () => {
			const rules = (await rulesFor(last))!;
			return (await figuresOf(rules, [1])).get(1)!;
		});
		expect(figures.bonusRevenue.cash).toBe(euros(85_000 + 30_000));
		await save({ category: "tenders", eligibility: "excluded" });
		const excluded = await north(async () => {
			const rules = (await rulesFor(last))!;
			return {
				ts: (await figuresOf(rules, [1])).get(1)!.partnerRevenue,
				sql: await db.select().from(partnerRevenueSql(rules)),
			};
		});
		expect(excluded.ts).toBe(euros(85_000));
		expect(excluded.sql).toEqual([{ customerId: 1, partnerRevenue: euros(85_000) }]);
		// Back to the defaults: no row.
		await save({ category: "", eligibility: "" });
		expect(await db.select().from(orderClassification)).toEqual([]);
		const logged = await db.$client.execute(
			`select count(*) as n from activity where subject_type = 'partner_classification'`,
		);
		expect(logged.rows[0].n).toBe(3);
	});
});

describe("closing a year", () => {
	test("freezes each partner's figures, once, and only once the year is over", async () => {
		await expect(north(() => closeYear(current))).rejects.toBeDefined();
		expect(await north(() => closeYear(last))).toBe(2);
		const rows = await db
			.select()
			.from(bonusYear)
			.where(eq(bonusYear.organizationId, "north"))
			.orderBy(bonusYear.customerId);
		// Beta paid nothing: no level, no bonus.
		expect(rows.map((row) => [row.customerId, row.level, row.creditAmount])).toEqual([
			[1, "PLATINUM", euros(4_080)],
			[3, null, 0],
		]);
		expect(rows[0].creditValidUntil).toEqual(new Temporal.PlainDate(current, 12, 31));
		expect(await north(() => closeYear(last))).toBe(0);
		// South's partner isn't North's to close.
		expect(await db.select().from(bonusYear).where(eq(bonusYear.organizationId, "south"))).toEqual(
			[],
		);
	});

	test("lets the partner choose credit once, which goes into its wallet", async () => {
		await north(() => closeYear(last));
		await expect(south(() => chooseBonus(1, last, "credit"))).rejects.toBeDefined();
		await north(() => chooseBonus(1, last, "credit"));
		await expect(north(() => chooseBonus(1, last, "cash"))).rejects.toBeDefined();
		// Nothing to choose below the first level.
		await expect(north(() => chooseBonus(3, last, "credit"))).rejects.toBeDefined();
		const entries = await db.select().from(walletEntry);
		expect(entries.map((entry) => [entry.customerId, entry.kind, entry.amount])).toEqual([
			[1, "award", euros(4_080)],
		]);
		const [closed] = await db
			.select()
			.from(bonusYear)
			.where(and(eq(bonusYear.customerId, 1), eq(bonusYear.year, last)));
		expect(closed.choice).toBe("credit");
	});
});

describe("the wallet", () => {
	const holder = { id: 3, code: "C-3" };
	const today = Temporal.Now.plainDateISO();

	test("never takes more than is available", async () => {
		await north(() =>
			db.transaction((tx) =>
				addEntry(
					tx,
					holder,
					{ kind: "adjustment", amount: 500, validUntil: today.add({ days: 5 }) },
					today,
				),
			),
		);
		await expect(
			north(() =>
				db.transaction((tx) => addEntry(tx, holder, { kind: "spend", amount: -501 }, today)),
			),
		).rejects.toBeDefined();
		await north(() =>
			db.transaction((tx) => addEntry(tx, holder, { kind: "spend", amount: -500 }, today)),
		);
	});

	test("expires credit past its date in the daily job, once", async () => {
		await north(() =>
			db.transaction((tx) =>
				addEntry(
					tx,
					holder,
					{ kind: "award", amount: euros(100), validUntil: new Temporal.PlainDate(last, 12, 31) },
					today,
				),
			),
		);
		expect(await north(() => expireCredit({ today }))).toEqual({ "partner-programme.expired": 1 });
		expect(await north(() => expireCredit({ today }))).toEqual({});
		expect(await south(() => expireCredit({ today }))).toEqual({});
		const entries = await db.select().from(walletEntry).where(eq(walletEntry.customerId, 3));
		expect(entries.map((entry) => [entry.kind, entry.amount])).toEqual([
			["award", euros(100)],
			["expiry", -euros(100)],
		]);
	});

	test("keeps what's left of each credit with its entries: spent, given back, expired", async () => {
		const add = (entry: NewEntry) =>
			north(() => db.transaction((tx) => addEntry(tx, holder, entry, today)));
		const stored = async () =>
			(
				await db
					.select()
					.from(walletEntry)
					.where(eq(walletEntry.customerId, 3))
					.orderBy(walletEntry.id)
			).map((entry) => [entry.kind, entry.amount, entry.remaining]);
		await add({ kind: "award", amount: euros(100), validUntil: today.add({ days: 5 }) });
		await add({ kind: "adjustment", amount: euros(50), validUntil: today.add({ days: 1 }) });
		await add({ kind: "adjustment", amount: euros(10), validUntil: null });
		// The credit that expires first first: all of the adjustment's, then of the award.
		const spend = await add({ kind: "spend", amount: -euros(70) });
		expect(await stored()).toEqual([
			["award", euros(100), euros(80)],
			["adjustment", euros(50), 0],
			["adjustment", euros(10), euros(10)],
			["spend", -euros(70), 0],
		]);
		// Given back piece by piece, to the credit it was taken from.
		expect(
			await north(() => db.transaction((tx) => giveBackCredit(tx, holder, spend, "Cancelled"))),
		).toBe(euros(70));
		expect((await stored()).slice(0, 3)).toEqual([
			["award", euros(100), euros(100)],
			["adjustment", euros(50), euros(50)],
			["adjustment", euros(10), euros(10)],
		]);
		expect((await stored()).slice(4)).toEqual([
			["reversal", euros(50), 0],
			["reversal", euros(20), 0],
		]);
		// The daily job, two days on: the adjustment past its date expires.
		const later = today.add({ days: 2 });
		await north(() => expireCredit({ today: later }));
		expect((await stored()).slice(1, 2)).toEqual([["adjustment", euros(50), 0]]);
		expect((await stored()).at(-1)).toEqual(["expiry", -euros(50), 0]);
		// What's left of the credit still valid is what the wallet has available, also in SQL.
		const ledger = await north(() => ledgerOf(holder.id));
		expect(walletSummary(ledger, later).available).toBe(euros(110));
		expect(await north(() => outstandingCredit(later))).toBe(euros(110));
		// Before the job runs, the credit past its date isn't available either.
		await add({ kind: "adjustment", amount: euros(5), validUntil: today.subtract({ days: 1 }) });
		expect(await north(() => outstandingCredit(today))).toBe(euros(110));
		expect(walletSummary(await north(() => ledgerOf(holder.id)), today).available).toBe(euros(110));
	});
});

describe("credit notes", () => {
	/** The credit notes these tests add, removed after them. */
	const ids = [901, 902, 903, 904, 905, 906];
	const year = last;

	beforeAll(async () => {
		await db.$client.executeMultiple(`
			insert into credit_note (id, organization_id, number, customer_id, invoice_id, status,
				vat_rate, reason, issued_on, settled_on)
			values
				(901, 'north', 'CN-1', 1, 1, 'paid', 21, 'Returned', '${year}-05-01', '${year}-06-01'),
				(902, 'north', 'CN-2', 1, null, 'paid', 21, 'Partner Bonus', '${year}-06-01', '${year}-06-15'),
				(903, 'north', 'CN-3', 1, 1, 'sent', 21, 'Not settled', '${year}-07-01', null),
				(904, 'north', 'CN-4', 1, 1, 'void', 21, 'Voided', '${year}-07-01', null),
				(905, 'north', 'CN-5', 1, 4, 'paid', 21, 'Next year', '${year}-12-28', '${year + 1}-01-10'),
				(906, 'south', 'CN-1', 2, 5, 'paid', 21, 'South', '${year}-04-01', '${year}-04-02');
			insert into credit_note_line (organization_id, credit_note_id, description, quantity,
				unit_price, amount, order_id, source)
			values
				('north', 901, 'Breakdown', 1, -1000000, -1000000, 101, null),
				('north', 902, 'Cash Bonus', 1, -5000000, -5000000, null, '${bonusLineSource(1)}'),
				('north', 903, 'Breakdown', 1, -2000000, -2000000, 101, null),
				('north', 904, 'Breakdown', 1, -2000000, -2000000, 101, null),
				('north', 905, 'Next year', 1, -1000000, -1000000, 101, null),
				('south', 906, 'South', 1, -99999900, -99999900, 200, null);
		`);
	});
	afterAll(async () => {
		await db.$client.executeMultiple(`
			delete from credit_note_line where credit_note_id in (${ids.join(",")});
			delete from credit_note where id in (${ids.join(",")});
		`);
	});

	test("are taken off the revenue by the day they're settled, in the credited line's category", async () => {
		const lines = await north(() =>
			paidInvoiceLines({
				from: new Temporal.PlainDate(year, 1, 1),
				until: new Temporal.PlainDate(year, 12, 31),
			}),
		);
		// The settled ones of the year: not the one still sent, the void one or next year's (in no
		// particular order: the figures add them up).
		expect(
			lines
				.filter((line) => line.creditNoteId)
				.map((line) => [line.creditNoteId, line.amount])
				.toSorted(([a], [b]) => Number(a) - Number(b)),
		).toEqual([
			[901, -1_000_000],
			[902, -5_000_000],
		]);
		expect(lines.find((line) => line.creditNoteId === 901)).toMatchObject({
			customerId: 1,
			invoiceId: 1,
			orderId: 101,
			paidOn: new Temporal.PlainDate(year, 6, 1),
		});

		const figures = await north(async () => {
			const rules = (await rulesFor(last))!;
			return (await figuresOf(rules, [1])).get(1)!;
		});
		// The breakdown's € 10.000 back is off both; the bonus paid out as a credit note is neither.
		expect(figures.partnerRevenue).toBe(euros(195_000));
		expect(figures.bonusRevenue).toEqual({ cash: euros(75_000), credit: euros(75_000) });
		expect(figures.level?.level).toBe("GOLD+");
	});

	test("are taken off the Partner Omzet in SQL alike", async () => {
		const rows = await north(async () =>
			db.select().from(partnerRevenueSql((await rulesFor(last))!)),
		);
		expect(rows).toEqual([{ customerId: 1, partnerRevenue: euros(195_000) }]);
	});

	test("pay out a cash bonus: a draft for the cash, linked to the year, once", async () => {
		await north(() => closeYear(last));
		// Not before the partner chose cash.
		await expect(north(() => payBonusByCreditNote(1, last))).rejects.toBeDefined();
		await north(() => chooseBonus(1, last, "cash"));
		const [closed] = await db
			.select()
			.from(bonusYear)
			.where(and(eq(bonusYear.customerId, 1), eq(bonusYear.year, last)));
		expect(closed.cashAmount).toBeGreaterThan(0);

		// South can't pay out North's.
		await expect(south(() => payBonusByCreditNote(1, last))).rejects.toBeDefined();
		const made = await north(() => payBonusByCreditNote(1, last));
		// The tenant's next number (the ones above aren't in the series' format).
		expect(made.number).toBe(`CN-${current}-0001`);
		const [stored] = await db.select().from(creditNote).where(eq(creditNote.id, made.id));
		expect(stored).toMatchObject({
			organizationId: "north",
			customerId: 1,
			invoiceId: null,
			status: "draft",
			vatRate: 21,
			reason: `Partner Bonus ${last}`,
		});
		const lines = await db.$client.execute({
			sql: `select amount, source from credit_note_line where credit_note_id = ?`,
			args: [made.id],
		});
		expect(lines.rows.map((line) => [line.amount, line.source])).toEqual([
			[-closed.cashAmount, bonusLineSource(closed.id)],
		]);
		expect(await db.select().from(bonusCreditNote)).toMatchObject([
			{ organizationId: "north", bonusYearId: closed.id, creditNoteId: made.id },
		]);
		const years = await north(() => closedYearsOf(1));
		expect(years[0].creditNote).toMatchObject({
			number: made.number,
			status: "draft",
			total: -(closed.cashAmount + Math.round((closed.cashAmount * 21) / 100)),
		});
		// Once: while that one isn't void.
		await expect(north(() => payBonusByCreditNote(1, last))).rejects.toBeDefined();
		const logged = await db.$client.execute(
			`select count(*) as n from activity where subject_type = 'partner_bonus_year' and action = 'credited'`,
		);
		expect(logged.rows[0].n).toBe(1);
		// Invoicing's tables, cleared without its services (a module writes only its own tables).
		await db.delete(bonusCreditNote);
		await db.$client.executeMultiple(`
			delete from credit_note_line where credit_note_id = ${made.id};
			delete from credit_note where id = ${made.id};
		`);
	});
});
