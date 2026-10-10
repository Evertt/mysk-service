/**
 * The command line of `create-organization.ts`, which creates an organization and its owner on a new
 * deployment. Kept apart from the script so it can be tested without a database.
 */
import { parseArgs } from "node:util";

import * as v from "valibot";

// Not `#lib/modules/manifests.ts`, the registry: it registers Svelte components, which plain Node can't load.
import { changeModules, type ModuleGraph, moduleSetProblems } from "#lib/modules/graph.ts";
import { type ModuleId, moduleGraph, moduleIds } from "#lib/modules/ids.ts";

export const usage = `Creates an organization and its owner, e.g. on a new deployment.

Usage: pnpm run org:create -- --org <name> --slug <slug> --owner-email <email> --owner-name <name>
                              [--modules <id>,<id>]

  --org          The organization's name, e.g. "Acme Service"
  --slug         Its short name in URLs: lower-case letters, digits and dashes, e.g. acme
  --owner-email  The owner's email address, which they sign in with
  --owner-name   The owner's name
  --modules      Optional modules to switch on, with what they require: ${moduleIds.join(", ")}
                 (none by default; owners can change them later)

The owner gets a generated password, printed once. Refuses if the slug or the email is taken.`;

export interface CreateOptions {
	org: string;
	slug: string;
	ownerEmail: string;
	ownerName: string;
	modules: ModuleId[];
}

/** A command line that can't be used, with what's wrong. */
export class UsageError extends Error {}

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** `args` parsed by Node, with its complaints as `UsageError`s. */
function parse(args: string[]) {
	try {
		return parseArgs({
			// `pnpm run org:create -- …` passes the `--` on.
			args: args[0] === "--" ? args.slice(1) : args,
			options: {
				org: { type: "string" },
				slug: { type: "string" },
				"owner-email": { type: "string" },
				"owner-name": { type: "string" },
				modules: { type: "string" },
				help: { type: "boolean", short: "h" },
			},
			allowPositionals: true,
		});
	} catch (error) {
		throw new UsageError((error as Error).message);
	}
}

/**
 * The options in `args` (the arguments after the script, as `pnpm run` passes them), or `"help"`
 * for `--help`. Throws a `UsageError` saying what's wrong otherwise. The modules are checked
 * against `graph` as the settings page checks a switch (`changeModules()`): each needs what it
 * requires, and always-on ones are left out (they're on anyway).
 */
export function parseCreateArgs(
	args: string[],
	graph: ModuleGraph = moduleGraph,
): CreateOptions | "help" {
	const { values, positionals } = parse(args);
	if (values.help) return "help";
	if (positionals.length) throw new UsageError(`Unexpected argument: ${positionals[0]}`);

	const problems: string[] = [];
	const required = (name: string, value: string | undefined) => {
		const trimmed = value?.trim() ?? "";
		if (!trimmed) problems.push(`--${name} is required`);
		return trimmed;
	};
	const org = required("org", values.org);
	const slug = required("slug", values.slug);
	const ownerEmail = required("owner-email", values["owner-email"]).toLowerCase();
	const ownerName = required("owner-name", values["owner-name"]);
	if (slug && !slugPattern.test(slug)) {
		problems.push("--slug may only have lower-case letters, digits and dashes, e.g. acme-service");
	}
	if (ownerEmail && !v.EMAIL_REGEX.test(ownerEmail)) {
		problems.push("--owner-email isn't an email address");
	}

	const known = Object.keys(graph);
	const modules = [
		...new Set(
			(values.modules ?? "")
				.split(",")
				.map((id) => id.trim())
				.filter(Boolean),
		),
	];
	const unknown = modules.filter((id) => !known.includes(id));
	if (unknown.length) {
		problems.push(`Unknown modules: ${unknown.join(", ")} (there are ${known.join(", ")})`);
	}
	let stored: string[] = [];
	if (!unknown.length) {
		const outcome = changeModules([], { enable: modules, disable: [] }, graph);
		if ("refused" in outcome) {
			const asked = modules.filter((id) => !graph[id].alwaysOn);
			for (const { module, missing } of moduleSetProblems(asked, graph)) {
				const them = missing.length === 1 ? "it" : "them";
				problems.push(
					`--modules: ${module} requires ${missing.join(", ")}; add ${them} to --modules`,
				);
			}
		} else stored = outcome.stored;
	}

	if (problems.length) throw new UsageError(problems.join("\n"));
	return { org, slug, ownerEmail, ownerName, modules: stored as CreateOptions["modules"] };
}
