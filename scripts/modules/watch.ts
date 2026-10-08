import { relative } from "node:path";

import type { Plugin } from "vite-plus";

import { generateModules } from "./generate.ts";

/** The files whose coming and going changes what the generator writes. */
const inputs =
	/^src\/modules(?:\/[^/]+(?:\/(?:module\.ts|routes(?:\/.*)?|server(?:\/(?:index|schema|seed)\.ts)?|messages(?:\/.*)?))?)?$/;

/** Reruns the generator in dev when a module's files come, go or (for route scripts) change. */
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
				if (!inputs.test(path)) return;
				// A change in a route script may add or drop a page option or an export.
				if (event === "change" && !/\/routes\/.*\+[^/]*\.[jt]s$/.test(path)) return;
				regenerate();
			};
			for (const event of ["add", "addDir", "unlink", "unlinkDir", "change"]) {
				watcher.on(event, watch(event));
			}
		},
	};
}
