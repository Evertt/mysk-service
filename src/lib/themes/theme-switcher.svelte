<!--
	@component
	Chooses the theme: a button with its name and a menu, or with `submenu` a "Theme" item to put in
	another dropdown menu, its choices beside it, or with `submenu="below"` under it, over the menu
	(the engineer portal's header menu, narrow on a phone).
-->
<script lang="ts">
	import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
	import PaletteIcon from "@lucide/svelte/icons/palette";

	import { type ThemeName, themeNames, themes } from "./index.ts";
	import { getTheme, setTheme } from "./theme.remote.ts";

	let { submenu = false }: { submenu?: boolean | "below" } = $props();

	const below = $derived(submenu === "below");

	const current = $derived(await getTheme());

	async function select(name: ThemeName) {
		// Show the new theme right away rather than after the cookie round trip.
		await setTheme(name).updates(getTheme().withOverride(() => name));
	}
</script>

{#snippet choices()}
	<DropdownMenu.RadioGroup value={current} onValueChange={(value) => select(value as ThemeName)}>
		{#each themeNames as name (name)}
			<DropdownMenu.RadioItem value={name}>
				<!-- A swatch rendered in the theme itself, via its scoped variables. -->
				<span data-theme={name} class="flex overflow-hidden rounded-sm border">
					<span class="size-3 bg-primary"></span>
					<span class="size-3 bg-sidebar"></span>
					<span class="size-3 bg-background"></span>
				</span>
				{themes[name].label}
			</DropdownMenu.RadioItem>
		{/each}
	</DropdownMenu.RadioGroup>
{/snippet}

{#if submenu}
	<DropdownMenu.Sub>
		<DropdownMenu.SubTrigger>
			<PaletteIcon />
			{m.common_theme()}
			<span class="ml-auto text-xs text-muted-foreground">{themes[current].label}</span>
		</DropdownMenu.SubTrigger>
		<DropdownMenu.SubContent
			class="w-48"
			side={below ? "bottom" : "right"}
			align={below ? "end" : "start"}
			alignOffset={below ? 0 : -3}
		>
			{@render choices()}
		</DropdownMenu.SubContent>
	</DropdownMenu.Sub>
{:else}
	<DropdownMenu.Root>
		<DropdownMenu.Trigger>
			{#snippet child({ props })}
				<Button {...props} variant="ghost" size="sm" aria-label={m.common_theme()}>
					<PaletteIcon data-icon="inline-start" />
					{themes[current].label}
					<ChevronDownIcon data-icon="inline-end" class="text-muted-foreground" />
				</Button>
			{/snippet}
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="end" class="w-48">
			<DropdownMenu.Group>
				<DropdownMenu.Label>{m.common_theme()}</DropdownMenu.Label>
				{@render choices()}
			</DropdownMenu.Group>
		</DropdownMenu.Content>
	</DropdownMenu.Root>
{/if}
