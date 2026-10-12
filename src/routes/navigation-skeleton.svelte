<!--
	@component
	A skeleton over the page while a navigation to another page is under way: SvelteKit keeps the
	page shown until the next one's remote queries have answered, which over a slow database can
	take a while. Shown only once a navigation has taken a moment, so a fast one doesn't flash it.
	A navigation to the same path (a list's filters, its page) keeps the page, which shows its own
	loading state. Place it in the page's container, which must be `relative`.

	It covers the page rather than hiding it, which would make its charts measure an empty box, nor
	wraps the page in a `<svelte:boundary>` with a `pending` snippet, which (in Svelte 5.57) stops
	a table inside it from following its URL.
-->
<script lang="ts">
	import { navigating, page } from "$app/state";
	import type { Snippet } from "svelte";
	import type { ClassValue } from "svelte/elements";

	let {
		group,
		skeleton,
		class: className,
	}: {
		/**
		 * The route group whose pages it stands in for, e.g. `/(app)`: a navigation out of it (signing
		 * out) leaves this layout, so shows no skeleton of its pages.
		 */
		group: string;
		/** The skeleton, given the id of the route the navigation goes to. */
		skeleton: Snippet<[routeId: string | null]>;
		class?: ClassValue;
	} = $props();

	// The delay is CSS: state set from a timer would wait for the navigation, like the page.
	const leaving = $derived(
		!!navigating.to?.route.id?.startsWith(`${group}/`) &&
			navigating.to.url.pathname !== page.url.pathname,
	);
</script>

{#if leaving}
	<div
		class={["navigation-skeleton absolute inset-0 z-50 bg-background", className]}
		role="status"
		aria-label={m.common_navigation_loading()}
	>
		{@render skeleton(navigating.to?.route.id ?? null)}
	</div>
{/if}

<style>
	/* Hidden for the first 150ms. */
	.navigation-skeleton {
		animation: navigation-skeleton-appear 0s 150ms both;
	}

	@keyframes navigation-skeleton-appear {
		from {
			visibility: hidden;
		}
		to {
			visibility: visible;
		}
	}
</style>
