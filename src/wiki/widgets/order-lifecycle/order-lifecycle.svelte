<!--
	@component
	The order lifecycle, drawn from `orderTransitions` (`lifecycle-graph.ts`): every status, and the
	moves between them coloured by who makes them. Choosing a status lights up the moves that leave
	it (`data-active`; the office's moves by hand, dashed, are drawn only then) and dims the rest,
	and lists how an order leaves it and how it gets there, and who does each.
-->
<script lang="ts">
	import { label } from "#lib/i18n/index.ts";
	import { type OrderStatus, orderStatuses } from "#lib/models.ts";
	import type { OrderActor } from "#lib/orders/index.ts";
	import { cn } from "#lib/utils.ts";
	import Diagram from "#wiki/parts/diagram.svelte";

	import {
		actorLabels,
		edgeShape,
		edgesOf,
		type LifecycleEdge,
		lifecycleDrawing,
		lifecycleEdges,
		nodeWidth,
		statusLayout,
	} from "./lifecycle-graph.ts";

	const id = $props.id();
	const edges = lifecycleEdges();
	const { width, height, nodeHeight } = lifecycleDrawing;

	/** Each actor's colour, as a stroke, a fill and a line in the legend. */
	const tones: Record<OrderActor, { stroke: string; fill: string; line: string }> = {
		office: {
			stroke: "stroke-muted-foreground",
			fill: "fill-muted-foreground",
			line: "border-dashed border-muted-foreground",
		},
		planner: { stroke: "stroke-primary", fill: "fill-primary", line: "border-primary" },
		acceptance: { stroke: "stroke-info", fill: "fill-info", line: "border-info" },
		engineer: { stroke: "stroke-foreground", fill: "fill-foreground", line: "border-foreground" },
		invoicing: { stroke: "stroke-warning", fill: "fill-warning", line: "border-warning" },
	};

	let chosen = $state<OrderStatus | null>(null);

	const moves = $derived(chosen ? edgesOf(chosen, edges) : null);

	/** The order edges are drawn in: the dimmed at the bottom, the active on top. */
	const order = { dimmed: 0, idle: 1, incoming: 2, active: 3 };

	/** How an edge stands to the chosen status: leaving it, arriving at it, or neither. */
	const role = (edge: LifecycleEdge): keyof typeof order =>
		chosen === null
			? "idle"
			: edge.from === chosen
				? "active"
				: edge.to === chosen
					? "incoming"
					: "dimmed";

	/** The office's moves only around the chosen status (all of them at once are a tangle), the active on top. */
	const drawn = $derived(
		edges
			.filter(
				(edge) => edge.by !== "office" || role(edge) === "active" || role(edge) === "incoming",
			)
			.map((edge) => ({ edge, role: role(edge), shape: edgeShape(edge, edges) }))
			.sort((a, b) => order[a.role] - order[b.role]),
	);

	const percent = (value: number, of: number) => `${(value / of) * 100}%`;
</script>

{#snippet moveList(title: string, list: LifecycleEdge[], towards: "to" | "from")}
	<h4
		id="{id}-{towards}"
		class="mt-3 text-xs font-medium tracking-wide text-muted-foreground uppercase"
	>
		{title}
	</h4>
	{#if list.length}
		<ul aria-labelledby="{id}-{towards}" class="mt-1.5 space-y-1.5">
			{#each list as edge (`${edge.verb}-${edge.from}-${edge.to}`)}
				<li
					data-testid={`${towards === "to" ? "leaves" : "arrives"}-${edge.verb}-${edge[towards]}`}
					class="flex items-start gap-2 text-sm"
				>
					<span class={cn("mt-2 w-4 shrink-0 border-t-2", tones[edge.by].line)}></span>
					<span>
						<code class="rounded bg-muted px-1 py-0.5 font-mono text-xs">{edge.verb}</code>
						{towards === "to" ? "to" : "from"}
						<span class="font-medium">{label("orderStatus", edge[towards])}</span>,
						<span class="text-muted-foreground">by {actorLabels[edge.by]}</span>
					</span>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="mt-1.5 text-sm text-muted-foreground">Nothing.</p>
	{/if}
{/snippet}

<figure class="not-prose @container my-6 rounded-xl border bg-card p-3 text-card-foreground sm:p-4">
	<div class="grid gap-4 @xl:grid-cols-[minmax(0,1fr)_15rem]">
		<!-- Only as tall as the drawing (not the row), so the statuses placed in percent sit on it. -->
		<div class="relative mx-auto w-full max-w-[26rem] self-start [&>svg]:my-0">
			<Diagram
				viewBox="0 0 {width} {height}"
				label="The order lifecycle: its statuses, and the moves between them coloured by who makes them."
			>
				{#each drawn as { edge, role: edgeRole, shape } (`${edge.verb}-${edge.from}-${edge.to}`)}
					<g
						data-verb={edge.verb}
						data-from={edge.from}
						data-to={edge.to}
						data-active={edgeRole === "active" || undefined}
						data-incoming={edgeRole === "incoming" || undefined}
						class={cn(
							"motion-safe:transition-opacity",
							edgeRole === "dimmed" && "opacity-20",
							edgeRole === "incoming" && "opacity-60",
						)}
					>
						<path
							d={shape.path}
							fill="none"
							class={tones[edge.by].stroke}
							stroke-width={edgeRole === "active" ? 3 : 1.75}
							stroke-dasharray={edge.by === "office" ? "5 4" : undefined}
							stroke-linecap="round"
						/>
						<polygon points={shape.head} class={tones[edge.by].fill} />
						{#if shape.label}
							<text
								x={shape.label.x}
								y={shape.label.y}
								text-anchor={shape.label.anchor}
								dominant-baseline="middle"
								font-size="14"
								font-weight={edgeRole === "active" ? 600 : 500}
								paint-order="stroke"
								stroke-width="4"
								stroke-linejoin="round"
								class={cn(tones[edge.by].fill, "stroke-card")}
							>
								{edge.verb}
							</text>
						{/if}
					</g>
				{/each}
			</Diagram>
			{#each orderStatuses as status (status)}
				{@const place = statusLayout[status]}
				{@const w = nodeWidth(status)}
				<Button
					variant={chosen === status ? "default" : "outline"}
					aria-current={chosen === status ? "true" : undefined}
					class="absolute min-h-0 rounded-full px-2 py-0 text-xs leading-tight whitespace-normal shadow-xs"
					style="left: {percent(place.x - w / 2, width)}; top: {percent(
						place.y - nodeHeight / 2,
						height,
					)}; width: {percent(w, width)}; height: {percent(nodeHeight, height)}"
					onclick={() => (chosen = status)}
				>
					{label("orderStatus", status)}
				</Button>
			{/each}
		</div>

		<div class="flex min-w-0 flex-col gap-4 text-sm">
			<div aria-live="polite" class="@xl:min-h-24">
				{#if chosen && moves}
					<p class="font-medium">
						{label("orderStatus", chosen)}
						<code class="ml-1 rounded bg-muted px-1 py-0.5 font-mono text-xs font-normal"
							>{chosen}</code
						>
					</p>
					{@render moveList("Leaves by", moves.out, "to")}
					{@render moveList("Arrives by", moves.in, "from")}
				{:else}
					<p class="text-muted-foreground">
						Choose a status to see how an order leaves it, how it gets there, and who makes each
						move.
					</p>
				{/if}
			</div>
			<ul aria-label="Who makes a move" class="grid gap-1.5 text-xs text-muted-foreground">
				{#each Object.entries(actorLabels) as [actor, who] (actor)}
					<li class="flex items-center gap-2">
						<span class={cn("w-5 shrink-0 border-t-2", tones[actor as OrderActor].line)}></span>
						<span class="first-letter:uppercase">{who}</span>
					</li>
				{/each}
			</ul>
		</div>
	</div>
	<figcaption class="mt-3 text-xs text-muted-foreground">
		Drawn from <code class="font-mono">orderTransitions</code>; the office's moves by hand show
		around the status you choose.
	</figcaption>
</figure>
