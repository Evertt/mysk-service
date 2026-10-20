import { createClient } from "@libsql/client";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import { isForeignKeyViolation, refuseIfReferenced } from "#lib/server/db/errors.ts";
import { Refused } from "#lib/server/refused.ts";

describe("refuseIfReferenced", () => {
	let db: ReturnType<typeof drizzle>;

	beforeEach(async () => {
		db = drizzle(createClient({ url: ":memory:" }));
		await db.run(sql`pragma foreign_keys = on`);
		await db.run(sql`create table parent (id integer primary key)`);
		await db.run(
			sql`create table child (id integer primary key, parent_id integer references parent(id))`,
		);
		await db.run(sql`insert into parent (id) values (1), (2)`);
		await db.run(sql`insert into child (id, parent_id) values (1, 1)`);
	});

	it("deletes an unreferenced row", async () => {
		await refuseIfReferenced(
			() => db.run(sql`delete from parent where id = 2`),
			"Still referenced",
		);
		const rows = await db.all(sql`select id from parent`);
		expect(rows).toEqual([{ id: 1 }]);
	});

	it("refuses with the message while the row is referenced", async () => {
		const attempt = refuseIfReferenced(
			() => db.run(sql`delete from parent where id = 1`),
			"Still referenced",
		);
		// A refusal (which a remote function answers as one) rather than an HTTP error.
		await expect(attempt).rejects.toThrow(Refused);
		await expect(attempt).rejects.toHaveProperty("problems", [{ message: "Still referenced" }]);
		const rows = await db.all(sql`select id from parent`);
		expect(rows).toHaveLength(2);
	});

	it("refuses an update that would break a reference", async () => {
		const attempt = refuseIfReferenced(
			() => db.run(sql`update child set parent_id = 3 where id = 1`),
			"No such parent",
		);
		await expect(attempt).rejects.toHaveProperty("problems", [{ message: "No such parent" }]);
	});

	it("rethrows other errors", async () => {
		const attempt = refuseIfReferenced(() => db.run(sql`delete from missing`), "Still referenced");
		await expect(attempt).rejects.toSatisfy((error) => !isForeignKeyViolation(error));
	});
});
