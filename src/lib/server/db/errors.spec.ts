import { createClient } from "@libsql/client";
import { isHttpError } from "@sveltejs/kit";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import { deleteOrRefuse, isForeignKeyViolation } from "./errors.ts";

describe("deleteOrRefuse", () => {
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
		await deleteOrRefuse(() => db.run(sql`delete from parent where id = 2`), "Still referenced");
		const rows = await db.all(sql`select id from parent`);
		expect(rows).toEqual([{ id: 1 }]);
	});

	it("refuses with the message while the row is referenced", async () => {
		const attempt = deleteOrRefuse(
			() => db.run(sql`delete from parent where id = 1`),
			"Still referenced",
		);
		// `invalid()` throws SvelteKit's validation error rather than an HTTP error.
		await expect(attempt).rejects.toSatisfy(
			(error) => !isHttpError(error) && error instanceof Error,
		);
		await expect(attempt).rejects.toHaveProperty("issues", [{ message: "Still referenced" }]);
		const rows = await db.all(sql`select id from parent`);
		expect(rows).toHaveLength(2);
	});

	it("rethrows other errors", async () => {
		const attempt = deleteOrRefuse(() => db.run(sql`delete from missing`), "Still referenced");
		await expect(attempt).rejects.toSatisfy((error) => !isForeignKeyViolation(error));
	});
});
