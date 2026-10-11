import { DATABASE_AUTH_TOKEN, DATABASE_URL } from "$app/env/private";
import { createClient } from "@libsql/client";

import * as moduleSchema from "./modules.gen.ts";
import * as schema from "./schema.ts";
import { drizzleQueued } from "./serialize.ts";

if (!DATABASE_URL) throw new Error("DATABASE_URL is not set");

// Transactions take turns (see `drizzleQueued`). The busy timeout is for other processes using the
// file, e.g. drizzle-kit studio or the e2e tests. A Turso database (`libsql://…`) needs its token.
// The modules' tables (and their relations) are in the schema too, so `db.query.<table>` knows them.
export const db = drizzleQueued(
	createClient({ url: DATABASE_URL, authToken: DATABASE_AUTH_TOKEN, timeout: 5000 }),
	{ schema: { ...schema, ...moduleSchema } },
);

/** A transaction on the app's database, as `db.transaction` passes it to its callback. */
export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
