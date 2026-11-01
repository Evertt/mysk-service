<!--
	@component
	Every theme of `src/lib/themes` (`themeNames`) as a card, in light and in dark mode side by side:
	real kit components in each theme's variables and component classes, so a new theme appears here
	by being registered.
-->
<script lang="ts">
	import { DEFAULT_THEME } from "#lib/themes/index.ts";

	import { galleryThemes } from "./theme-gallery.ts";
	import ThemeSample from "./theme-sample.svelte";
</script>

<div class="not-prose @container my-6 grid gap-4">
	{#each galleryThemes as { name, label, theme } (name)}
		<section
			data-theme-card={name}
			aria-label={label}
			class="rounded-xl border bg-card p-3 text-card-foreground sm:p-4"
		>
			<h3 class="mb-3 flex items-center gap-2 text-base font-semibold">
				{label}
				<code class="font-mono text-xs font-normal text-muted-foreground">{name}</code>
				{#if name === DEFAULT_THEME}
					<Badge variant="neutral">{m.wiki_themes_default()}</Badge>
				{/if}
			</h3>
			<div class="grid gap-3 @2xl:grid-cols-2">
				<ThemeSample {name} {theme} mode="light" />
				<ThemeSample {name} {theme} mode="dark" />
			</div>
		</section>
	{/each}
</div>
