import { readFileSync } from "node:fs";
import { relative } from "node:path";

import type { Plugin } from "vite-plus";

import { contributionFolders } from "./extensions.ts";
import { generateModules } from "./generate.ts";

/** The folders of a module's whose files all are inputs: its routes, skeletons, messages, contributions. */
const folders = ["routes", "skeletons", "messages", ...contributionFolders].join("|");

/** The files whose coming and going changes what the generator writes. */
const inputs = new RegExp(
	String.raw`^src\/modules(?:\/[^/]+(?:\/(?:module\.ts|api(?:\/extensions\.ts)?|server(?:\/(?:index|schema|seed)\.ts)?|(?:${folders})(?:\/.*)?))?)?$`,
);

/** The files that declare extension points, whose ids and names the generator reads. */
const pointFiles = /^src\/(?:lib\/[^/]+|modules\/[^/]+\/api)\/extensions\.ts$/;

/** The files that may tag enum arrays with `@labels` (see `labels.ts`). */
const labelFiles = /^src\/(?:lib|modules)\/(?!.*\/tests\/).*(?<!\.gen)\.ts$/;

/**
 * Whether a watcher event on `path` (relative to the root, with `/`) makes the generator rerun:
 * every event on its inputs, but `change` only on a module's `module.ts` (its `requires`,
 * `enhances` and `alwaysOn` are read from it), on route scripts (a change may add or drop a page
 * option or an export), on the files that declare extension points, and on those that tag enum
 * arrays with `@labels` (`read` gives a file's text).
 */
export function rerunsOn(event: string, path: string, read: (path: string) => string = () => "") {
	if (pointFiles.test(path)) return true;
	if (labelFiles.test(path) && read(path).includes("@labels")) return true;
	if (!inputs.test(path)) return false;
	if (event !== "change") return true;
	return /^src\/modules\/[^/]+\/module\.ts$/.test(path) || /\/routes\/.*\+[^/]*\.[jt]s$/.test(path);
}

/** Reruns the generator in dev when a module's files come, go or (for some) change. */
export function modulesPlugin(root: string): Plugin {
	return {
		name: "modules",
		configureServer({ watcher, config }) {
			let timer: ReturnType<typeof setTimeout> | undefined;
			const regenerate = () => {
				clearTimeout(timer);
				timer = setTimeout(() => {
					try {
						generateModules(root);
					} catch (error) {
						config.logger.error((error as Error).message);
					}
				}, 50);
			};
			const watch = (event: string) => (file: string) => {
				const path = relative(root, file).replaceAll("\\", "/");
				const read = () => {
					try {
						return readFileSync(file, "utf8");
					} catch {
						return "";
					}
				};
				if (rerunsOn(event, path, read)) regenerate();
			};
			for (const event of ["add", "addDir", "unlink", "unlinkDir", "change"]) {
				watcher.on(event, watch(event));
			}
		},
	};
}
