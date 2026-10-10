import { expect, test } from "vite-plus/test";

import { readManifestGraph } from "./manifest.ts";

test("reads literal lists and the flag", () => {
	const source = `export default defineModule({ id: "b", requires: ["a"], enhances: ["c", "d"], alwaysOn: true });`;
	expect(readManifestGraph(source)).toEqual({
		requires: ["a"],
		enhances: ["c", "d"],
		alwaysOn: true,
		problems: [],
	});
});

test("defaults to no dependencies", () => {
	expect(readManifestGraph(`defineModule({ id: "a" })`)).toEqual({
		requires: [],
		enhances: [],
		alwaysOn: false,
		problems: [],
	});
});

test("reads multi-line lists with a trailing comma", () => {
	const source = `defineModule({\n\tid: "a",\n\trequires: [\n\t\t"b",\n\t\t'c',\n\t],\n})`;
	expect(readManifestGraph(source).requires).toEqual(["b", "c"]);
});

test("refuses what isn't a literal", () => {
	expect(readManifestGraph(`defineModule({ id: "a", requires: deps })`).problems).toEqual([
		"requires must be a list of string literals",
	]);
	expect(readManifestGraph(`defineModule({ id: "a", enhances: [dep] })`).problems).toEqual([
		"enhances must be a list of string literals",
	]);
	expect(readManifestGraph(`defineModule({ id: "a", alwaysOn: false })`).problems).toEqual([
		"alwaysOn must be true or left out",
	]);
});
