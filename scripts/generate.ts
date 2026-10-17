/**
 * Writes the generated code the app and its type check need: the modules' registries and route
 * stubs (`scripts/modules.ts`), SvelteKit's types (`svelte-kit sync`) and paraglide's messages.
 * Run it with `pnpm generate`; `pnpm check` and `prepare` run it first.
 */
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";

import { paraglideOptions, paraglideOutdirs } from "./paraglide.ts";

const run = (command: string, args: string[]) => execFileSync(command, args, { stdio: "inherit" });

run("node", ["scripts/modules.ts"]);
// svelte-check's cache.
rmSync(".svelte-kit/.svelte-check", { recursive: true, force: true });
run("svelte-kit", ["sync"]);
// The messages, as the dev server and the tests have them (scripts/paraglide.ts): with the same
// options, so neither rewrites what the other wrote.
run("paraglide-js", [
	"compile",
	"--project",
	paraglideOptions.project,
	"--outdir",
	paraglideOutdirs["locale-modules"],
	"--strategy",
	...paraglideOptions.strategy,
	"--emit-ts-declarations",
	"--output-structure",
	"locale-modules",
	"--silent",
]);
