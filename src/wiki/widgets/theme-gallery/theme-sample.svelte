<!--
	@component
	One theme in one mode: a small card of real kit components (a button, badges, an input, a
	switch) inside `data-theme`, with the theme's own component classes provided through context
	(`provideTheme()`, as `<ThemeProvider>` does for the app), so a theme's shapes, fonts and shadows
	show as well as its colours. `style` carries the variables of the mode (`themeStyle()`).
-->
<script lang="ts">
	import { provideTheme } from "#lib/themes/context.ts";
	import type { Theme } from "#lib/themes/types.ts";
	import { cn } from "#lib/utils.ts";

	import { type GalleryMode, themeStyle } from "./theme-gallery.ts";

	let { name, theme, mode }: { name: string; theme: Theme; mode: GalleryMode } = $props();

	provideTheme(
		() => theme,
		() => mode === "dark",
	);

	const id = $props.id();
	const swatches = ["primary", "secondary", "accent", "muted", "destructive"] as const;
</script>

<div class={mode === "dark" ? "dark" : undefined}>
	<div
		data-theme={name}
		data-mode={mode}
		style="{themeStyle(theme, mode)}; font-family: var(--font-body)"
		class={cn("grid gap-3 rounded-lg border bg-background p-3 text-foreground")}
	>
		<div class="grid gap-1">
			<p class="text-xs font-medium tracking-wide text-muted-foreground uppercase">{mode}</p>
			<p class="font-semibold">Order ORD-2026-00014</p>
			<p class="text-sm text-muted-foreground">Cold room door, Pier 9 Cold Storage.</p>
		</div>
		<div class="flex flex-wrap gap-2">
			<Button size="sm">Plan</Button>
			<Button size="sm" variant="outline">Edit</Button>
			<Button size="sm" variant="secondary">Print</Button>
		</div>
		<div class="flex flex-wrap gap-1.5">
			<Badge variant="success">Completed</Badge>
			<Badge variant="warning">Scheduled</Badge>
			<Badge variant="info">Quote</Badge>
			<Badge variant="danger">Urgent</Badge>
		</div>
		<div class="flex items-center gap-3">
			<Input id="{id}-input" aria-label="Customer" value="Pier 9" class="min-w-0 flex-1" />
			<Switch id="{id}-switch" aria-label="Notify" checked />
		</div>
		<div class="flex gap-1.5" aria-label="The theme's colours">
			{#each swatches as swatch (swatch)}
				<span
					class="h-5 flex-1 rounded-sm border"
					style="background: var(--{swatch})"
					title={swatch}
				></span>
			{/each}
		</div>
	</div>
</div>
