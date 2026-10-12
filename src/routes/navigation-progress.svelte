<!--
	@component
	A thin bar at the top of the window while a navigation is under way: SvelteKit keeps `navigating`
	set until the new page's remote queries have answered, which over a slow database can take a
	while. It shows only once a navigation has taken a moment, so a fast one doesn't flash it, and
	not while a table on the page shows its own loading bar (a filter, sort or page of a list).

	- `indeterminate`: a stripe sweeps across, over and over.
	- `progress`: the bar fills fast at first and ever slower past 70% (it can't know how long the
	  navigation takes), then rushes to the end when it's done.

	Its timing is CSS and a transition: state set from a timer would wait for the navigation, like
	the page does.
-->
<script lang="ts">
	import { navigating } from "$app/state";
	import { cubicOut } from "svelte/easing";

	let { mode = "progress" }: { mode?: "indeterminate" | "progress" } = $props();

	/** Fills the bar from where it got to, then fades it out. */
	function finish(node: HTMLElement) {
		// A navigation done before the bar showed, or a bar that doesn't fill, just goes.
		if (mode !== "progress" || getComputedStyle(node).visibility === "hidden") return {};
		const bar = node.firstElementChild as HTMLElement;
		const from = new DOMMatrix(getComputedStyle(bar).transform).a;
		// The transition takes over from the bar's own animation, at the width it got to.
		bar.style.animation = "none";
		bar.style.transform = `scaleX(${from})`;
		return {
			duration: 400,
			tick: (t: number) => {
				const done = 1 - t;
				bar.style.transform = `scaleX(${from + (1 - from) * cubicOut(Math.min(1, done / 0.5))})`;
				node.style.opacity = String(done < 0.5 ? 1 : 1 - (done - 0.5) / 0.5);
			},
		};
	}
</script>

{#if navigating.to}
	<div
		role="progressbar"
		aria-label={m.common_navigation_loading()}
		class={[
			"navigation-progress-track pointer-events-none fixed inset-x-0 top-0 z-100 h-0.5",
			mode === "indeterminate" && "overflow-hidden bg-primary/20",
		]}
		out:finish
	>
		{#if mode === "progress"}
			<div class="navigation-progress-fill h-full origin-left bg-primary"></div>
		{:else}
			<div class="navigation-progress-sweep h-full w-1/3 bg-primary"></div>
		{/if}
	</div>
{/if}

<style>
	/* Hidden for the first 150ms. */
	.navigation-progress-track {
		animation: navigation-progress-appear 0s 150ms both;
	}

	/* A table's own loading bar is enough (`data-table.svelte`). */
	:global(body:has([data-slot="data-table"][aria-busy="true"])) .navigation-progress-track {
		display: none;
	}

	@keyframes navigation-progress-appear {
		from {
			visibility: hidden;
		}
		to {
			visibility: visible;
		}
	}

	/* 70% in the first second, then creeping towards 95% over the next half minute. */
	.navigation-progress-fill {
		animation: navigation-progress-fill 30s 150ms both;
	}

	@keyframes navigation-progress-fill {
		from {
			transform: scaleX(0);
			animation-timing-function: cubic-bezier(0.1, 0.6, 0.4, 1);
		}
		3% {
			transform: scaleX(0.7);
			animation-timing-function: cubic-bezier(0, 0.6, 0.4, 1);
		}
		to {
			transform: scaleX(0.95);
		}
	}

	.navigation-progress-sweep {
		animation: navigation-progress-sweep 1.2s ease-in-out infinite;
	}

	@keyframes navigation-progress-sweep {
		from {
			transform: translateX(-100%);
		}
		to {
			transform: translateX(300%);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.navigation-progress-sweep {
			width: 100%;
			animation: none;
			opacity: 0.6;
		}
	}
</style>
