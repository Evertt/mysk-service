import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";

import { generateModules } from "./generate.ts";
import { repoSettings } from "./test-helpers.ts";

// --- On a project on disk ---------------------------------------------------------------------

describe("generateModules", () => {
	let root: string;
	const put = (path: string, content = "") => {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), content);
	};
	const read = (path: string) => readFileSync(join(root, path), "utf8");
	const has = (path: string) => existsSync(join(root, path));

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "modules-spec-"));
		put("project.inlang/settings.json", repoSettings);
		put("src/routes/(app)/orders/+page.svelte");
		put("src/routes/login/+page.svelte");
		put("src/routes/+layout.svelte");

		put("src/modules/sample/module.ts", `export default { id: "sample" };`);
		put("src/modules/sample/routes/(app)/sample/+page.svelte");
		put("src/modules/sample/routes/(app)/sample/+layout.svelte");
		put("src/modules/sample/routes/(app)/sample/+error.svelte");
		put("src/modules/sample/routes/(app)/sample/[id]/+page.svelte");
		put(
			"src/modules/sample/routes/(app)/sample/[id]/+page.ts",
			`export const ssr = false;\nexport const load = () => ({});`,
		);
		put(
			"src/modules/sample/routes/(app)/sample/[id]/pdf/+server.ts",
			`export const GET = () => new Response();`,
		);
		put("src/modules/sample/routes/(app)/sample/sample.remote.ts", `export const x = 1;`);
		put("src/modules/sample/server/index.ts");
		put("src/modules/sample/server/schema.ts");
		put("src/modules/sample/messages/en/sample.json", "{}");
		put("src/modules/sample/messages/nl/sample.json", "{}");
	});
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	test("writes the registries, the stubs, the guard and the message list", () => {
		const { modules, changed } = generateModules(root);
		expect(modules).toEqual(["sample"]);
		expect(changed.length).toBeGreaterThan(10);

		expect(read("src/lib/modules/manifests.gen.ts")).toContain(
			`import sampleModule from "#modules/sample/module.ts";`,
		);
		expect(read("src/lib/server/db/modules.gen.ts")).toContain("sample/server/schema.ts");
		expect(read("src/lib/server/db/module-seeds.gen.ts")).toContain("= [];");
		expect(
			JSON.parse(read("project.inlang/settings.json"))[
				"plugin.inlang.messageFormat"
			].pathPattern.at(-1),
		).toBe("./src/modules/sample/messages/{locale}/sample.json");

		// In the (modules) group inside the module's groups, beside the core's route folders.
		const group = "src/routes/(app)/(modules)";
		const folder = `${group}/sample`;
		expect(has("src/routes/(app)/sample")).toBe(false);
		expect(read(`${folder}/[id]/+page.svelte`)).toContain(
			`import Route from "#modules/sample/routes/(app)/sample/[id]/+page.svelte";`,
		);
		expect(read(`${folder}/+layout.svelte`)).toContain("LayoutProps");
		expect(read(`${folder}/+error.svelte`)).toContain("<Route />");
		expect(read(`${folder}/[id]/+page.ts`)).toContain("export const ssr = false;");
		expect(read(`${folder}/[id]/+page.ts`)).toContain("export const load = moduleLoad;");
		expect(read(`${folder}/[id]/pdf/+server.ts`)).toContain(
			`export const GET = guarded<RequestEvent, ReturnType<typeof moduleGET>>("sample", moduleGET);`,
		);
		// One guard for the group, which knows each route folder's module.
		expect(read(`${group}/+layout.server.ts`)).toContain(
			`const owners = {\n\t"/(app)/(modules)/sample": "sample",\n} as const;`,
		);
		expect(has(`${folder}/+layout.server.ts`)).toBe(false);
		// Only `+` files get a stub.
		expect(has(`${folder}/sample.remote.ts`)).toBe(false);
	});

	test("guards the module's own server files, beside the group's guard", () => {
		put(
			"src/modules/sample/routes/(app)/sample/+layout.server.ts",
			`export const load = () => ({ a: 1 });`,
		);
		generateModules(root);
		expect(read("src/routes/(app)/(modules)/sample/+layout.server.ts")).toContain(
			`export const load = guarded<LayoutServerLoadEvent, ReturnType<typeof moduleLoad>>("sample", moduleLoad);`,
		);
		expect(read("src/routes/(app)/(modules)/+layout.server.ts")).toContain("guardModuleRoute(");
	});

	test("puts the routes of every module in a group in one (modules) folder, and others apart", () => {
		put("src/modules/other/module.ts", `export default { id: "other" };`);
		put("src/modules/other/routes/(app)/other/+page.svelte");
		put("src/modules/other/routes/reports/+page.svelte");
		generateModules(root);
		expect(read("src/routes/(app)/(modules)/+layout.server.ts")).toContain(
			`\t"/(app)/(modules)/other": "other",\n\t"/(app)/(modules)/sample": "sample",\n`,
		);
		expect(has("src/routes/(app)/(modules)/other/+page.svelte")).toBe(true);
		expect(read("src/routes/(modules)/+layout.server.ts")).toContain(
			`\t"/(modules)/reports": "other",\n`,
		);
		expect(has("src/routes/(modules)/reports/+page.svelte")).toBe(true);
	});

	test("removes the stubs that earlier versions wrote beside the core's routes", () => {
		const old = "src/routes/(app)/sample";
		put(
			`${old}/.gitignore`,
			"# Generated by scripts/modules.ts, and deleted by it. Don't edit.\n*\n",
		);
		put(`${old}/+page.svelte`, "<!-- Generated by scripts/modules.ts from x. Don't edit. -->\n");
		put(`${old}/[id]/pdf/+server.ts`, "// Generated by scripts/modules.ts from y. Don't edit.\n");
		put("src/routes/(app)/stale/.gitignore", "# Generated by scripts/modules.ts. Don't edit.\n*\n");
		put("src/routes/(app)/stale/+page.svelte", "<!-- Generated by scripts/modules.ts. -->\n");
		put("src/routes/(app)/stale/notes.md", "mine");

		const { changed } = generateModules(root);
		expect(has(old)).toBe(false);
		expect(changed).toContain(`${old}/[id]/pdf/+server.ts`);
		expect(has("src/routes/(app)/(modules)/sample/+page.svelte")).toBe(true);
		// What the generator didn't write stays.
		expect(has("src/routes/(app)/stale/+page.svelte")).toBe(false);
		expect(has("src/routes/(app)/stale/.gitignore")).toBe(false);
		expect(read("src/routes/(app)/stale/notes.md")).toBe("mine");
	});

	test("refuses a (modules) folder with files it didn't write, and leaves them", () => {
		put("src/routes/(app)/(modules)/reports/+page.svelte", "core");
		put("src/routes/(app)/orders/(modules)/x/+page.ts", "export const ssr = false;");
		put("src/routes/(app)/(modules)/.DS_Store", "");
		expect(() => generateModules(root)).toThrow(
			/src\/routes\/\(app\)\/\(modules\)\/reports\/\+page\.svelte wasn't written by scripts\/modules\.ts[\s\S]*src\/routes\/\(app\)\/orders\/\(modules\)\/x\/\+page\.ts wasn't/,
		);
		expect(read("src/routes/(app)/(modules)/reports/+page.svelte")).toBe("core");
	});

	test("removes a (modules) folder it no longer needs, wherever it is", () => {
		put("src/routes/(app)/orders/(modules)/x/+page.ts", "// Generated by scripts/modules.ts.\n");
		generateModules(root);
		expect(has("src/routes/(app)/orders/(modules)")).toBe(false);
		expect(has("src/routes/(app)/orders/+page.svelte")).toBe(true);
	});

	test("refuses module routes in a (modules) group of their own", () => {
		put("src/modules/sample/routes/(app)/(modules)/x/+page.svelte");
		expect(() => generateModules(root)).toThrow(/\(modules\) is the group the generator links/);
	});

	test("writes nothing the second time, and nothing but the registries without modules", () => {
		generateModules(root);
		expect(generateModules(root).changed).toEqual([]);
		rmSync(join(root, "src/modules"), { recursive: true });
		const { modules, changed } = generateModules(root);
		expect(modules).toEqual([]);
		expect(changed).toContain("src/lib/modules/manifests.gen.ts");
		expect(changed).toContain("project.inlang/settings.json");
	});

	test("removes the stubs of a module that is gone, and only its own", () => {
		generateModules(root);
		expect(has("src/routes/(app)/(modules)/sample/+page.svelte")).toBe(true);
		rmSync(join(root, "src/modules/sample"), { recursive: true });
		generateModules(root);
		expect(has("src/routes/(app)/(modules)")).toBe(false);
		expect(has("src/routes/(app)/orders/+page.svelte")).toBe(true);
		expect(has("src/routes/login/+page.svelte")).toBe(true);
		expect(read("project.inlang/settings.json")).toBe(repoSettings);
		expect(read("src/lib/modules/manifests.gen.ts")).toContain("[] as const");
	});

	test("removes the stubs of a route file that is gone", () => {
		generateModules(root);
		rmSync(join(root, "src/modules/sample/routes/(app)/sample/[id]"), { recursive: true });
		generateModules(root);
		expect(has("src/routes/(app)/(modules)/sample/[id]")).toBe(false);
		expect(has("src/routes/(app)/(modules)/sample/+page.svelte")).toBe(true);
	});

	test("picks up a page option that was added", () => {
		generateModules(root);
		put("src/modules/sample/routes/(app)/sample/[id]/+page.ts", `export const prerender = true;`);
		expect(generateModules(root).changed).toEqual([
			"src/routes/(app)/(modules)/sample/[id]/+page.ts",
		]);
		expect(read("src/routes/(app)/(modules)/sample/[id]/+page.ts")).toContain(
			"export const prerender = true;",
		);
	});

	test("leaves a core route folder of the same name alone, and says so", () => {
		put("src/routes/(app)/sample/+page.svelte", "core");
		expect(() => generateModules(root)).toThrow(/collides with the core's \/sample route/);
		expect(read("src/routes/(app)/sample/+page.svelte")).toBe("core");
		expect(has("src/routes/(app)/(modules)")).toBe(false);
	});

	test("lists every problem at once", () => {
		put("src/modules/stray/notes.txt", "no module.ts here");
		put("src/modules/Bad-Name/module.ts", "");
		put("src/modules/sample/messages/nl/extra.json", "{}");
		expect(() => generateModules(root)).toThrow(
			/Bad-Name[\s\S]*stray has no module\.ts[\s\S]*extra\.json is missing/,
		);
	});

	test("ignores an empty folder", () => {
		mkdirSync(join(root, "src/modules/empty"), { recursive: true });
		expect(generateModules(root).modules).toEqual(["sample"]);
	});
});
