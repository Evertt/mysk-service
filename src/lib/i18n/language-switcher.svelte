<!--
	@component
	Chooses the app's language (see `switchLanguage`): an icon button with a menu, like the mode
	switcher, or with `submenu` a "Language" item to put in another dropdown menu (the user menu).
-->
<script lang="ts">
	import LanguagesIcon from "@lucide/svelte/icons/languages";

	import { getLocale, type Locale, locales } from "#lib/paraglide/runtime.js";

	import { languageNames, switchLanguage } from "./languages.js";

	let { submenu = false }: { submenu?: boolean } = $props();

	const current = getLocale();
</script>

{#snippet choices()}
	<DropdownMenu.RadioGroup
		value={current}
		onValueChange={(value) => switchLanguage(value as Locale)}
	>
		{#each locales as locale (locale)}
			<DropdownMenu.RadioItem value={locale} lang={locale}>
				{languageNames[locale]}
			</DropdownMenu.RadioItem>
		{/each}
	</DropdownMenu.RadioGroup>
{/snippet}

{#if submenu}
	<DropdownMenu.Sub>
		<DropdownMenu.SubTrigger>
			<LanguagesIcon />
			{m.common_language()}
			<span class="ml-auto text-xs text-muted-foreground">{languageNames[current]}</span>
		</DropdownMenu.SubTrigger>
		<DropdownMenu.SubContent class="w-40">
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
					aria-label="{m.common_language()}: {languageNames[current]}"
				>
					<LanguagesIcon />
				</Button>
			{/snippet}
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="end" class="w-40">
			<DropdownMenu.Group>
				<DropdownMenu.Label>{m.common_language()}</DropdownMenu.Label>
				{@render choices()}
			</DropdownMenu.Group>
		</DropdownMenu.Content>
	</DropdownMenu.Root>
{/if}
