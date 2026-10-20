/**
 * One way for each piece of a shell's chrome (the office's, the portals', the developers' and the
 * public pages'): `signOut` (`#lib/auth/session.remote.ts`) and `<SignOutButton>` to sign out,
 * `<BrandMark>` for the square icon tile before a shell's name, `<AppearanceSwitchers>` for the
 * language, theme and mode, `useTenantOrderTypes()` for the tenant's order type names, and
 * `<NavSidebar>` and `getCurrentUser` (not checked here: a copy of those is no one line). Copies
 * drifted: three sign-out functions, five tiles, a portal without the theme. These refuse the
 * hand-written forms, by file and line.
 */
import { globSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vite-plus/test";

const root = join(import.meta.dirname, "../../..");

/** The app's own files, without the tests (component tests render the switchers themselves). */
const appFiles = globSync(["src/**/*.{ts,svelte}"], {
	cwd: root,
	exclude: ["src/tests/**", "src/modules/*/tests/**", "src/lib/paraglide/**", "**/*.gen.ts"],
});

/** `file:line` of every line of `files` that matches `pattern`, but in the files of `except`. */
function offenders(
	files: { path: string; source: string }[],
	pattern: RegExp,
	except: readonly string[] = [],
) {
	return files
		.filter((file) => !except.includes(file.path))
		.flatMap((file) =>
			file.source
				.split("\n")
				.flatMap((line, index) => (pattern.test(line) ? [`${file.path}:${index + 1}`] : [])),
		);
}

const app = () =>
	appFiles.map((path) => ({ path, source: readFileSync(join(root, path), "utf8") }));

/** The square tile: a `size-8` box in the primary colours (the page's or the sidebar's). */
const brandTile =
	/class="(?=[^"]*\bsize-8\b)(?=[^"]*\brounded-lg\b)[^"]*\bbg-(?:sidebar-)?primary\b/;

/** An import of one of the three switchers. */
const switcher = /from "[^"]*\/(?:language|theme|mode)-switcher\.svelte"/;

describe("a shell's chrome", () => {
	it("signs out with signOut from #lib/auth/session.remote.ts only", () => {
		expect(offenders(app(), /export const signOut\b/, ["src/lib/auth/session.remote.ts"])).toEqual(
			[],
		);
		expect(
			offenders(app(), /auth\.api\.signOut\(/, [
				"src/lib/auth/session.remote.ts",
				// Signs out to stay on the invitation, for the person it's for to accept it.
				"src/routes/invite/[id]/invite.remote.ts",
			]),
		).toEqual([]);
	});

	it("submits signOut with <SignOutButton> only", () => {
		expect(
			offenders(app(), /\bsignOut\.(?:action|method)\b/, ["src/routes/sign-out-button.svelte"]),
		).toEqual([]);
	});

	it("shows the brand's tile with <BrandMark>", () => {
		expect(offenders(app(), brandTile, ["src/routes/brand-mark.svelte"])).toEqual([]);
	});

	it("offers the language, theme and mode with <AppearanceSwitchers>", () => {
		expect(offenders(app(), switcher, ["src/routes/appearance-switchers.svelte"])).toEqual([]);
	});

	it("names the order types with useTenantOrderTypes()", () => {
		expect(
			offenders(app(), /\bnameOrderTypes\(/, [
				"src/lib/orders/types.ts",
				"src/lib/orders/type-settings/tenant-order-types.ts",
				"src/lib/orders/server/types.ts",
			]),
		).toEqual([]);
	});
});

describe("the checks", () => {
	const file = (path: string, source: string) => ({ path, source });

	it("find a hand-made tile, in either colours, and leave other boxes alone", () => {
		const found = offenders(
			[
				file(
					"a.svelte",
					[
						`<span class="flex size-8 items-center rounded-lg bg-primary text-primary-foreground">`,
						`<div class="flex aspect-square size-8 rounded-lg bg-sidebar-primary">`,
						`<Avatar.Root class="size-8 rounded-lg">`,
						`<span class="size-3 bg-primary"></span>`,
					].join("\n"),
				),
			],
			brandTile,
		);
		expect(found).toEqual(["a.svelte:1", "a.svelte:2"]);
	});

	it("find a switcher's import, and the files they're allowed in", () => {
		const files = [
			file("b.svelte", `\timport ModeSwitcher from "#lib/themes/mode-switcher.svelte";`),
			file("c.svelte", `\timport LanguageSwitcher from "#lib/i18n/language-switcher.svelte";`),
		];
		expect(offenders(files, switcher, ["c.svelte"])).toEqual(["b.svelte:1"]);
	});
});
