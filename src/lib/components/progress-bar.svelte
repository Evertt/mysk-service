<!--
	@component
	A thin loading bar along the top of whatever it's placed in (`class` places it, e.g.
	`fixed inset-x-0 top-0`), while `active`. It shows only once the wait has taken a moment, so a
	quick one doesn't flash it.

	- `progress`: the bar fills fast at first and ever slower past 70% (it can't know how long the
	  wait is), then rushes to the end when it's over.
	- `indeterminate`: a stripe sweeps across, over and over.

	Its timing is CSS and a transition: state set from a timer during a navigation would wait for the
	navigation, like the page does.
-->
<script lang="ts">
	import { cubicOut } from "svelte/easing";
	import type { ClassValue } from "svelte/elements";

	let {
		active,
		label,
		mode = "progress",
		class: className,
	}: {
		active: boolean;
		/** What it's waiting for, for screen readers. */
		label: string;
		mode?: "indeterminate" | "progress";
		class?: ClassValue;
	} = $props();

	/** Fills the bar from where it got to, then fades it out. */
	function finish(node: HTMLElement) {
		// It's no longer waiting (also for a test that counts the progress bars).
		node.removeAttribute("role");
		// A wait over before the bar showed, or a bar that doesn't fill, just goes.
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

{#if active}
	<div
		role="progressbar"
		aria-label={label}
		class={[
			"progress-bar-track pointer-events-none h-0.5",
			mode === "indeterminate" && "overflow-hidden bg-primary/20",
			className,
		]}
		out:finish
	>
		{#if mode === "progress"}
			<div class="progress-bar-fill h-full origin-left bg-primary"></div>
		{:else}
			<div class="progress-bar-sweep h-full w-1/3 bg-primary"></div>
		{/if}
	</div>
{/if}

<style>
	/* Hidden for the first 150ms. */
	.progress-bar-track {
		animation: progress-bar-appear 0s 150ms both;
	}

	@keyframes progress-bar-appear {
		from {
			visibility: hidden;
		}
		to {
			visibility: visible;
		}
	}

	/* 70% in the first second, then creeping towards 95% over the next half minute. */
	.progress-bar-fill {
		animation: progress-bar-fill 30s 150ms both;
	}

	@keyframes progress-bar-fill {
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

	.progress-bar-sweep {
		animation: progress-bar-sweep 1.2s ease-in-out infinite;
	}

	@keyframes progress-bar-sweep {
		from {
			transform: translateX(-100%);
		}
		to {
			transform: translateX(300%);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.progress-bar-sweep {
			width: 100%;
			animation: none;
			opacity: 0.6;
		}
	}
</style>
