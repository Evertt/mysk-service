<!--
	@component
	The customer portal's shell, a phone app like the engineer portal's: each page's app bar at the
	top (`AppBar` from `#lib/client/app-bar.svelte`: its title, the way back, and the bell this shell
	gives it, `notification-bell.svelte`), the page in one column, and the tab bar at the foot
	(`tab-bar.svelte`: Home, Orders, Scan, Equipment and More, where the modules' pages, the language
	and appearance, and signing out are). On a desk's screen (wide, with a mouse) it's shown in a
	phone (`phone-frame.svelte`), as the customer's contact sees it; on a phone, a tablet or in a
	narrow window it's the page itself.
-->
<script lang="ts">
	import { provideAppBarActions } from "#lib/client/app-bar.ts";
	import { provideChangeFeed } from "#lib/components/activity/change-feed.svelte.ts";

	import NavigationSkeleton from "../navigation-skeleton.svelte";
	import PhoneFrame from "../phone-frame.svelte";
	import { useTenantOrderTypes } from "../tenant-order-types.ts";
	import type { LayoutProps } from "./$types";
	import NotificationBell from "./notification-bell.svelte";
	import { watchPortalChanges } from "./portal/client.remote.ts";
	import TabBar from "./tab-bar.svelte";

	let { children }: LayoutProps = $props();

	// One feed of the changes to the customer's records for the tab, which the pages follow.
	provideChangeFeed(watchPortalChanges);

	const orderTypes = useTenantOrderTypes();

	// Each page's app bar ends with the bell.
	provideAppBarActions(bell);

	await orderTypes;
</script>

{#snippet bell()}
	<NotificationBell />
{/snippet}

<PhoneFrame caption={m.client_frame_caption()} statusOn="primary">
	<!-- On paper only the page (e.g. a work order to print): no bars, and no flex layout, which would
		keep a sheet's named @page (`<PrintSheet>`) from applying. -->
	<div
		class="customer-shell mx-auto flex min-h-svh w-full max-w-xl flex-col bg-background [--tab-bar-height:calc(3.5rem+1px+var(--safe-area-bottom))] print:block print:min-h-0"
		data-customer-portal
	>
		<main class="relative flex flex-1 flex-col gap-5 px-4 pb-8 print:block print:p-0">
			{@render children()}
			<NavigationSkeleton group="/(customer)" class="flex flex-col gap-4">
				{#snippet skeleton()}
					<div class="h-[calc(var(--safe-area-top)+3.5rem)] bg-primary"></div>
					<div class="flex flex-col gap-4 px-4">
						<Skeleton class="h-6 w-40" />
						<Skeleton class="h-24 rounded-xl" />
						<Skeleton class="h-40 rounded-xl" />
					</div>
				{/snippet}
			</NavigationSkeleton>
		</main>
		<TabBar />
	</div>
</PhoneFrame>

<style>
	/* In the phone (`phone-frame.svelte`), as high as its screen rather than the window. */
	@media screen and (min-width: 1024px) and (pointer: fine) {
		.customer-shell {
			min-height: 100%;
		}
	}
</style>
