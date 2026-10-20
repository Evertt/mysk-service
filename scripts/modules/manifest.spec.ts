import { expect, test } from "vite-plus/test";

import { readManifest } from "./manifest.ts";

test("reads literal lists and the flag", () => {
	const source = `export default defineModule({ id: "b", requires: ["a"], enhances: ["c", "d"], alwaysOn: true });`;
	expect(readManifest(source)).toEqual({
		declaredId: "b",
		declaresPortal: false,
		declaredPages: [],
		requires: ["a"],
		enhances: ["c", "d"],
		alwaysOn: true,
		navAfter: null,
		problems: [],
	});
});

test("defaults to no dependencies", () => {
	expect(readManifest(`defineModule({ id: "a" })`)).toMatchObject({
		requires: [],
		enhances: [],
		alwaysOn: false,
		navAfter: null,
		problems: [],
	});
});

test("reads multi-line lists with a trailing comma", () => {
	const source = `defineModule({\n\tid: "a",\n\trequires: [\n\t\t"b",\n\t\t'c',\n\t],\n})`;
	expect(readManifest(source).requires).toEqual(["b", "c"]);
});

test("refuses what isn't a literal", () => {
	expect(readManifest(`defineModule({ id: "a", requires: deps })`).problems).toEqual([
		"requires must be a list of string literals",
	]);
	expect(readManifest(`defineModule({ id: "a", enhances: [dep] })`).problems).toEqual([
		"enhances must be a list of string literals",
	]);
	expect(readManifest(`defineModule({ id: "a", alwaysOn: false })`).problems).toEqual([
		"alwaysOn must be true or left out",
	]);
});

test("reads where the sidebar entry goes", () => {
	expect(readManifest(`defineModule({ id: "a", nav: { after: "orders" } })`)).toMatchObject({
		navAfter: "orders",
		problems: [],
	});
	expect(readManifest(`defineModule({\n\tid: "a",\n\tnav: { after: 'b', },\n})`).navAfter).toBe(
		"b",
	);
});

test("refuses a nav that isn't a literal", () => {
	expect(readManifest(`defineModule({ id: "a", nav: placement })`)).toMatchObject({
		navAfter: null,
		problems: ['nav must be { after: "<id>" } with a string literal'],
	});
	expect(readManifest(`defineModule({ id: "a", nav: { after: where } })`).problems).toEqual([
		'nav must be { after: "<id>" } with a string literal',
	]);
});

test("reads the id, the portal entry and keys that name pages, at the call's top level", () => {
	const source = `export default defineModule({\n\tid: \`a\`,\n\tportal: { label, icon },\n\tsettings: x,\n\tsubjects: { route: y },\n});`;
	expect(readManifest(source)).toMatchObject({
		declaredId: "a",
		declaresPortal: true,
		declaredPages: ["settings"],
	});
});

test("reports a manifest it can't parse", () => {
	expect(readManifest(`defineModule({ id: "a",, })`).problems).toHaveLength(1);
});
