<!--
	@component
	A dock drawn as the client's mockup has it, driven by its live state: the sectional door rises
	when it opens and comes down when it closes; the three-lamp beacon lights the lamp of the dock's
	state (red: do not enter, orange: wait for the lock, green: safe to load; none while it's
	free); the truck, with its carrier and plate, drives in when it checks in and out when it
	checks out; the Wheel-Lok shows green, with a blinking light, while it's locked; and Salvo's
	tag. The changes move (the door, the truck), but nothing loops but the Wheel-Lok's light and a
	slow glow of a red or orange lamp; with reduced motion nothing moves, and the states still show.
-->
<script lang="ts">
	import type { Beacon } from "../model.ts";

	interface Truck {
		carrier: string | null;
		plate: string | null;
	}

	let {
		label,
		doorOpen,
		locked,
		beacon,
		truck,
	}: {
		/** What the drawing shows, for screen readers, e.g. "DOCK 05: Laden, deur open". */
		label: string;
		doorOpen: boolean;
		locked: boolean;
		beacon: Beacon;
		/** The truck at the dock, if one is checked in. */
		truck: Truck | null;
	} = $props();

	const id = $props.id();

	// The truck that left is still drawn while it drives away.
	let lastTruck: Truck | null = null;
	const shownTruck = $derived.by(() => {
		if (truck) lastTruck = truck;
		return truck ?? lastTruck;
	});
	/** The carrier's name as painted on the trailer: its first word ("AMEX"). */
	const brand = $derived(
		(shownTruck?.carrier ?? "").split(/\s+/)[0]?.toUpperCase().slice(0, 10) ?? "",
	);

	const lamps = [
		{ beacon: "red", lit: "#f43f5e", dim: "#4c0519", y: 31 },
		{ beacon: "orange", lit: "#fbbf24", dim: "#451a03", y: 45 },
		{ beacon: "green", lit: "#34d399", dim: "#022c22", y: 59 },
	] as const;
</script>

<svg
	viewBox="0 0 400 160"
	class="block h-auto w-full overflow-hidden rounded-md border"
	role="img"
	aria-label={label}
	data-dock-drawing
	data-door={doorOpen ? "open" : "closed"}
	data-truck={truck ? "in" : "away"}
	data-lit={beacon}
	data-wheel-lok={locked ? "on" : "off"}
>
	<defs>
		<pattern id="{id}-ribs" width="12" height="12" patternUnits="userSpaceOnUse">
			<rect width="6" height="12" class="fill-slate-300 dark:fill-slate-700" />
		</pattern>
		<clipPath id="{id}-opening">
			<rect x="27" y="17" width="114" height="84" />
		</clipPath>
		<linearGradient id="{id}-glow" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color="#fde68a" stop-opacity="0" />
			<stop offset="1" stop-color="#fde68a" stop-opacity="0.45" />
		</linearGradient>
	</defs>

	<!-- The facade and the yard. -->
	<rect width="400" height="160" class="fill-slate-100 dark:fill-slate-900" />
	<rect width="400" height="108" class="fill-slate-200 dark:fill-slate-800" />
	<rect width="400" height="108" fill="url(#{id}-ribs)" opacity="0.7" />
	<rect y="150" width="400" height="10" class="fill-slate-400/60 dark:fill-slate-600/60" />

	<!-- The opening: dark inside, lit when the door is up. -->
	<rect x="24" y="14" width="120" height="90" rx="2" class="fill-slate-700 dark:fill-slate-950" />
	<rect x="27" y="17" width="114" height="84" class="fill-slate-900" />
	<rect
		x="27"
		y="61"
		width="114"
		height="40"
		fill="url(#{id}-glow)"
		class="glow"
		opacity={doorOpen ? 1 : 0}
	/>
	<!-- The sectional door, in panels, and its windows. -->
	<g clip-path="url(#{id}-opening)">
		<g class="door" style:transform={doorOpen ? "translateY(-78px)" : "translateY(0)"}>
			{#each { length: 8 } as _, i (i)}
				<rect
					x="27"
					y={17 + i * 10.5}
					width="114"
					height="9.5"
					class={i % 2
						? "fill-slate-300 dark:fill-slate-500"
						: "fill-slate-400 dark:fill-slate-600"}
				/>
			{/each}
			<rect x="37" y="30" width="40" height="8" rx="1" class="fill-slate-600/70" />
			<rect x="91" y="30" width="40" height="8" rx="1" class="fill-slate-600/70" />
		</g>
	</g>
	<!-- The bumpers. -->
	<rect x="20" y="100" width="10" height="10" class="fill-slate-800 dark:fill-slate-950" />
	<rect x="138" y="100" width="10" height="10" class="fill-slate-800 dark:fill-slate-950" />

	<!-- The beacon: three lamps, the state's lit. -->
	<rect x="155" y="22" width="18" height="46" rx="3" fill="#0f172a" />
	{#each lamps as lamp (lamp.beacon)}
		<circle
			cx="164"
			cy={lamp.y}
			r="5"
			fill={beacon === lamp.beacon ? lamp.lit : lamp.dim}
			class={beacon === lamp.beacon && lamp.beacon !== "green" ? "pulse" : ""}
			data-lamp={lamp.beacon}
			data-on={beacon === lamp.beacon}
		/>
	{/each}

	<!-- Salvo's tag. -->
	<rect x="342" y="8" width="50" height="15" rx="3" class="fill-white/85 dark:fill-slate-950/70" />
	<text
		x="367"
		y="18.5"
		text-anchor="middle"
		font-size="8"
		font-weight="700"
		letter-spacing="1"
		class="fill-slate-600 dark:fill-slate-300">SALVO</text
	>

	<!-- The truck: its trailer backed up to the door, the cab beyond. -->
	<g class="truck" style:transform={truck ? "translateX(0)" : "translateX(420px)"}>
		{#if shownTruck}
			<rect
				x="14"
				y="88"
				width="200"
				height="50"
				rx="2"
				class="fill-slate-600 dark:fill-slate-500"
			/>
			<text
				x="114"
				y="119"
				text-anchor="middle"
				font-size="17"
				font-weight="800"
				font-style="italic"
				fill="white">{brand}</text
			>
			<rect
				x="18"
				y="124"
				width="34"
				height="9"
				rx="1.5"
				fill="#facc15"
				stroke="#0f172a"
				stroke-width="0.6"
			/>
			<text x="35" y="131" text-anchor="middle" font-size="6.5" font-weight="700" fill="#0f172a"
				>{shownTruck.plate ?? ""}</text
			>
			<rect x="216" y="98" width="46" height="40" rx="5" fill="#f97316" />
			<rect x="238" y="104" width="20" height="13" rx="2" class="fill-slate-300" />
			<rect x="210" y="132" width="10" height="6" class="fill-slate-700" />
			{#each [44, 66, 188, 232, 252] as x (x)}
				<circle cx={x} cy="142" r="8" class="fill-slate-800 stroke-slate-500" stroke-width="2" />
			{/each}
			<!-- The Wheel-Lok at the rear wheel, and its light. -->
			<rect
				x="74"
				y="140"
				width="9"
				height="9"
				rx="1.5"
				class={locked ? "fill-success" : "fill-slate-400"}
			/>
			{#if locked}
				<circle cx="78.5" cy="134" r="2" fill="#34d399" class="blink" />
			{/if}
		{/if}
	</g>
</svg>

<style>
	.door {
		transition: transform 1.2s cubic-bezier(0.65, 0, 0.35, 1);
	}
	.glow {
		transition: opacity 1.2s ease;
	}
	.truck {
		transition: transform 1.4s cubic-bezier(0.22, 1, 0.36, 1);
	}
	.blink {
		animation: blink 1.2s steps(1, end) infinite;
	}
	.pulse {
		animation: pulse 2.4s ease-in-out infinite;
	}
	@keyframes blink {
		50% {
			opacity: 0.2;
		}
	}
	@keyframes pulse {
		50% {
			opacity: 0.55;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.door,
		.glow,
		.truck {
			transition: none;
		}
		.blink,
		.pulse {
			animation: none;
		}
	}
</style>
