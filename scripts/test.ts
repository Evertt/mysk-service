/**
 * Runs the tests (`pnpm test`, and CI with its arguments, e.g. `--project e2e --shard=1/3`), then
 * once more the files that failed, each afresh: a new server, database and browser page.
 *
 * Retrying single tests wouldn't do: an end-to-end file's tests are steps on one shared page, so a
 * retried test would start from where its failed first try left the page. It's for failures that
 * aren't the app's: a module skeleton that comes in while a navigation is pending can freeze the
 * page (a Svelte 5.57 bug, see "Skeletons" in AGENTS.md). A file that fails again fails the run.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

const args = process.argv.slice(2);
const dir = mkdtempSync(join(tmpdir(), "vitest-"));
const report = join(dir, "report.json");

/** Runs Vitest with `extra` arguments; whether it passed. */
const vitest = (extra: string[]) =>
	spawnSync(
		"vp",
		[
			"test",
			"run",
			"--reporter=default",
			"--reporter=json",
			`--outputFile.json=${report}`,
			...extra,
		],
		{ stdio: "inherit" },
	).status === 0;

/** Runs the tests, then the files that failed once more; whether they passed in the end. */
function run() {
	if (vitest(args)) return true;

	const results: { name: string; status: string }[] = JSON.parse(
		readFileSync(report, "utf8"),
	).testResults;
	const failed = results
		.filter((result) => result.status === "failed")
		.map((result) => relative(process.cwd(), result.name));
	// Nothing to retry when the run failed before any file did (e.g. a type error in the setup).
	if (!failed.length) return false;

	console.log(`\nRunning ${failed.length} failed file(s) again:\n  ${failed.join("\n  ")}\n`);
	return vitest([...rerunOptions(args), ...failed]);
}

/**
 * The options to run the failed files again with: the projects and the `--name=value` options, but
 * not the file filters or the sharding that picked them.
 */
function rerunOptions(args: string[]) {
	const options: string[] = [];
	for (const [index, arg] of args.entries()) {
		if (arg.startsWith("--shard")) continue;
		if (arg === "--project") options.push(arg, args[index + 1]);
		else if (/^--[\w.-]+=/.test(arg)) options.push(arg);
	}
	return options;
}

let passed = false;
try {
	passed = run();
} finally {
	rmSync(dir, { recursive: true, force: true });
}
process.exitCode = passed ? 0 : 1;
