<script lang="ts">
	import MonitorIcon from "@lucide/svelte/icons/monitor";
	import MoonIcon from "@lucide/svelte/icons/moon";
	import SunIcon from "@lucide/svelte/icons/sun";

	import { type Mode, supportsDark, themes } from "./index.js";
	import { getMode, getTheme, setMode } from "./theme.remote.js";

	const options = [
		{ value: "light", label: "Light", icon: SunIcon },
		{ value: "dark", label: "Dark", icon: MoonIcon },
		{ value: "system", label: "System", icon: MonitorIcon },
	] as const;

	const [mode, theme] = $derived(await Promise.all([getMode(), getTheme()]));
	const current = $derived(options.find((option) => option.value === mode) ?? options[2]);

	async function select(value: Mode) {
		await setMode(value).updates(getMode().withOverride(() => value));
	}
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="ghost" size="icon-sm" aria-label="Colour mode: {current.label}">
				<current.icon />
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end" class="w-52">
		<DropdownMenu.Group>
			<DropdownMenu.Label>Mode</DropdownMenu.Label>
			<DropdownMenu.RadioGroup value={mode} onValueChange={(value) => select(value as Mode)}>
				{#each options as option (option.value)}
					<DropdownMenu.RadioItem value={option.value}>
						<option.icon />
						{option.label}
					</DropdownMenu.RadioItem>
				{/each}
			</DropdownMenu.RadioGroup>
		</DropdownMenu.Group>
		{#if !supportsDark(theme)}
			<DropdownMenu.Separator />
			<p class="px-2 py-1.5 text-xs text-muted-foreground">
				{themes[theme].label} is a light-only theme.
			</p>
		{/if}
	</DropdownMenu.Content>
</DropdownMenu.Root>
