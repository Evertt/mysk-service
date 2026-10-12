import { relative } from "node:path";

import type { Plugin } from "vite-plus";

import { generateModules } from "./generate.ts";

/** The files whose coming and going changes what the generator writes. */
const inputs =
	/^src\/modules(?:\/[^/]+(?:\/(?:module\.ts|routes(?:\/.*)?|slots(?:\/.*)?|skeletons(?:\/.*)?|bulk-actions(?:\/.*)?|columns(?:\/.*)?|api(?:\/extensions\.ts)?|server(?:\/(?:index\.ts|schema\.ts|seed\.ts|columns(?:\/.*)?))?|messages(?:\/.*)?))?)?$/;

/** The files that declare extension points, whose ids and names the generator reads. */
const pointFiles = /^src\/(?:lib\/[^/]+|modules\/[^/]+\/api)\/extensions\.ts$/;

/**
 * Whether a watcher event on `path` (relative to the root, with `/`) makes the generator rerun:
 * every event on its inputs, but `change` only on a module's `module.ts` (its `requires`,
 * `enhances` and `alwaysOn` are read from it), on route scripts (a change may add or drop a page
 * option or an export) and on the files that declare extension points.
 */
export function rerunsOn(event: string, path: string) {
	if (pointFiles.test(path)) return true;
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
				if (rerunsOn(event, path)) regenerate();
			};
			for (const event of ["add", "addDir", "unlink", "unlinkDir", "change"]) {
				watcher.on(event, watch(event));
			}
		},
	};
}
