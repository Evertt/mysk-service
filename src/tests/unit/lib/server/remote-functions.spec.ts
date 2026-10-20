/**
 * Every remote function is gated (see `remote-functions.ts`):
 *
 * - the gated sets run their gate before the handler, and a refusal means the handler never runs;
 * - nothing but `remote-functions.ts` imports `query`, `form`, `command` or `prerender` from
 *   `$app/server`, so there's no other way to make a remote function;
 * - each module's `remote-functions.ts` makes its set with its own id, nothing else in the module
 *   makes remote functions with any other set, and its `module.ts` doesn't import the set.
 *
 * The checks of the project's files also run on made-up files, to show they find what they should.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, posix, relative } from "node:path";

import { error, isHttpError } from "@sveltejs/kit";
import { beforeEach, describe, expect, test, vi } from "vite-plus/test";

import {
	requireCustomer,
	requireEngineer,
	requireManager,
	requireModule,
} from "#lib/server/auth/index.ts";
import { forAnyone, forCustomers, moduleRemote, remoteSet } from "#lib/server/remote-functions.ts";

/** SvelteKit's functions, as stand-ins that hand back what they were made with. */
vi.mock("$app/server", () => {
	const make =
		(type: string) =>
		(...args: unknown[]) => ({ type, args });
	return {
		query: Object.assign(make("query"), { batch: make("query_batch"), live: make("query_live") }),
		form: make("form"),
		command: make("command"),
	};
});

vi.mock("#lib/server/auth/index.ts", () => ({
	requireMember: vi.fn(),
	requireManager: vi.fn(),
	requireEngineer: vi.fn(),
	requireCustomer: vi.fn(),
	requireTenant: vi.fn(),
	requireUser: vi.fn(),
	requireModule: vi.fn(),
}));

/** What a stand-in was made with. */
interface Made {
	type: string;
	args: unknown[];
}

/** The handler SvelteKit would call: the last argument, as the set passed it on. */
const handlerOf = (made: unknown) => (made as Made).args.at(-1) as (...args: unknown[]) => unknown;

/** The status of the HTTP error that `run` throws or rejects with. */
async function statusOf(run: () => unknown) {
	try {
		await run();
	} catch (thrown) {
		if (isHttpError(thrown)) return thrown.status;
		throw thrown;
	}
	throw new Error("Expected an HTTP error");
}

describe("a gated set", () => {
	const calls: string[] = [];
	const admit = () => void calls.push("gate");
	const refuse = () => {
		calls.push("gate");
		error(403, "No");
	};
	const handler = (...args: unknown[]) => {
		calls.push("handler");
		return args;
	};

	beforeEach(() => {
		calls.length = 0;
	});

	test("passes the schema on and wraps the handler, the last argument, of every kind", () => {
		const set = remoteSet(admit);
		const schema = { "~standard": {} };
		const made = [
			set.query(schema as never, handler as never),
			set.query.batch(schema as never, handler as never),
			set.query.live(schema as never, handler as never),
			set.form(schema as never, handler as never),
			set.command("unchecked", handler as never),
			set.query(handler as never),
		] as unknown as Made[];
		expect(made.map((m) => m.type)).toEqual([
			"query",
			"query_batch",
			"query_live",
			"form",
			"command",
			"query",
		]);
		expect(made.map((m) => m.args.length)).toEqual([2, 2, 2, 2, 2, 1]);
		expect(made[0].args[0]).toBe(schema);
		expect(made[4].args[0]).toBe("unchecked");
		for (const m of made) expect(m.args.at(-1)).not.toBe(handler);
	});

	test("runs the gate before the handler, on every call, with the handler's arguments", () => {
		const made = remoteSet(admit).form({} as never, handler as never);
		expect(calls).toEqual([]);
		expect(handlerOf(made)("data", "issue")).toEqual(["data", "issue"]);
		expect(handlerOf(made)("again")).toEqual(["again"]);
		expect(calls).toEqual(["gate", "handler", "gate", "handler"]);
	});

	test("never runs the handler when the gate refuses", async () => {
		const set = remoteSet(refuse);
		for (const made of [
			set.query(handler as never),
			set.query.batch("unchecked", handler as never),
			set.query.live(handler as never),
			set.form(handler as never),
			set.command(handler as never),
		]) {
			expect(await statusOf(() => handlerOf(made)("arg"))).toBe(403);
		}
		expect(calls).toEqual(["gate", "gate", "gate", "gate", "gate"]);
	});

	test("waits for a gate that answers later, and stops at its refusal", async () => {
		const admitted = remoteSet(async () => void calls.push("gate"));
		expect(await handlerOf(admitted.query(handler as never))("arg")).toEqual(["arg"]);
		const refused = remoteSet(async () => refuse());
		expect(await statusOf(() => handlerOf(refused.command(handler as never))())).toBe(403);
		expect(calls).toEqual(["gate", "handler", "gate"]);
	});

	test("keeps the handler synchronous behind a gate that answers right away", () => {
		const made = remoteSet(admit).query(() => "now");
		expect(handlerOf(made)()).toBe("now");
	});

	test("forAnyone admits everyone", () => {
		expect(handlerOf(forAnyone.query(handler as never))("arg")).toEqual(["arg"]);
	});
});

describe("moduleRemote", () => {
	beforeEach(() => {
		vi.mocked(requireModule).mockReset();
		vi.mocked(requireManager).mockReset();
	});

	test("refuses a tenant without the module, before the handler", async () => {
		vi.mocked(requireModule).mockImplementation(() => error(404, "Not found"));
		const handler = vi.fn();
		const made = moduleRemote("invoices").query(handler);
		expect(await statusOf(() => handlerOf(made)())).toBe(404);
		expect(requireModule).toHaveBeenCalledWith("invoices");
		expect(handler).not.toHaveBeenCalled();
	});

	test("asks for a manager only in the manager set", async () => {
		const handler = vi.fn(() => "done");
		expect(handlerOf(moduleRemote("invoices").form(handler))()).toBe("done");
		expect(requireManager).not.toHaveBeenCalled();

		vi.mocked(requireManager).mockImplementation(() => error(403, "No"));
		const made = moduleRemote("invoices", "manager").form(handler);
		expect(await statusOf(() => handlerOf(made)())).toBe(403);
		expect(requireModule).toHaveBeenCalledTimes(2);
		expect(handler).toHaveBeenCalledTimes(1);
	});

	test("the engineer set lets any role through the module's gate, then asks for an engineer", async () => {
		vi.mocked(requireEngineer).mockReset();
		const handler = vi.fn(() => "done");
		vi.mocked(requireEngineer).mockResolvedValue({} as never);
		expect(await handlerOf(moduleRemote("materials", "engineer").form(handler))()).toBe("done");
		expect(requireModule).toHaveBeenCalledWith("materials", { anyRole: true });

		vi.mocked(requireEngineer).mockImplementation(() => error(403, "No"));
		const made = moduleRemote("materials", "engineer").query(handler);
		expect(await statusOf(() => handlerOf(made)())).toBe(403);
		expect(handler).toHaveBeenCalledTimes(1);
	});

	test("the customer set lets any role through the module's gate, then asks for a customer's contact", async () => {
		vi.mocked(requireCustomer).mockReset();
		const handler = vi.fn(() => "done");
		vi.mocked(requireCustomer).mockResolvedValue({} as never);
		expect(await handlerOf(moduleRemote("checklists", "customer").query(handler))()).toBe("done");
		expect(requireModule).toHaveBeenCalledWith("checklists", { anyRole: true });

		vi.mocked(requireCustomer).mockImplementation(() => error(403, "No"));
		const made = moduleRemote("checklists", "customer").query(handler);
		expect(await statusOf(() => handlerOf(made)())).toBe(403);
		expect(handler).toHaveBeenCalledTimes(1);
	});
});

describe("forCustomers", () => {
	test("asks for a customer's contact before the handler, and refuses everyone else", async () => {
		vi.mocked(requireCustomer).mockReset();
		const handler = vi.fn(() => "done");
		vi.mocked(requireCustomer).mockResolvedValue({} as never);
		expect(await handlerOf(forCustomers.query(handler))()).toBe("done");
		expect(requireCustomer).toHaveBeenCalledTimes(1);

		vi.mocked(requireCustomer).mockImplementation(() => error(403, "No"));
		const made = forCustomers.form(handler);
		expect(await statusOf(() => handlerOf(made)())).toBe(403);
		expect(handler).toHaveBeenCalledTimes(1);
	});
});

// --- The project's files ---------------------------------------------------------------------

interface SourceFile {
	/** Relative to the project root, with `/`. */
	path: string;
	source: string;
}

/** The file that makes the gated sets: the only one that may use SvelteKit's own functions. */
const SETS = "src/lib/server/remote-functions.ts";
const makers = new Set(["query", "form", "command", "prerender"]);

/** A file's code without its comments. */
const withoutComments = (source: string) =>
	source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** The import declarations of a file: their specifier and the names they bring in as values. */
function importsOf(source: string) {
	const code = withoutComments(source);
	const found: { specifier: string; values: string[]; namespace: boolean }[] = [];
	const declaration =
		/\b(?:import|export)\s+(type\s+)?([^"'`;]*?)\s+from\s+["']([^"']+)["']|\bimport\s+["']([^"']+)["']/g;
	for (const [, type, clause = "", specifier, bare] of code.matchAll(declaration)) {
		if (bare) {
			found.push({ specifier: bare, values: [], namespace: false });
			continue;
		}
		const named = /\{([^}]*)\}/.exec(clause)?.[1] ?? "";
		const values = type
			? []
			: named
					.split(",")
					.map((name) => name.trim())
					.filter((name) => name && !name.startsWith("type "))
					.map((name) => name.split(/\s+as\s+/)[0]);
		found.push({ specifier, values, namespace: !type && /\*\s+as\s+/.test(clause) });
	}
	return found;
}

/** Where `specifier` in the file at `path` points, from the project root if it's in the project. */
function resolve(specifier: string, path: string) {
	if (specifier.startsWith(".")) return posix.join(posix.dirname(path), specifier);
	return specifier.replace(/^#modules\//, "src/modules/");
}

/** Files other than `SETS` that take `query`, `form`, `command` or `prerender` from `$app/server`. */
export function ungatedImports(files: SourceFile[]): string[] {
	return files.flatMap((file) =>
		file.path === SETS
			? []
			: importsOf(file.source).flatMap(({ specifier, values, namespace }) => {
					if (specifier !== "$app/server") return [];
					const taken = values.filter((name) => makers.has(name));
					if (namespace) taken.push("*");
					return taken.length ? [`${file.path} imports ${taken.join(", ")} from $app/server`] : [];
				}),
	);
}

/** The module (`src/modules/<id>`) a file is in. */
const moduleOf = (path: string) => /^src\/modules\/([^/]+)\//.exec(path)?.[1];

/** The `remote-functions.ts` of a module. */
const moduleSets = (id: string) => `src/modules/${id}/remote-functions.ts`;

/**
 * The core's factories that make a module's remote functions for it, with the id the module
 * passes (`defineTenantSettings("condition", …)`): a set of the module's own all the same.
 */
const KITS = ["src/lib/server/modules/settings.ts"];

/**
 * `moduleRemote()` called with another id than the module's own, or anywhere but a module's
 * `remote-functions.ts` (and the core's factories, with the id they're given, never a literal).
 */
export function misnamedModuleSets(files: SourceFile[]): string[] {
	return files.flatMap((file) => {
		if (file.path === SETS || file.path.endsWith(".spec.ts")) return [];
		if (KITS.includes(file.path)) {
			return /\bmoduleRemote\(\s*["'`]/.test(withoutComments(file.source))
				? [`${file.path} uses moduleRemote() with a literal id`]
				: [];
		}
		const own = moduleOf(file.path);
		const code = withoutComments(file.source);
		const ids = [...code.matchAll(/\bmoduleRemote\(\s*["']([^"']*)["']/g)].map(([, id]) => id);
		if (own && file.path === moduleSets(own)) {
			if (!ids.length) return [`${file.path} doesn't make a set with moduleRemote("${own}")`];
			return ids.filter((id) => id !== own).map((id) => `${file.path} uses moduleRemote("${id}")`);
		}
		return /\bmoduleRemote\(/.test(code)
			? [`${file.path} uses moduleRemote() outside a module's remote-functions.ts`]
			: [];
	});
}

/**
 * Files in a module that take a set from anywhere but their module's `remote-functions.ts`: the
 * core's (`#lib/server/remote-functions.ts`) or another module's. And a `module.ts` that imports
 * its module's (server code, which the manifest must not pull into every bundle).
 */
export function foreignSets(files: SourceFile[]): string[] {
	return files.flatMap((file) => {
		const own = moduleOf(file.path);
		if (!own) return [];
		return importsOf(file.source).flatMap(({ specifier }) => {
			const target = resolve(specifier, file.path);
			if (!/(?:^|\/)remote-functions\.ts$/.test(target)) return [];
			if (file.path === moduleSets(own)) {
				return target === "#lib/server/remote-functions.ts"
					? []
					: [`${file.path} imports ${specifier}`];
			}
			if (target !== moduleSets(own)) return [`${file.path} imports ${specifier}`];
			return file.path === `src/modules/${own}/module.ts`
				? [`${file.path} imports ${specifier}, which is server code`]
				: [];
		});
	});
}

describe("the checks", () => {
	const files: SourceFile[] = [
		{ path: SETS, source: `import { command, form, query } from "$app/server";` },
		{
			path: "src/routes/a/a.remote.ts",
			source: `import { form, getRequestEvent, type RemoteForm } from "$app/server";\nimport type { query } from "$app/server";`,
		},
		{
			path: "src/routes/b/b.remote.ts",
			source: `import {\n\tquery as q,\n\tcommand,\n} from "$app/server";\nimport * as kit from "$app/server";`,
		},
		{
			path: "src/lib/ok.ts",
			source: `// import { query } from "$app/server";\nimport { requested, getRequestEvent } from "$app/server";\nimport { forMembers } from "#lib/server/remote-functions.ts";`,
		},
		{
			path: "src/modules/a/remote-functions.ts",
			source: `import { moduleRemote } from "#lib/server/remote-functions.ts";\nexport const { query } = moduleRemote("a");\nexport const forManagers = moduleRemote("b", "manager");`,
		},
		{
			path: "src/modules/b/remote-functions.ts",
			source: `import { forMembers } from "#lib/server/remote-functions.ts";\nimport { x } from "../a/remote-functions.ts";`,
		},
		{
			path: "src/modules/a/routes/(app)/a/a.remote.ts",
			source: `import { query } from "../../../remote-functions.ts";\nimport { forMembers } from "#lib/server/remote-functions.ts";\nimport { b } from "#modules/b/remote-functions.ts";\nimport { c } from "#modules/a/remote-functions.ts";`,
		},
		{
			path: "src/modules/a/module.ts",
			source: `import { query } from "./remote-functions.ts";`,
		},
		{ path: "src/lib/sneaky.ts", source: `export const s = moduleRemote("a");` },
		{ path: KITS[0], source: `const a = moduleRemote(moduleId);\nconst b = moduleRemote("a");` },
	];

	test("find SvelteKit's remote functions taken from $app/server outside the gated sets", () => {
		expect(ungatedImports(files)).toEqual([
			"src/routes/a/a.remote.ts imports form from $app/server",
			"src/routes/b/b.remote.ts imports query, command from $app/server",
			"src/routes/b/b.remote.ts imports * from $app/server",
		]);
	});

	test("find a module's set made with another id, or made outside its remote-functions.ts", () => {
		expect(misnamedModuleSets(files)).toEqual([
			`src/modules/a/remote-functions.ts uses moduleRemote("b")`,
			`src/modules/b/remote-functions.ts doesn't make a set with moduleRemote("b")`,
			"src/lib/sneaky.ts uses moduleRemote() outside a module's remote-functions.ts",
			`${KITS[0]} uses moduleRemote() with a literal id`,
		]);
	});

	test("find a module using the core's sets or another module's, and a manifest importing its own", () => {
		expect(foreignSets(files)).toEqual([
			"src/modules/b/remote-functions.ts imports ../a/remote-functions.ts",
			"src/modules/a/routes/(app)/a/a.remote.ts imports #lib/server/remote-functions.ts",
			"src/modules/a/routes/(app)/a/a.remote.ts imports #modules/b/remote-functions.ts",
			"src/modules/a/module.ts imports ./remote-functions.ts, which is server code",
		]);
	});
});

/** The source files of the project that are checked in, leaving out what's generated or installed. */
function sourceFiles(): SourceFile[] {
	const root = join(import.meta.dirname, "../../../../..");
	const skip = /(?:^|\/)(?:node_modules|\.svelte-kit|paraglide|build)(?:\/|$)/;
	const files: SourceFile[] = [];
	for (const folder of ["src", "scripts"]) {
		if (!existsSync(join(root, folder))) continue;
		for (const entry of readdirSync(join(root, folder), { recursive: true, withFileTypes: true })) {
			if (!entry.isFile() || !/\.(?:ts|js|svelte)$/.test(entry.name)) continue;
			const path = relative(root, join(entry.parentPath, entry.name)).replaceAll("\\", "/");
			if (skip.test(path) || path.endsWith(".gen.ts")) continue;
			files.push({ path, source: readFileSync(join(root, path), "utf8") });
		}
	}
	return files;
}

describe("the project", () => {
	// Leaving out this file, whose made-up files are in strings.
	const files = sourceFiles().filter(
		(file) => file.path !== "src/tests/unit/lib/server/remote-functions.spec.ts",
	);

	test("makes remote functions only through the gated sets", () => {
		expect(ungatedImports(files)).toEqual([]);
	});

	test("gives each module a set of its own, by its id", () => {
		expect(misnamedModuleSets(files)).toEqual([]);
	});

	test("makes a module's remote functions only with its own set", () => {
		expect(foreignSets(files)).toEqual([]);
	});
});
