<!--
	@component
	The engineer portal's shell: a slim header and one column, made for a phone in the field.
-->
<script lang="ts">
	import { browser } from "$app/env";
	import { resolve } from "$app/paths";
	import HardHatIcon from "@lucide/svelte/icons/hard-hat";
	import LogOutIcon from "@lucide/svelte/icons/log-out";

	import LanguageSwitcher from "#lib/i18n/language-switcher.svelte";
	import { nameOrderTypes } from "#lib/orders/index.ts";
	import { getOrderTypes } from "#lib/orders/remotes.ts";
	import ModeSwitcher from "#lib/themes/mode-switcher.svelte";
	import ThemeSwitcher from "#lib/themes/theme-switcher.svelte";

	import NavigationSkeleton from "../navigation-skeleton.svelte";
	import type { LayoutProps } from "./$types";
	import { getMe, signOut } from "./my/portal.remote.ts";

	let { children }: LayoutProps = $props();

	// The order types read as the tenant named them: in the browser from this query, from before the
	// first await, as the page may render meanwhile; its `current` is reactive, so the labels follow
	// a change. (The server reads the request's tenant, see `nameOrderTypesOnServer()`.)
	const orderTypes = getOrderTypes();
	if (browser) nameOrderTypes(() => orderTypes.current);

	const [me] = $derived(await Promise.all([getMe(), orderTypes]));
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
			<LanguageSwitcher />
			<ThemeSwitcher />
			<ModeSwitcher />
			<form {...signOut}>
				<Button type="submit" variant="ghost" size="icon-sm" aria-label={m.common_sign_out()}>
					<LogOutIcon />
				</Button>
			</form>
		</div>
	</header>
	<main class="relative mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 p-4 pb-12">
		{@render children()}
		<NavigationSkeleton group="/(field)" class="flex flex-col gap-4 p-4">
			{#snippet skeleton()}
				<Skeleton class="h-8 w-48" />
				<Skeleton class="h-32" />
				<Skeleton class="h-32" />
			{/snippet}
		</NavigationSkeleton>
	</main>
</div>
