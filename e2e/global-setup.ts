/**
 * Starts the app for the end-to-end tests, in temporary folders, so the tests neither depend on
 * nor change `local.db` (or a dev server you have running).
 *
 * The app is built once and served by one production server per test worker ("lane"), each on a
 * free port with its own copy of a freshly seeded database. Test files run in parallel across the
 * lanes; within a lane, one after another.
 *
 * With `E2E_DEV=1`, it uses a single dev server instead (and the files run one at a time): slower,
 * but with Svelte's dev-only warnings, for debugging.
 */
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { TestProject } from "vite-plus/test/node";

export interface Lane {
	/** Where the app under test runs, e.g. `http://localhost:51234`. */
	baseURL: string;
	/** Its database, a `file:` URL. */
	databaseURL: string;
	/** The file the app writes its mail to (`MAIL_OUTBOX`), one JSON object per line. */
	outbox: string;
}

declare module "vitest" {
	export interface ProvidedContext {
		/** One app per test worker, see `useApp` in `app.ts`. */
		lanes: Lane[];
	}
}

const dev = !!process.env.E2E_DEV;

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

/**
 * Starts the app on a free port with its own database and mail outbox; resolves once it answers.
 */
async function startServer(databaseURL: string, outbox: string) {
	const port = await freePort();
	const baseURL = `http://localhost:${port}`;
	let output = "";
	// Variables set here win over the ones in .env (BETTER_AUTH_SECRET still comes from there). The
	// outbox also keeps mail from going out through an SMTP_URL in .env.
	// Detached: its own process group, so stopping it also stops the Vite process `vp` starts.
	const server = spawn(
		"node_modules/.bin/vp",
		[dev ? "dev" : "preview", "--port", String(port), "--strictPort"],
		{
			env: { ...process.env, DATABASE_URL: databaseURL, ORIGIN: baseURL, MAIL_OUTBOX: outbox },
			stdio: ["ignore", "pipe", "pipe"],
			detached: true,
		},
	);
	server.stdout?.on("data", (chunk) => (output += chunk));
	server.stderr?.on("data", (chunk) => (output += chunk));

	const stop = async () => {
		if (server.exitCode === null) {
			const exited = new Promise((resolve) => server.once("exit", resolve));
			process.kill(-server.pid!, "SIGTERM");
			await exited;
		}
		if (process.env.E2E_SERVER_LOG) console.error(output);
	};
	try {
		await waitUntilUp(baseURL, server, () => output);
	} catch (error) {
		await stop();
		throw error;
	}
	return { baseURL, stop };
}

async function waitUntilUp(url: string, server: ChildProcess, output: () => string) {
	const deadline = Date.now() + 60_000;
	const [domain, port] = url.split(":");
	while (Date.now() < deadline) {
		if (server.exitCode !== null) throw new Error(`The server exited:\n${output()}`);
		// Only once our own server says it listens there: another one may have taken the port.
		if (output().includes(domain) && output().includes(port)) {
			try {
				await fetch(url, { redirect: "manual" });
				return;
			} catch {
				// Not answering yet.
			}
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	throw new Error(`The server didn't start within a minute:\n${output()}`);
}

export default async function setup(project: TestProject) {
	const folder = mkdtempSync(join(tmpdir(), "fieldworks-e2e-"));
	const template = join(folder, "seeded.db");
	const run = (command: string, args: string[]) =>
		execFileSync(command, args, {
			env: { ...process.env, DATABASE_URL: `file:${template}` },
			stdio: ["ignore", "pipe", "pipe"],
		});
	run("node_modules/.bin/drizzle-kit", ["migrate"]);
	run("node", ["--env-file=.env", "src/lib/server/db/seed/index.ts"]);
	if (!dev) run("node_modules/.bin/vp", ["build"]);

	const count = dev ? 1 : project.config.maxWorkers;
	const started = await Promise.allSettled(
		Array.from({ length: count }, async (_, i) => {
			const database = join(folder, `lane-${i + 1}.db`);
			copyFileSync(template, database);
			const databaseURL = `file:${database}`;
			const outbox = join(folder, `lane-${i + 1}-outbox.jsonl`);
			return { databaseURL, outbox, ...(await startServer(databaseURL, outbox)) };
		}),
	);
	const servers = started.flatMap((result) =>
		result.status === "fulfilled" ? [result.value] : [],
	);
	const teardown = async () => {
		await Promise.all(servers.map((server) => server.stop()));
		rmSync(folder, { recursive: true, force: true });
	};
	const failed = started.find((result) => result.status === "rejected");
	if (failed) {
		await teardown();
		throw failed.reason;
	}

	project.provide(
		"lanes",
		servers.map(({ baseURL, databaseURL, outbox }) => ({ baseURL, databaseURL, outbox })),
	);
	return teardown;
}
