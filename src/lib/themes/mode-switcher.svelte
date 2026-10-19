<!--
	@component
	Chooses light, dark or the system's mode: an icon button with a menu, or with `submenu` a "Mode"
	item to put in another dropdown menu, its choices beside it, or with `submenu="below"` under it,
	over the menu (the engineer portal's header menu, narrow on a phone).
-->
<script lang="ts">
	import MonitorIcon from "@lucide/svelte/icons/monitor";
	import MoonIcon from "@lucide/svelte/icons/moon";
	import SunIcon from "@lucide/svelte/icons/sun";

	import type { Mode } from "./index.ts";
	import { getMode, setMode } from "./theme.remote.ts";

	let { submenu = false }: { submenu?: boolean | "below" } = $props();

	const below = $derived(submenu === "below");

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

{#snippet choices()}
	<DropdownMenu.RadioGroup value={mode} onValueChange={(value) => select(value as Mode)}>
		{#each options as option (option.value)}
			<DropdownMenu.RadioItem value={option.value}>
				<option.icon />
				{option.label}
			</DropdownMenu.RadioItem>
		{/each}
	</DropdownMenu.RadioGroup>
{/snippet}

{#if submenu}
	<DropdownMenu.Sub>
		<DropdownMenu.SubTrigger>
			<current.icon />
			{m.common_mode()}
			<span class="ml-auto text-xs text-muted-foreground">{current.label}</span>
		</DropdownMenu.SubTrigger>
		<DropdownMenu.SubContent
			class="w-40"
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
				{@render choices()}
			</DropdownMenu.Group>
		</DropdownMenu.Content>
	</DropdownMenu.Root>
{/if}
