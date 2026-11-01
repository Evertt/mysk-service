<!--
	@component
	How a change reaches the pages that show it, step by step (`liveSteps`): the change, its entry in
	the log, the shell's feed, the page's refresh. Back and Next step through it, Play walks it to the
	last step and stops there. Movement is left out for those who ask for less
	(`prefers-reduced-motion`).
-->
<script lang="ts">
	import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
	import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
	import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
	import PauseIcon from "@lucide/svelte/icons/pause";
	import PlayIcon from "@lucide/svelte/icons/play";
	import { useInterval } from "runed";

	import { formatNumber } from "#lib/i18n/format.ts";
	import { cn } from "#lib/utils.ts";
	import Diagram from "#wiki/parts/diagram.svelte";
	import { githubUrl } from "#wiki/parts/github.ts";
	import InlineCode from "#wiki/parts/inline-code.svelte";

	import { liveSteps } from "./live-flow.ts";

	let { pace = 2000 }: { /** How long Play shows each step (ms). */ pace?: number } = $props();

	const last = liveSteps.length - 1;
	let current = $state(0);
	const step = $derived(liveSteps[current]);

	const player = useInterval(() => pace, {
		immediate: false,
		callback: () => {
			current = Math.min(current + 1, last);
			if (current === last) player.pause();
		},
	});

	function play() {
		if (current === last) current = 0;
		player.resume();
	}

	function go(to: number) {
		player.pause();
		current = to;
	}

	// The drawing: a box per step, server on the left of the line and the browser on its right.
	const box = { width: 78, height: 50, gap: 16, top: 26 };
	const width = 4 * box.width + 3 * box.gap;
	const height = box.top + box.height + 46;
	const left = (index: number) => index * (box.width + box.gap);
	const centre = (index: number) => left(index) + box.width / 2;
	const divider = left(3) - box.gap / 2;
</script>

<figure class="not-prose @container my-6 rounded-xl border bg-card p-3 text-card-foreground sm:p-4">
	<div class="mx-auto w-full max-w-[30rem] [&>svg]:my-0">
		<Diagram viewBox="0 0 {width} {height}" label={m.wiki_live_diagram()}>
			<line
				x1={divider}
				x2={divider}
				y1="4"
				y2={height - 4}
				class="stroke-border"
				stroke-width="1.5"
				stroke-dasharray="4 4"
			/>
			<text x={divider - 8} y="12" text-anchor="end" font-size="14" class="fill-muted-foreground">
				{m.wiki_live_server()}
			</text>
			<text x={divider + 8} y="12" font-size="14" class="fill-muted-foreground">
				{m.wiki_live_browser()}
			</text>
			{#each liveSteps as { id, box: name }, index (id)}
				{@const state = index < current ? "done" : index === current ? "current" : "next"}
				{#if index > 0}
					<path
						d="M {left(index) - box.gap + 2} {box.top + box.height / 2} h {box.gap - 6}"
						class={index <= current ? "stroke-primary" : "stroke-muted-foreground"}
						stroke-width="2"
					/>
					<polygon
						points="{left(index)},{box.top + box.height / 2} {left(index) - 6},{box.top +
							box.height / 2 -
							4} {left(index) - 6},{box.top + box.height / 2 + 4}"
						class={index <= current ? "fill-primary" : "fill-muted-foreground"}
					/>
				{/if}
				<g data-step={id} data-current={state === "current" || undefined}>
					<rect
						x={left(index)}
						y={box.top}
						width={box.width}
						height={box.height}
						rx="10"
						stroke-width="1.5"
						class={cn(
							"motion-safe:transition-colors motion-safe:duration-300",
							state === "current" && "fill-primary stroke-primary",
							state === "done" && "fill-primary/15 stroke-primary",
							state === "next" && "fill-muted stroke-border",
						)}
					/>
					<text
						x={centre(index)}
						y={box.top + box.height / 2}
						text-anchor="middle"
						dominant-baseline="central"
						font-size="15"
						font-weight="600"
						class={cn(
							"motion-safe:transition-colors motion-safe:duration-300",
							state === "current" ? "fill-primary-foreground" : "fill-foreground",
							state === "next" && "fill-muted-foreground",
						)}
					>
						{name()}
					</text>
				</g>
			{/each}
			<circle
				r="6"
				class="fill-primary motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-out"
				style="transform: translate({centre(current)}px, {box.top + box.height + 18}px)"
			/>
		</Diagram>
	</div>

	<div class="mt-4 min-h-36" aria-live="polite">
		<p class="text-xs font-medium tracking-wide text-muted-foreground uppercase">
			{m.wiki_live_step({
				current: formatNumber(current + 1),
				total: formatNumber(liveSteps.length),
			})}
		</p>
		<p class="mt-1 font-semibold">{step.title()}</p>
		<p class="mt-1 text-sm text-muted-foreground">
			<InlineCode
				text={step.detail()}
				class="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground"
			/>
		</p>
		<a
			href={githubUrl(step.source)}
			target="_blank"
			rel="noopener noreferrer"
			class="mt-2 inline-flex items-center gap-1 font-mono text-xs text-primary underline-offset-4 hover:underline focus-visible:underline"
		>
			{step.source}
			<ExternalLinkIcon class="size-3" aria-hidden="true" />
		</a>
	</div>

	<div class="mt-3 flex flex-wrap items-center gap-2">
		<Button variant="outline" size="sm" disabled={current === 0} onclick={() => go(current - 1)}>
			<ArrowLeftIcon />
			{m.common_back()}
		</Button>
		<Button variant="outline" size="sm" disabled={current === last} onclick={() => go(current + 1)}>
			{m.wiki_live_next()}
			<ArrowRightIcon />
		</Button>
		<!-- One button, so it keeps the focus as it turns from Play to Pause and back. -->
		<Button size="sm" onclick={() => (player.isActive ? player.pause() : play())}>
			{#if player.isActive}
				<PauseIcon />
				{m.wiki_live_pause()}
			{:else}
				<PlayIcon />
				{current === last ? m.wiki_live_play_again() : m.wiki_live_play()}
			{/if}
		</Button>
	</div>
</figure>
