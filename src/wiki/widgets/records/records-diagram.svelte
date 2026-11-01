<!--
	@component
	How the records hang together: a customer has sites, a site has locations, a unit is at a site
	(and may be at one of its locations), and an order is for a customer and about some of its units.
	An engineer is assigned to orders. Drawn from the schema (`src/lib/server/db/schema/`): an arrow
	runs from the record that owns to the one that belongs to it; a dashed one is optional.
-->
<script lang="ts">
	import Diagram from "#wiki/parts/diagram.svelte";

	const id = $props.id();

	/** A record, drawn as a box: where its top left is, and its name (the app's own labels). */
	const boxes = [
		{ name: m.orders_column_customer, x: 150, y: 10, accent: true },
		{ name: m.equipment_column_site, x: 10, y: 100 },
		{ name: m.orders_column_order, x: 290, y: 100 },
		{ name: m.equipment_column_unit, x: 150, y: 190 },
		{ name: m.equipment_column_location, x: 10, y: 280 },
		{ name: m.engineers_column_engineer, x: 290, y: 280 },
	];

	const width = 100;
	const height = 36;

	/** An arrow from an owner to what belongs to it, as a path, with its label and where it sits. */
	const arrows = [
		{ d: "M150 28 H60 V100", label: m.wiki_records_sites, x: 105, y: 21, anchor: "middle" },
		{ d: "M250 28 H340 V100", label: m.wiki_records_orders, x: 295, y: 21, anchor: "middle" },
		{ d: "M200 46 V190", label: m.wiki_records_units, x: 207, y: 120, anchor: "start" },
		{ d: "M60 136 V280", label: m.wiki_records_locations, x: 67, y: 215, anchor: "start" },
		{
			d: "M110 118 H130 V208 H150",
			label: m.wiki_records_at_a_site,
			x: 68,
			y: 250,
			anchor: "start",
		},
		{
			d: "M110 298 H200 V226",
			label: m.wiki_records_optional,
			x: 155,
			y: 291,
			anchor: "middle",
			optional: true,
		},
		{ d: "M250 208 H270 V118 H290", label: m.wiki_records_about, x: 266, y: 168, anchor: "end" },
		{
			d: "M340 280 V136",
			label: m.wiki_records_assigned,
			x: 333,
			y: 245,
			anchor: "end",
			optional: true,
		},
	];
</script>

<Diagram viewBox="0 0 400 330" label={m.wiki_records_diagram()}>
	<defs>
		<marker
			id="{id}-head"
			viewBox="0 0 10 10"
			refX="9"
			refY="5"
			markerWidth="7"
			markerHeight="7"
			orient="auto-start-reverse"
		>
			<path d="M0 1 L9 5 L0 9 z" fill="var(--muted-foreground)" />
		</marker>
	</defs>

	{#each arrows as arrow (arrow.d)}
		<path
			d={arrow.d}
			fill="none"
			stroke="var(--muted-foreground)"
			stroke-width="1.5"
			stroke-dasharray={arrow.optional ? "5 4" : undefined}
			marker-end="url(#{id}-head)"
		/>
		<text x={arrow.x} y={arrow.y} text-anchor={arrow.anchor} fill="var(--muted-foreground)">
			{arrow.label()}
		</text>
	{/each}

	{#each boxes as box (box.x + "-" + box.y)}
		<rect
			x={box.x}
			y={box.y}
			{width}
			{height}
			rx="8"
			fill="var(--card)"
			stroke={box.accent ? "var(--primary)" : "var(--border)"}
			stroke-width={box.accent ? 2 : 1.5}
		/>
		<text
			x={box.x + width / 2}
			y={box.y + height / 2 + 4}
			text-anchor="middle"
			font-weight="600"
			fill="var(--foreground)"
		>
			{box.name()}
		</text>
	{/each}
</Diagram>
