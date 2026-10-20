/**
 * One way to colour a state: the theme's tone tokens, `text-success`, `bg-warning/10`,
 * `border-info/30`, `bg-destructive` (see `--success`, `--warning`, `--info` and `--destructive`
 * in each theme), or a `Badge` tone. A raw palette (`text-emerald-600`, `bg-amber-50`) looks the
 * same in every theme and needs its own `dark:` twin, so it's refused outside the themes
 * (`src/lib/themes/`) and the vendor components (`src/lib/components/ui/`), but for the colours
 * below that aren't a state.
 */
import { globSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vite-plus/test";

const root = join(import.meta.dirname, "../../..");

/** A class in one of those palettes, with its variants: `dark:text-emerald-400`, `bg-amber-500/10`. */
const stateColour = /[\w:-]*-(?:emerald|amber|rose|sky|green|red)-\d{2,3}(?:\/\d+)?\b/g;

/** Files that may use these palettes, with the classes they may use and why. */
const allowed: Record<string, { classes: string[]; reason: string }> = {
	"src/modules/schedule/calendar/type-colors.ts": {
		classes: ["*"],
		reason: "a colour per order type, to tell them apart in the calendar: not a state",
	},
	"src/modules/docks/display.ts": {
		classes: ["bg-emerald-500", "bg-amber-500", "bg-rose-600"],
		reason: "the beacon's lamps, in the colours they really light up in",
	},
	"src/modules/docks/board/components-card.svelte": {
		classes: ["text-amber-300", "bg-amber-500"],
		reason: "a drawing of the dock's parts: the SCP panel's print, the key and the beacon",
	},
	"src/modules/docks/board/dock-card.svelte": {
		classes: ["text-amber-300"],
		reason: "the SCP panel's print, as on the device",
	},
	"src/modules/energy/overview/door-card.svelte": {
		classes: [
			"text-sky-600",
			"dark:text-sky-400",
			"bg-amber-400",
			"bg-sky-400",
			"text-sky-300",
			"text-rose-300",
		],
		reason:
			"a drawing of the door: a kind's colour, the warm or cold air that leaks out, and its lit display on the dark panel",
	},
	"src/modules/energy/overview/consumption-chart.svelte": {
		classes: ["bg-amber-500"],
		reason: "a chart's highlight of the current period, beside the brand's bars",
	},
};

const files = globSync("src/**/*.{svelte,ts}", { cwd: root }).filter(
	(path) =>
		!path.startsWith("src/lib/themes/") &&
		!path.startsWith("src/lib/components/ui/") &&
		!path.startsWith("src/tests/") &&
		!/\.(?:spec|test)\.ts$/.test(path),
);

test("states are coloured with the theme's tone tokens, not a raw palette", () => {
	const offences: string[] = [];
	for (const path of files) {
		const source = readFileSync(join(root, path), "utf8");
		const allowedHere = allowed[path]?.classes ?? [];
		for (const { 0: name, index } of source.matchAll(stateColour)) {
			if (allowedHere.includes("*") || allowedHere.includes(name)) continue;
			offences.push(`${path}:${source.slice(0, index).split("\n").length} ${name}`);
		}
	}
	expect(offences, "use text-success, bg-warning/10, … (see AGENTS.md)").toEqual([]);
});

test.each(Object.entries(allowed))("the exception for %s is still needed", (path, { classes }) => {
	const used = readFileSync(join(root, path), "utf8").match(stateColour) ?? [];
	expect(used).toEqual(expect.arrayContaining(classes.includes("*") ? [] : classes));
	expect(used).not.toEqual([]);
});
