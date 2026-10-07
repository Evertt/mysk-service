<!--
	@component
	The engineer portal's shell: a slim header and one column, made for a phone in the field.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import HardHatIcon from "@lucide/svelte/icons/hard-hat";
	import LogOutIcon from "@lucide/svelte/icons/log-out";

	import ModeSwitcher from "#lib/themes/mode-switcher.svelte";
	import ThemeSwitcher from "#lib/themes/theme-switcher.svelte";

	import type { LayoutProps } from "./$types";
	import { getMe, signOut } from "./my/portal.remote.js";

	let { children }: LayoutProps = $props();

	const me = $derived(await getMe());
</script>

<div class="flex min-h-svh flex-col bg-background">
	<header
		class="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur"
	>
		<a href={resolve("/(field)/my")} class="flex min-w-0 items-center gap-2">
			<span
				class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"
			>
				<HardHatIcon class="size-4" />
			</span>
			<span class="flex min-w-0 flex-col leading-tight">
				<span class="truncate text-sm font-medium">{me.name}</span>
				<span class="truncate text-xs text-muted-foreground">{me.organization}</span>
			</span>
		</a>
		<div class="ml-auto flex items-center gap-1">
			<ThemeSwitcher />
			<ModeSwitcher />
			<form {...signOut}>
				<Button type="submit" variant="ghost" size="icon-sm" aria-label="Sign out">
					<LogOutIcon />
				</Button>
			</form>
		</div>
	</header>
	<main class="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 p-4 pb-12">
		{@render children()}
	</main>
</div>
