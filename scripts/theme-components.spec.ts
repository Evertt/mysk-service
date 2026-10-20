import { readFileSync } from "node:fs";

import { describe, expect, test } from "vite-plus/test";

import { slotNames, slotsModule, srcFiles, themeComponent, uiFiles } from "./theme-components.ts";

const strip = (source: string) => source.replace(/\s+/g, "");

describe("themeComponent", () => {
	test("merges the theme's classes between the component's and the consumer's", () => {
		const { source, count } = themeComponent(`<script lang="ts">
	import { cn } from "#lib/utils.ts";
	let { class: className, ...rest } = $props();
</script>

<div data-slot="card-header" class={cn("grid gap-1", className)} {...rest}></div>
<span data-slot="card-badge" class="text-xs"></span>
`);
		expect(count).toBe(2);
		expect(strip(source)).toContain(
			strip(`class={cn("grid gap-1", theme.classes("card-header"), className)}`),
		);
		expect(strip(source)).toContain(strip(`class={cn("text-xs", theme.classes("card-badge"))}`));
		expect(strip(source)).toContain(strip(`$props();\n\n\tconst theme = useTheme();`));
		expect(source).toContain(`import { useTheme } from "#lib/themes/context.ts";`);
	});

	test("puts them before a lone className, so the consumer's still win", () => {
		const { source } = themeComponent(`<script lang="ts">
	import { cn } from "#lib/utils.ts";
	let { class: className } = $props();
</script>

<nav data-slot="breadcrumb" class={cn(className)}></nav>
`);
		expect(strip(source)).toContain(strip(`cn(theme.classes("breadcrumb"), className)`));
	});

	test("themes a props object, and a dynamic slot by its name", () => {
		const { source } = themeComponent(`<script lang="ts">
	import { cn } from "#lib/utils.ts";
	let { class: className, "data-slot": dataSlot = "input" } = $props();
	const attrs = $derived({ class: cn("flex", className), "data-slot": "sidebar-menu-button" });
</script>

<input data-slot={dataSlot} class={cn("h-9", className)} />
`);
		expect(strip(source)).toContain(
			strip(`cn("flex", theme.classes("sidebar-menu-button"), className)`),
		);
		expect(strip(source)).toContain(strip(`cn("h-9", theme.classes(dataSlot as Slot), className)`));
		expect(source).toContain(`import type { Slot } from "#lib/themes/types.ts";`);
	});

	test("leaves our own components alone, since they theme themselves", () => {
		const input = `<script lang="ts">
	import { Button } from "#lib/components/ui/button/index.ts";
	import { cn } from "#lib/utils.ts";
	let { class: className } = $props();
</script>

<Button data-slot="pagination-link" class={cn("size-8", className)} />
`;
		expect(themeComponent(input)).toEqual({ source: input, count: 0 });
	});
});

describe("the shadcn-svelte components", () => {
	test.each(uiFiles())("%s is themed (run `pnpm themes:sync`)", (file) => {
		const source = readFileSync(file, "utf8");
		expect(themeComponent(source).source).toBe(source);
	});

	test("slots.ts lists every slot (run `pnpm themes:sync`)", () => {
		expect(readFileSync("src/lib/themes/slots.ts", "utf8")).toBe(
			slotsModule(slotNames(srcFiles())),
		);
	});
});
