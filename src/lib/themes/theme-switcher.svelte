<script lang="ts">
	import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
	import PaletteIcon from "@lucide/svelte/icons/palette";

	import { type ThemeName, themeNames, themes } from "./index.js";
	import { getTheme, setTheme } from "./theme.remote.js";

	const current = $derived(await getTheme());

	async function select(name: ThemeName) {
		// Show the new theme right away rather than after the cookie round trip.
		await setTheme(name).updates(getTheme().withOverride(() => name));
	}
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="ghost" size="sm" aria-label="Theme">
				<PaletteIcon data-icon="inline-start" />
				{themes[current].label}
				<ChevronDownIcon data-icon="inline-end" class="text-muted-foreground" />
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end" class="w-48">
		<DropdownMenu.Group>
			<DropdownMenu.Label>Theme</DropdownMenu.Label>
			<DropdownMenu.RadioGroup
				value={current}
				onValueChange={(value) => select(value as ThemeName)}
			>
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
		</DropdownMenu.Group>
	</DropdownMenu.Content>
</DropdownMenu.Root>
