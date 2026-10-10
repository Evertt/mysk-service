import { describe, expect, test } from "vite-plus/test";

import {
	modulesGroupOf,
	routeExports,
	routeFileKind,
	routePlace,
	serverFileKind,
} from "./routes.ts";

describe("routeFileKind", () => {
	test.each([
		["+page.svelte", "page"],
		["+page@(app).svelte", "page"],
		["+layout.svelte", "layout"],
		["+layout@.svelte", "layout"],
		["+error.svelte", "error"],
		["+page.ts", "script"],
		["+page.server.ts", "script"],
		["+layout.ts", "script"],
		["+layout.server.js", "script"],
		["+server.ts", "script"],
	])("%s is a %s", (name, kind) => {
		expect(routeFileKind(name)).toBe(kind);
	});

	test.each(["+foo.svelte", "+page.svelte.ts", "page.svelte", "+hooks.ts", "+page.server.svelte"])(
		"%s is not a route file",
		(name) => {
			expect(routeFileKind(name)).toBeUndefined();
		},
	);
});

describe("serverFileKind", () => {
	test.each([
		["+page.server.ts", "page"],
		["+layout.server.js", "layout"],
		["+server.ts", "endpoint"],
		["+page.ts", undefined],
		["+layout.ts", undefined],
		["+page.svelte", undefined],
	])("%s is %s", (name, kind) => {
		expect(serverFileKind(name)).toBe(kind);
	});
});

describe("routePlace", () => {
	test("is the first folder that isn't a group, the groups before it and the rest", () => {
		expect(routePlace("(app)/contracts/[number]/+page.svelte")).toEqual({
			groups: ["(app)"],
			folder: "contracts",
			rest: "[number]/+page.svelte",
		});
		expect(routePlace("(app)/(inner)/contracts/+layout.svelte")).toEqual({
			groups: ["(app)", "(inner)"],
			folder: "contracts",
			rest: "+layout.svelte",
		});
		expect(routePlace("reports/+page.ts")).toEqual({
			groups: [],
			folder: "reports",
			rest: "+page.ts",
		});
	});

	test("is nothing for a file that sits in a group or at the root", () => {
		expect(routePlace("(app)/+page.svelte")).toBeUndefined();
		expect(routePlace("+layout.svelte")).toBeUndefined();
	});
});

describe("modulesGroupOf", () => {
	test("is the (modules) group inside the route's groups, so it keeps their layouts", () => {
		expect(modulesGroupOf(routePlace("(app)/contracts/+page.svelte")!)).toBe("(app)/(modules)");
		expect(modulesGroupOf(routePlace("(app)/(inner)/x/+page.svelte")!)).toBe(
			"(app)/(inner)/(modules)",
		);
		expect(modulesGroupOf(routePlace("reports/+page.svelte")!)).toBe("(modules)");
	});
});

describe("routeExports", () => {
	test("lists the value exports, and the page options that are literals", () => {
		const source = `
			import type { PageLoad } from "./$types";
			export const prerender = true;
			export const trailingSlash = "always";
			export const ssr = ssrFlag;
			export const load: PageLoad = () => ({});
			export async function GET() {}
			const a = 1, b = 2;
			export { a, b as c };
			export type Thing = string;
			export interface Other {}
			export type { Other as Another };
		`;
		expect(routeExports("+page.ts", source)).toEqual({
			names: ["prerender", "trailingSlash", "ssr", "load", "GET", "a", "c"],
			literals: { prerender: "true", trailingSlash: '"always"' },
		});
	});

	test("refuses what a stub can't repeat", () => {
		expect(() => routeExports("+page.ts", `export * from "./other.ts";`)).toThrow(/export \* from/);
		expect(() => routeExports("+page.ts", `export default 1;`)).toThrow(/default export/);
		expect(() => routeExports("+page.ts", `export const { a } = x;`)).toThrow(/destructuring/);
		expect(() => routeExports("+page.ts", `export const = ;`)).toThrow(/\+page\.ts/);
	});
});
