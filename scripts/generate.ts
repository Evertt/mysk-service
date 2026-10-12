/**
 * Writes the generated code the app and its type check need: the modules' registries and route
 * stubs (`scripts/modules.ts`), SvelteKit's types (`svelte-kit sync`) and paraglide's messages.
 * Run it with `pnpm generate`; `pnpm check` and `prepare` run it first.
 */
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";

const run = (command: string, args: string[]) => execFileSync(command, args, { stdio: "inherit" });

run("node", ["scripts/modules.ts"]);
// svelte-check's cache.
rmSync(".svelte-kit/.svelte-check", { recursive: true, force: true });
run("svelte-kit", ["sync"]);
run("paraglide-js", [
	"compile",
	"--project",
	"./project.inlang",
	"--outdir",
	"./src/lib/paraglide",
	"--strategy",
	"cookie",
	"preferredLanguage",
	"baseLocale",
	"--emit-ts-declarations",
	// The layout the Vite plugin writes outside production builds (`vite.config.ts`), so the tests'
	// servers find the messages as they compile them: the CLI's default, a module per message
	// (~2,900), slowed the next component test run into timeouts.
	"--output-structure",
	"locale-modules",
	"--silent",
]);
