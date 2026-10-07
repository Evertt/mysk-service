<script lang="ts">
	import MonitorIcon from "@lucide/svelte/icons/monitor";
	import MoonIcon from "@lucide/svelte/icons/moon";
	import SunIcon from "@lucide/svelte/icons/sun";

	import type { Mode } from "./index.js";
	import { getMode, setMode } from "./theme.remote.js";

	const options = [
		{ value: "light", label: m.common_mode_light(), icon: SunIcon },
		{ value: "dark", label: m.common_mode_dark(), icon: MoonIcon },
		{ value: "system", label: m.common_mode_system(), icon: MonitorIcon },
	] as const;

	const mode = $derived(await getMode());
	const current = $derived(options.find((option) => option.value === mode) ?? options[2]);

	async function select(value: Mode) {
		await setMode(value).updates(getMode().withOverride(() => value));
	}
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="ghost"
				size="icon-sm"
				aria-label={m.common_mode_button({ mode: current.label })}
			>
				<current.icon />
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end" class="w-52">
		<DropdownMenu.Group>
			<DropdownMenu.Label>{m.common_mode()}</DropdownMenu.Label>
			<DropdownMenu.RadioGroup value={mode} onValueChange={(value) => select(value as Mode)}>
				{#each options as option (option.value)}
					<DropdownMenu.RadioItem value={option.value}>
						<option.icon />
						{option.label}
					</DropdownMenu.RadioItem>
				{/each}
			</DropdownMenu.RadioGroup>
		</DropdownMenu.Group>
	</DropdownMenu.Content>
</DropdownMenu.Root>
