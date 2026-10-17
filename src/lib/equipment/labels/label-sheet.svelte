<!--
	@component
	A sheet of QR labels to print and stick on: one for each location (its name and site) and each
	unit (its name, make, serial number and location). Printed, they're A4's 3 × 8 labels of 70 ×
	37 mm, as on the common sticker sheets: the page that shows it prints nothing else.
-->
<script lang="ts">
	import { page } from "$app/state";

	import QrCode from "#lib/components/qr-code.svelte";

	import { unitModel, unitTitle } from "../display.ts";
	import { qrUrl } from "../qr.ts";
	import type { getLabelSheet } from "./labels.remote.ts";

	let { sheet }: { sheet: Awaited<ReturnType<typeof getLabelSheet>> } = $props();

	const site = $derived(
		sheet.site.name.includes(sheet.site.city)
			? sheet.site.name
			: `${sheet.site.name}, ${sheet.site.city}`,
	);
</script>

<div class="label-sheet" data-testid="label-sheet">
	{#each sheet.locations as location (location.id)}
		<article class="label" data-label="location">
			<QrCode
				value={qrUrl(page.url.origin, location.qrToken)}
				label={m.equipment_qr_label({ name: location.name })}
				class="label-code"
			/>
			<div class="label-text">
				<span class="label-kind">{m.equipment_labels_location()}</span>
				<strong class="label-title">{location.name}</strong>
				<span>{sheet.site.customer.name}</span>
				<span>{site}</span>
			</div>
		</article>
	{/each}
	{#each sheet.units as unit (unit.id)}
		<article class="label" data-label="unit">
			<QrCode
				value={qrUrl(page.url.origin, unit.qrToken)}
				label={m.equipment_qr_label({ name: unitTitle(unit) })}
				class="label-code"
			/>
			<div class="label-text">
				<strong class="label-title">{unitTitle(unit)}</strong>
				{#if unit.name}
					<span>{unitModel(unit)}</span>
				{/if}
				<span class="label-serial">{unit.serialNumber}</span>
				{#if unit.location}
					<span>{unit.location.name}</span>
				{/if}
			</div>
		</article>
	{/each}
</div>

<style>
	.label-sheet {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr));
		gap: 0.75rem;
	}

	.label {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem;
		overflow: hidden;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: #fff;
		color: #000;
	}

	.label :global(.label-code) {
		flex-shrink: 0;
		width: 7rem;
		height: 7rem;
	}

	.label-text {
		display: flex;
		min-width: 0;
		flex-direction: column;
		gap: 0.125rem;
		font-size: 0.8125rem;
		line-height: 1.25;
		overflow-wrap: anywhere;
	}

	.label-title {
		font-size: 0.9375rem;
	}

	.label-kind {
		font-size: 0.6875rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.label-serial {
		font-family: var(--font-mono, ui-monospace, monospace);
	}

	@media print {
		/* On A4 sticker sheets of 3 × 8, from the sheet's top left corner. */
		@page {
			size: A4;
			margin: 0;
		}

		.label-sheet {
			grid-template-columns: repeat(3, 70mm);
			grid-auto-rows: 37.125mm;
			gap: 0;
			width: 210mm;
		}

		.label {
			gap: 2.5mm;
			padding: 3mm;
			border: none;
			border-radius: 0;
			break-inside: avoid;
		}

		.label :global(.label-code) {
			width: 31mm;
			height: 31mm;
		}

		.label-text {
			font-size: 8pt;
		}

		.label-title {
			font-size: 9.5pt;
		}

		.label-kind {
			font-size: 6.5pt;
		}
	}
</style>
