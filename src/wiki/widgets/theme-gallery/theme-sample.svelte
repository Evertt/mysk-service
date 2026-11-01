<!--
	@component
	One theme in one mode: a small card of real kit components (a button, badges, an input, a
	switch) inside `data-theme`, with the theme's own component classes provided through context
	(`provideTheme()`, as `<ThemeProvider>` does for the app), so a theme's shapes, fonts and shadows
	show as well as its colours. `style` carries the variables of the mode (`themeStyle()`).
-->
<script lang="ts">
	import { label } from "#lib/i18n/index.ts";
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
			<p class="text-xs font-medium tracking-wide text-muted-foreground uppercase">
				{mode === "dark" ? m.common_mode_dark() : m.common_mode_light()}
			</p>
			<p class="font-semibold">{m.wiki_themes_sample_order({ number: "ORD-2026-00014" })}</p>
			<p class="text-sm text-muted-foreground">{m.wiki_themes_sample_description()}</p>
		</div>
		<div class="flex flex-wrap gap-2">
			<Button size="sm">{m.wiki_themes_sample_plan()}</Button>
			<Button size="sm" variant="outline">{m.common_edit()}</Button>
			<Button size="sm" variant="secondary">{m.wiki_themes_sample_print()}</Button>
		</div>
		<div class="flex flex-wrap gap-1.5">
			<Badge variant="success">{label("orderStatus", "completed")}</Badge>
			<Badge variant="warning">{label("orderStatus", "scheduled")}</Badge>
			<Badge variant="info">{label("orderStatus", "quote")}</Badge>
			<Badge variant="danger">{label("orderPriority", "urgent")}</Badge>
		</div>
		<div class="flex items-center gap-3">
			<Input
				id="{id}-input"
				aria-label={m.orders_column_customer()}
				value="Pier 9"
				class="min-w-0 flex-1"
			/>
			<Switch id="{id}-switch" aria-label={m.wiki_themes_sample_notify()} checked />
		</div>
		<div class="flex gap-1.5" aria-label={m.wiki_themes_sample_colours()}>
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
