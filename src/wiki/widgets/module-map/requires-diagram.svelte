<!--
	@component
	The modules that require another, or are required, drawn in rows by how deep their requirements
	go, each in its state: on, off, or dropped (switched on, but a module it requires is off). An
	arrow points from a module to one it requires (`data-requires`, `data-to`), dashed where that
	one is off.
-->
<script lang="ts">
	import type { ModuleId } from "#lib/modules/ids.ts";
	import { cn } from "#lib/utils.ts";
	import Diagram from "#wiki/parts/diagram.svelte";

	import {
		moduleEdges,
		type ModuleState,
		requiresDrawing,
		requiresLayout,
		requiresShape,
	} from "./module-map.ts";

	let {
		states,
		labelOf,
	}: {
		states: Record<ModuleId, ModuleState>;
		/** The module's name, translated when read. */
		labelOf: (id: ModuleId) => string;
	} = $props();

	const { width, nodeWidth, nodeHeight } = requiresDrawing;
	const { positions, height } = requiresLayout();
	const requires = moduleEdges().filter((edge) => edge.kind === "requires");

	const box: Record<ModuleState, string> = {
		on: "fill-primary/10 stroke-primary",
		off: "fill-muted stroke-muted-foreground",
		dropped: "fill-warning/10 stroke-warning",
	};
	const text: Record<ModuleState, string> = {
		on: "fill-foreground",
		off: "fill-muted-foreground",
		dropped: "fill-warning",
	};
</script>

<div class="mx-auto w-full max-w-[24rem] [&>svg]:my-0">
	<Diagram
		viewBox="0 0 {width} {height}"
		label="What requires what: a module is on only while every module it requires is on."
	>
		{#each requires as { from, to } (`${from}-${to}`)}
			{@const shape = requiresShape(positions.get(from)!, positions.get(to)!)}
			{@const broken = states[to] !== "on"}
			<g
				data-requires={from}
				data-to={to}
				class={cn(
					"motion-safe:transition-colors",
					broken ? "fill-warning stroke-warning" : "fill-muted-foreground stroke-muted-foreground",
				)}
			>
				<path
					d={shape.path}
					fill="none"
					stroke-width="1.75"
					stroke-dasharray={broken ? "5 4" : undefined}
				/>
				<polygon points={shape.head} stroke="none" />
			</g>
		{/each}
		{#each positions as [id, { x, y }] (id)}
			<g data-node={id} data-state={states[id]}>
				<rect
					x={x - nodeWidth / 2}
					y={y - nodeHeight / 2}
					width={nodeWidth}
					height={nodeHeight}
					rx={nodeHeight / 2}
					stroke-width="1.5"
					stroke-dasharray={states[id] === "on" ? undefined : "5 4"}
					class={cn("motion-safe:transition-colors", box[states[id]])}
				/>
				<text
					{x}
					{y}
					text-anchor="middle"
					dominant-baseline="central"
					font-size="14"
					font-weight="500"
					class={text[states[id]]}
				>
					{labelOf(id)}
				</text>
			</g>
		{/each}
	</Diagram>
</div>
