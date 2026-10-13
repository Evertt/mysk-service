<script lang="ts">
	import type { Component, Snippet } from "svelte";

	let {
		component: Inner,
		props,
	}: { component: Component<{ children: Snippet }>; props: { children: Snippet } } = $props();

	// A page that a preload renders ahead (SvelteKit's `forkPreloads`) runs in a Svelte fork, which
	// runs no effects until the navigation commits it, and TanStack Table needs its effects to have
	// run (it syncs its options and atoms in them). So after the first page, what's in here is
	// created once mounted: in a fork it waits for the commit. The server and the first page's
	// hydration render it at once, so the HTML the server sent stays.
	// (`data-hydrated` is set by the root layout once the first page is interactive.)
	let mounted = $state(
		typeof document === "undefined" || !("hydrated" in document.documentElement.dataset),
	);
	$effect(() => {
		mounted = true;
	});
</script>

{#if mounted}
	<Inner {...props} />
{/if}
