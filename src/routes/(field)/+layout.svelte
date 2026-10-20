<!--
	@component
	The engineer portal's shell: a slim header and one column, made for a phone in the field. On a
	desk's screen (wide, with a mouse: `phone-frame.svelte`) it's shown in a phone, as the engineer
	sees it; on a phone or tablet, or in a narrow window, it's the page itself.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import HardHatIcon from "@lucide/svelte/icons/hard-hat";

	import { getCurrentUser } from "#lib/auth/session.remote.ts";
	import BugReportButton from "#lib/bug-reports/bug-report-button.svelte";
	import { useTenantOrderTypes } from "#lib/orders/index.ts";

	import BrandMark from "../brand-mark.svelte";
	import { getViewAs } from "../demo.remote.ts";
	import NavigationSkeleton from "../navigation-skeleton.svelte";
	import type { LayoutProps } from "./$types";
	import HeaderMenu from "./header-menu.svelte";
	import NotificationBell from "./notification-bell.svelte";
	import PhoneFrame from "./phone-frame.svelte";

	let { children }: LayoutProps = $props();

	const orderTypes = useTenantOrderTypes();

	// The engineer by their name as the tenant knows them (their record's).
	const [me, , viewAs] = $derived(await Promise.all([getCurrentUser(), orderTypes, getViewAs()]));
</script>

<PhoneFrame>
	<div class="field-shell flex min-h-svh flex-col bg-background">
		<header
			class="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur"
		>
			<!-- The way home, as an app's logo is; the rest is in the menu (`header-menu.svelte`). -->
			<a href={resolve("/(field)/my")} class="flex min-w-0 flex-1 items-center gap-2">
				<BrandMark icon={HardHatIcon} />
				<span class="flex min-w-0 flex-col leading-tight">
					<span class="truncate text-sm font-medium">{me.name}</span>
					<span class="truncate text-xs text-muted-foreground">{me.organization}</span>
				</span>
			</a>
			<div class="flex shrink-0 items-center gap-1">
				<!-- Only while it records or waits to be sent (the menu starts it), and only its dot, no
					time beside it: a phone's header has no room for it. -->
				<BugReportButton compact whileActive />
				<NotificationBell />
				<!-- In the desktop phone frame its menus open in the phone's screen (`BitsConfig`). -->
				<HeaderMenu name={me.name} organization={me.organization} {viewAs} />
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
</PhoneFrame>

<style>
	/* In the phone (`phone-frame.svelte`), as high as its screen rather than the window. */
	@media (min-width: 1024px) and (pointer: fine) {
		.field-shell {
			min-height: 100%;
		}
	}
</style>
