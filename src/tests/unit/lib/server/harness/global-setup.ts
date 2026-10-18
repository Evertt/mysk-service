/**
 * Seeds the database the server specs of the `server-harness` project copy (see `database.ts`):
 * once per test run, as the e2e global setup does (`src/tests/e2e/global-setup.ts`), into a
 * temporary folder, so the specs neither depend on nor change `local.db`. Vitest runs a project's
 * global setup only when the run has a file of that project, so a run without a harness spec
 * doesn't wait for the seed. With `TEST_NOW`, seeded at that moment (`src/tests/clock/clock.ts`).
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createClient } from "@libsql/client";
import type { TestProject } from "vite-plus/test/node";

import { installTestClock, shiftSchemaDefaults } from "#clock/clock.ts";

declare module "vitest" {
	export interface ProvidedContext {
		/** The seeded demo database (a file path) that each harness spec file gets a copy of. */
		seededDatabase: string;
	}
}

export default async function setup(project: TestProject) {
	// Before the seed starts, which then runs at `TEST_NOW` too.
	await installTestClock();
	const folder = mkdtempSync(join(tmpdir(), "fieldworks-specs-"));
	const template = join(folder, "seeded.db");
	try {
		const run = (command: string, args: string[]) =>
			execFileSync(command, args, {
				env: { ...process.env, DATABASE_URL: `file:${template}` },
				stdio: ["ignore", "pipe", "pipe"],
			});
		run("node_modules/.bin/drizzle-kit", ["migrate"]);
		await shiftSchemaDefaults(`file:${template}`);
		run("node", ["--env-file-if-exists=.env", "src/lib/server/db/seed/index.ts"]);
		// As in the e2e tests: the demo's simulations start paused, so the seeded states hold.
		const seeded = createClient({ url: `file:${template}` });
		await seeded.execute("update simulation set running = 0");
		seeded.close();
	} catch (error) {
		rmSync(folder, { recursive: true, force: true });
		const output = (error as { stderr?: Buffer }).stderr?.toString();
		throw new Error(`Seeding the specs' database failed${output ? `:\n${output}` : ""}`, {
			cause: error,
		});
	}
	project.provide("seededDatabase", template);
	return () => rmSync(folder, { recursive: true, force: true, maxRetries: 3 });
}
