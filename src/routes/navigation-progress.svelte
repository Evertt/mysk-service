<!--
	@component
	A thin bar at the top of the window while a navigation is under way: SvelteKit keeps `navigating`
	set until the new page's remote queries have answered, which over a slow database can take a
	while. It shows only once a navigation has taken a moment, so a fast one doesn't flash it.
-->
<script lang="ts">
	import { navigating } from "$app/state";
</script>

{#if navigating.to}
	<div
		role="progressbar"
		aria-label={m.common_navigation_loading()}
		class="navigation-progress-track pointer-events-none fixed inset-x-0 top-0 z-100 h-0.5 overflow-hidden bg-primary/20"
	>
		<div class="navigation-progress h-full w-1/3 bg-primary"></div>
	</div>
{/if}

<style>
	/* Hidden for the first 150ms. */
	.navigation-progress-track {
		animation: navigation-progress-appear 0s 150ms both;
	}

	@keyframes navigation-progress-appear {
		from {
			visibility: hidden;
		}
		to {
			visibility: visible;
		}
	}

	.navigation-progress {
		animation: navigation-progress 1.2s ease-in-out infinite;
	}

	@keyframes navigation-progress {
		from {
			transform: translateX(-100%);
		}
		to {
			transform: translateX(300%);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.navigation-progress {
			width: 100%;
			animation: none;
			opacity: 0.6;
		}
	}
</style>
