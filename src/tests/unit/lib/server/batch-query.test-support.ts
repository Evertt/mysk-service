/**
 * The tests every record's batch query gets (`getOrder`, `getCustomer`, `getEquipment`,
 * `getEngineer`: what a record's page and its hover card read), called from each domain's server
 * spec with how to find its keys.
 */
import type { RemoteQueryFunction } from "$app/server";
import { expect, test } from "vite-plus/test";

import {
	as,
	call,
	callBatch,
	north,
	organizationId,
	rows,
	south,
} from "#unit/lib/server/harness/index.ts";

export interface BatchQueryCase<T> {
	query: RemoteQueryFunction<string, T>;
	/** The table its records are in, and the column of the key (`"order"`, `"number"`). */
	table: string;
	column: string;
	/** The key an answer is for, to check each key got its own record. */
	keyOf: (answer: T) => string;
}

/** An organization's keys, in the order the records were made. */
async function keysIn(organization: "north" | "south", { table, column }: BatchQueryCase<unknown>) {
	const found = await rows<{ key: string | number }>(
		`select ${column} as key from "${table}" where organization_id = ? order by id`,
		[organizationId(organization)],
	);
	return found.map(({ key }) => String(key));
}

export function batchQueryTests<T>(record: BatchQueryCase<T>) {
	const { query, keyOf } = record;

	test("it answers several keys in one call, in no more statements than one key", async () => {
		const keys = (await keysIn("north", record as BatchQueryCase<unknown>)).slice(0, 3);
		expect(keys).toHaveLength(3);
		const { answers, statements } = await as(north.member, () => callBatch(query, keys));
		expect(answers.map((answer) => answer.status)).toEqual([200, 200, 200]);
		expect(answers.map((answer) => keyOf(answer.data!))).toEqual(keys);
		const one = await as(north.member, () => callBatch(query, keys.slice(0, 1)));
		expect(statements).toBe(one.statements);
	});

	test("an unknown key is a 404 of its own, and the others answer", async () => {
		const [known] = await keysIn("north", record as BatchQueryCase<unknown>);
		const { answers } = await as(north.member, () => callBatch(query, ["99999999", known]));
		expect(answers.map((answer) => answer.status)).toEqual([404, 200]);
		expect(answers[0].message).toBeTruthy();
		expect(await as(north.member, () => call(query, "99999999"))).toMatchObject({ status: 404 });
	});

	test("North's keys asked by South are a 404 each, also beside South's own", async () => {
		const northKeys = await keysIn("north", record as BatchQueryCase<unknown>);
		const southKeys = new Set(await keysIn("south", record as BatchQueryCase<unknown>));
		// Codes and numbers repeat between tenants; a key only North has.
		const northOnly = northKeys.find((key) => !southKeys.has(key))!;
		const [southKey] = southKeys;
		const { answers } = await as(south.owner, () => callBatch(query, [northOnly, southKey]));
		expect(answers.map((answer) => answer.status)).toEqual([404, 200]);
		expect(keyOf(answers[1].data!)).toBe(southKey);
	});

	test("more than 100 keys at once work", async () => {
		const known = (await keysIn("north", record as BatchQueryCase<unknown>)).slice(0, 60);
		const unknown = Array.from({ length: 110 }, (_, i) => `NONE-${i}`);
		const { answers } = await as(north.member, () => callBatch(query, [...known, ...unknown]));
		expect(answers.length).toBeGreaterThan(100);
		expect(answers.slice(0, known.length).every((answer) => answer.status === 200)).toBe(true);
		expect(answers.slice(known.length).every((answer) => answer.status === 404)).toBe(true);
	});

	test("customers' contacts and field engineers are refused", async () => {
		const [key] = await keysIn("north", record as BatchQueryCase<unknown>);
		for (const actor of [north.engineer, north.customer]) {
			const { answers } = await as(actor, () => callBatch(query, [key]));
			expect(answers[0].status).toBe(403);
		}
	});
}
