/**
 * Starts the app for the end-to-end tests: a fresh, seeded database in a temporary folder and a
 * dev server on a free port that uses it, so the tests neither depend on nor change `local.db`
 * (or a dev server you have running).
 */
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { TestProject } from "vite-plus/test/node";

declare module "vitest" {
	export interface ProvidedContext {
		/** Where the app under test runs, e.g. `http://localhost:51234`. */
		baseURL: string;
		/** The app's database, a `file:` URL. */
		databaseURL: string;
	}
}

function freePort() {
	return new Promise<number>((resolve, reject) => {
		const server = createServer();
		server.unref();
		server.on("error", reject);
		server.listen(0, () => {
			const { port } = server.address() as { port: number };
			server.close(() => resolve(port));
		});
	});
}

async function waitUntilUp(url: string, server: ChildProcess, output: () => string) {
	const deadline = Date.now() + 60_000;
	while (Date.now() < deadline) {
		if (server.exitCode !== null) throw new Error(`The dev server exited:\n${output()}`);
		// Only once our own server says it listens there: another one may have taken the port.
		if (output().includes(url)) {
			try {
				await fetch(url, { redirect: "manual" });
				return;
			} catch {
				// Not answering yet.
			}
		}
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	throw new Error(`The dev server didn't start within a minute:\n${output()}`);
}

export default async function setup(project: TestProject) {
	const folder = mkdtempSync(join(tmpdir(), "fieldworks-e2e-"));
	const databaseURL = `file:${join(folder, "test.db")}`;
	const port = await freePort();
	const baseURL = `http://localhost:${port}`;
	// Variables set here win over the ones in .env (BETTER_AUTH_SECRET still comes from there).
	const env = { ...process.env, DATABASE_URL: databaseURL, ORIGIN: baseURL };

	const run = (command: string, args: string[]) =>
		execFileSync(command, args, { env, stdio: ["ignore", "pipe", "pipe"] });
	run("node_modules/.bin/drizzle-kit", ["push", "--force"]);
	run("node", ["--env-file=.env", "src/lib/server/db/seed.ts"]);

	let output = "";
	// Detached: its own process group, so stopping it also stops the Vite process `vp` starts.
	const server = spawn("node_modules/.bin/vp", ["dev", "--port", String(port), "--strictPort"], {
		env,
		stdio: ["ignore", "pipe", "pipe"],
		detached: true,
	});
	server.stdout?.on("data", (chunk) => (output += chunk));
	server.stderr?.on("data", (chunk) => (output += chunk));
	const teardown = async () => {
		if (server.exitCode === null) {
			const exited = new Promise((resolve) => server.once("exit", resolve));
			process.kill(-server.pid!, "SIGTERM");
			await exited;
		}
		if (process.env.E2E_SERVER_LOG) console.error(output);
		rmSync(folder, { recursive: true, force: true });
	};
	try {
		await waitUntilUp(baseURL, server, () => output);
	} catch (error) {
		await teardown();
		throw error;
	}

	project.provide("baseURL", baseURL);
	project.provide("databaseURL", databaseURL);
	return teardown;
}
