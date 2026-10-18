/**
 * The migration that made each wallet entry keep what's left of the credit it brought in
 * (`remaining`): both streams' copies backfill it as replaying the ledger (`creditLeft()`) says,
 * on generated ledgers with every case. Here rather than in `migrations.spec.ts`, as it needs the
 * programme's rules, which only the module itself may import.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { expect, test } from "vite-plus/test";

import {
	creditLeft,
	creditTaken,
	type WalletEntry,
	walletSummary,
} from "#modules/partner-programme/model.ts";
import {
	durableFolder,
	migrationScratch,
	migrationsFolder,
} from "#unit/lib/server/db/migrations.test-support.ts";

const { folder, streamBefore } = migrationScratch();

/** A wallet entry of `walletLedgers()`, with the day it was made. */
type LedgerRow = WalletEntry & { id: number; customerId: number; on: Temporal.PlainDate };

/**
 * Six wallets' ledgers, of two tenants, as the app makes them over three years: awards for a year
 * (valid until 31 December, of that year or the next), adjustments up (some never expiring) and
 * down, spends of what's available, spends given back piece by piece (some after their credit
 * expired) and reversals by hand beyond what was taken, and the daily job's expiries (none for the
 * credit that expired last). Made by a seeded random, so the same each run.
 */
function walletLedgers() {
	let seed = 20_261_018;
	const random = () => (seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31) / 2 ** 31;
	const pick = <T>(values: readonly T[]): T | undefined =>
		values[Math.floor(random() * values.length)];
	const cents = () => 100 * (10 + Math.floor(random() * 1_500));
	const rows: LedgerRow[] = [];
	const customers = [
		{ organizationId: "a", customerId: 1, years: [1, 2] },
		{ organizationId: "a", customerId: 2, years: [3] },
		{ organizationId: "a", customerId: 3, years: [] },
		{ organizationId: "b", customerId: 4, years: [4, 5] },
		{ organizationId: "b", customerId: 5, years: [6] },
		{ organizationId: "b", customerId: 6, years: [] },
	];
	for (const { customerId, years } of customers) {
		const own = () => rows.filter((row) => row.customerId === customerId);
		const add = (entry: Omit<LedgerRow, "id" | "customerId">) =>
			rows.push({ ...entry, id: rows.length + 1, customerId });
		let on = new Temporal.PlainDate(2024, 1, 10);
		for (let step = 0; step < 45; step++) {
			on = on.add({ days: 1 + Math.floor(random() * 40) });
			const roll = random();
			const { available, expired } = walletSummary(own(), on);
			if (roll < 0.2) {
				const validUntil = new Temporal.PlainDate(on.year + Math.floor(random() * 2), 12, 31);
				const bonusYearId = pick([...years, null]) ?? null;
				add({ kind: "award", amount: cents(), validUntil, bonusYearId, on });
			} else if (roll < 0.3) {
				const validUntil = random() < 0.4 ? null : on.add({ days: 30 + Math.floor(random() * 90) });
				add({ kind: "adjustment", amount: cents(), validUntil, bonusYearId: null, on });
			} else if (roll < 0.6) {
				if (!available) continue;
				const kind = random() < 0.8 ? "spend" : "adjustment";
				add({ kind, amount: -Math.min(available, cents()), validUntil: null, on });
			} else if (roll < 0.75) {
				const spend = pick(own().filter((row) => row.kind === "spend"));
				if (!spend) continue;
				for (const piece of creditTaken(own(), spend.id)) add({ kind: "reversal", ...piece, on });
			} else if (roll < 0.8) {
				const named = pick(own().filter((row) => row.amount > 0));
				if (!named) continue;
				const { validUntil, bonusYearId } = named;
				add({ kind: "reversal", amount: cents(), validUntil, bonusYearId, on });
			} else {
				for (const lot of expired) add({ kind: "expiry", ...lot, amount: -lot.amount, on });
			}
		}
	}
	return { customers, rows };
}

/** `walletLedgers()` as stored before the wallets kept what's left of each credit. */
function beforeRemaining() {
	const { customers, rows } = walletLedgers();
	const quote = (value: Temporal.PlainDate | number | null | undefined) =>
		value === null || value === undefined ? "null" : `'${value.toString()}'`;
	// At noon UTC: the same day in the time zones the tests run in.
	const madeAt = (on: Temporal.PlainDate) =>
		on.toZonedDateTime({ timeZone: "UTC", plainTime: "12:00" }).epochMilliseconds / 1000;
	const organizationOf = (customerId: number) =>
		customers.find((each) => each.customerId === customerId)!.organizationId;
	const sql = `
		insert into organization (id, name, slug, created_at) values ('a', 'A', 'a', 1), ('b', 'B', 'b', 2);
		insert into customer (id, organization_id, code, name, contact_name, email, phone, city, country, segment)
		values ${customers
			.map(
				({ organizationId, customerId }) =>
					`(${customerId}, '${organizationId}', 'C-${customerId}', 'C', 'C', 'c@c.test', '1', 'Ede', 'NL', 'enterprise')`,
			)
			.join(", ")};
		insert into partner_bonus_year (id, organization_id, customer_id, year, status, partner_revenue,
			bonus_revenue_cash, bonus_revenue_credit, cash_amount, credit_amount, credit_valid_until, finalised_at)
		values ${customers
			.flatMap(({ organizationId, customerId, years }) =>
				years.map(
					(id) =>
						`(${id}, '${organizationId}', ${customerId}, ${2020 + id}, 'finalised', 0, 0, 0, 0, 0, '2025-12-31', 0)`,
				),
			)
			.join(", ")};
		insert into partner_wallet_entry (id, organization_id, customer_id, bonus_year_id, kind, amount, valid_until, created_at)
		values ${rows
			.map(
				(row) =>
					`(${row.id}, '${organizationOf(row.customerId)}', ${row.customerId}, ${quote(row.bonusYearId)}, '${row.kind}', ${row.amount}, ${quote(row.validUntil)}, ${madeAt(row.on!)})`,
			)
			.join(",\n")};
	`;
	// What's left of each credit as the app replays the ledgers.
	const left = new Map<number, number>();
	for (const { customerId } of customers) {
		const own = rows.filter((row) => row.customerId === customerId);
		for (const [id, remaining] of creditLeft(own)) left.set(id, remaining);
	}
	return { sql, rows, left };
}

/** Each entry's `remaining`, by id. */
const remainingOf = async (client: ReturnType<typeof createClient>) =>
	new Map(
		(await client.execute("select id, remaining from partner_wallet_entry order by id")).rows.map(
			(row) => [Number(row.id), Number(row.remaining)],
		),
	);

test("the wallets' ledgers have every case the backfill replays", () => {
	const { rows, left } = beforeRemaining();
	const past = (date: Temporal.PlainDate | null, on: Temporal.PlainDate) =>
		!!date && Temporal.PlainDate.compare(date, on) < 0;
	const last = rows.at(-1)!.on;
	expect(new Set(rows.map((row) => row.kind))).toEqual(
		new Set(["award", "adjustment", "spend", "reversal", "expiry"]),
	);
	// Credit past its date the daily job hasn't expired yet.
	expect(rows.some((row) => left.get(row.id)! > 0 && past(row.validUntil, last))).toBe(true);
	// A spend given back to credit that expired since.
	expect(rows.some((row) => row.kind === "reversal" && past(row.validUntil, row.on))).toBe(true);
	// A reversal beyond what was taken of the credit it names, credit of its own.
	expect(rows.some((row) => row.kind === "reversal" && left.get(row.id)! > 0)).toBe(true);
	// Spends that took from more than one credit.
	const ledgerOf = (customerId: number) => rows.filter((row) => row.customerId === customerId);
	expect(
		rows.some(
			(row) => row.kind === "spend" && creditTaken(ledgerOf(row.customerId), row.id).length > 1,
		),
	).toBe(true);
});

test("0031_wallet-credit-remaining keeps what's left of each credit, as replaying the ledger says", async () => {
	const before = streamBefore(migrationsFolder, "0031_wallet-credit-remaining", "before-remaining");
	const client = createClient({ url: `file:${join(folder, "remaining.db")}` });
	await migrate(drizzle(client), { migrationsFolder: before });
	const { sql, left } = beforeRemaining();
	await client.executeMultiple(sql);
	await migrate(drizzle(client), { migrationsFolder });
	expect(await remainingOf(client)).toEqual(left);
	expect(
		(
			await client.execute(
				"select name from sqlite_master where name like '\\_\\_wallet%' escape '\\'",
			)
		).rows,
	).toEqual([]);
	client.close();
});

test("the Durable Object's 0023_wallet-credit-remaining does the same with its foreign keys on", async () => {
	const before = streamBefore(
		durableFolder,
		"0023_wallet-credit-remaining",
		"before-remaining-durable",
	);
	const client = createClient({ url: `file:${join(folder, "remaining-durable.db")}` });
	await migrate(drizzle(client), { migrationsFolder: before });
	const { sql, left } = beforeRemaining();
	await client.executeMultiple(sql);
	expect((await client.execute("pragma foreign_keys")).rows[0].foreign_keys).toBe(1);
	const statements = readFileSync(join(durableFolder, "0023_wallet-credit-remaining.sql"), "utf8")
		.split("--> statement-breakpoint")
		.map((statement) => statement.trim())
		.filter(Boolean);
	await client.batch(statements, "write");
	expect(await remainingOf(client)).toEqual(left);
	client.close();
});
