<script lang="ts">
	import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
	import PaletteIcon from "@lucide/svelte/icons/palette";

	import { type Theme, themes } from "#lib/themes.js";

	import { getTheme, setTheme } from "./theme.remote.js";

	const current = $derived(await getTheme());
	const label = $derived(themes.find((theme) => theme.value === current)?.label);

	async function select(theme: Theme) {
		// Switch right away; the cookie (and so the server-rendered theme) follows.
		document.documentElement.dataset.theme = theme;
		await setTheme(theme);
	}
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="ghost" size="sm" aria-label="Theme">
				<PaletteIcon data-icon="inline-start" />
				{label}
				<ChevronDownIcon data-icon="inline-end" class="text-muted-foreground" />
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end" class="w-48">
		<DropdownMenu.Group>
			<DropdownMenu.Label>Theme</DropdownMenu.Label>
			<DropdownMenu.RadioGroup value={current} onValueChange={(value) => select(value as Theme)}>
				{#each themes as theme (theme.value)}
					<DropdownMenu.RadioItem value={theme.value}>
						<!-- A swatch rendered in the theme itself, via its scoped variables. -->
						<span data-theme={theme.value} class="flex overflow-hidden rounded-sm border">
							<span class="size-3 bg-primary"></span>
							<span class="size-3 bg-sidebar"></span>
							<span class="size-3 bg-background"></span>
						</span>
						{theme.label}
					</DropdownMenu.RadioItem>
				{/each}
			</DropdownMenu.RadioGroup>
		</DropdownMenu.Group>
	</DropdownMenu.Content>
</DropdownMenu.Root>
