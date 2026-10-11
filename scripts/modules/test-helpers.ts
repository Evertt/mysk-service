import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderPathPattern, replacePathPattern } from "./messages.ts";
import type { ModuleFolder } from "./shared.ts";

/** The project's settings without the modules' entries, which come and go with `src/modules`. */
export const repoSettings = (() => {
	const text = readFileSync(
		join(import.meta.dirname, "../../project.inlang/settings.json"),
		"utf8",
	);
	const patterns: string[] = JSON.parse(text)["plugin.inlang.messageFormat"].pathPattern;
	return replacePathPattern(text, renderPathPattern(patterns, []));
})();

/** A module folder as the generator finds it, with just the parts a test names. */
export function module(
	id: string,
	parts: Partial<ModuleFolder> & { sections?: string[] } = {},
): ModuleFolder {
	const { sections = [], ...rest } = parts;
	return {
		id,
		requires: [],
		enhances: [],
		alwaysOn: false,
		navAfter: null,
		routeFiles: [],
		slotFiles: [],
		bulkFiles: [],
		columnFiles: [],
		serverColumnFiles: [],
		formPartFiles: [],
		server: { index: false, schema: false, seed: false },
		messages: { en: sections, nl: sections },
		...rest,
	};
}
