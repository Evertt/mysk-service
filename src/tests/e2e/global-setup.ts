/**
 * Starts the app for the end-to-end tests, in temporary folders, so the tests neither depend on
 * nor change `local.db` (or a dev server you have running).
 *
 * The app is built once and served by one production server per test worker ("lane"), each on a
 * free port with its own copy of a freshly seeded database. Test files run in parallel across the
 * lanes; within a lane, one after another. The build and the servers run with
 * `NODE_ENV=production`, which Vitest would otherwise pass on as `test`, making a dev build of
 * Svelte: the tests check what's deployed.
 *
 * With `E2E_DEV=1`, it uses a single dev server instead (and the files run one at a time): slower,
 * but with Svelte's dev-only checks, e.g. the hydration mismatch warnings, for debugging.
 */
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { constants, tmpdir } from "node:os";
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

/**
 * The process groups of the servers that may still be running. Each is a `vp` process and the
 * Vite process it starts, which outlives `vp` (a SIGTERM ends `vp` at once, while Vite closes).
 */
const running = new Set<number>();

/** Sends `signal` to a server's process group; false if the group is gone. */
function signalGroup(pid: number, signal: NodeJS.Signals | 0) {
	try {
		process.kill(-pid, signal);
		return true;
	} catch {
		return false;
	}
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
			env: {
				...process.env,
				...(dev ? {} : { NODE_ENV: "production" }),
				DATABASE_URL: databaseURL,
				ORIGIN: baseURL,
				MAIL_OUTBOX: outbox,
			},
			stdio: ["ignore", "pipe", "pipe"],
			detached: true,
		},
	);
	const pid = server.pid!;
	running.add(pid);
	server.stdout?.on("data", (chunk) => (output += chunk));
	server.stderr?.on("data", (chunk) => (output += chunk));

	// Until the whole group is gone, not just `vp`: SIGKILL if Vite takes more than 5 s to close.
	const stop = async () => {
		if (signalGroup(pid, "SIGTERM")) {
			const deadline = Date.now() + 5_000;
			while (signalGroup(pid, 0) && Date.now() < deadline) await sleep(50);
			signalGroup(pid, "SIGKILL");
		}
		running.delete(pid);
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
		await sleep(100);
	}
	throw new Error(`The server didn't start within a minute:\n${output()}`);
}

export default async function setup(project: TestProject) {
	const folder = mkdtempSync(join(tmpdir(), "fieldworks-e2e-"));
	const removeFolder = () => rmSync(folder, { recursive: true, force: true, maxRetries: 3 });

	// An interrupted run never gets to the teardown: on Ctrl+C (SIGINT) or SIGTERM, Vitest exits
	// right away. The servers are detached, so the signal doesn't reach them either, and they would
	// run on. So whatever way this process exits, it kills them (synchronously, as `exit` requires).
	const killServers = () => {
		for (const pid of running) signalGroup(pid, "SIGKILL");
		try {
			removeFolder();
		} catch {
			// Left in the system's temporary folder.
		}
	};
	// A signal without a listener ends Node without an `exit` event: Vitest doesn't listen for
	// SIGHUP (a closed terminal), and stops listening for SIGINT and SIGTERM once it's closing. A
	// listener takes the place of Node's default, so this one exits, unless Vitest did already.
	const exitOnSignal = (signal: NodeJS.Signals) => {
		process.exitCode ??= 128 + constants.signals[signal];
		setTimeout(() => process.exit(), 100);
	};
	const signals = ["SIGINT", "SIGTERM", "SIGHUP"] as const;
	process.on("exit", killServers);
	for (const signal of signals) process.on(signal, exitOnSignal);

	const template = join(folder, "seeded.db");
	const run = (command: string, args: string[]) =>
		execFileSync(command, args, {
			env: { ...process.env, DATABASE_URL: `file:${template}` },
			stdio: ["ignore", "pipe", "pipe"],
		});
	run("node_modules/.bin/drizzle-kit", ["migrate"]);
	run("node", ["--env-file=.env", "src/lib/server/db/seed/index.ts"]);
	if (!dev) {
		// Paraglide compiles the messages into `src/lib/paraglide`, a module per message in a
		// production build. The component tests, which run while the servers are up, load them from
		// there too, a module per language: keeping that layout keeps them from loading ~2,900 modules
		// per test file, which slowed their clicks into timeouts.
		execFileSync("node_modules/.bin/vp", ["build"], {
			env: {
				...process.env,
				NODE_ENV: "production",
				PARAGLIDE_OUTPUT_STRUCTURE: "locale-modules",
			},
			stdio: ["ignore", "pipe", "pipe"],
		});
	}

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
		removeFolder();
		process.off("exit", killServers);
		for (const signal of signals) process.off(signal, exitOnSignal);
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
