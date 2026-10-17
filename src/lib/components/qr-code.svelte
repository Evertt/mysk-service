<!--
	@component
	A QR code of `value` (e.g. a unit's `/q/<token>` URL), as an SVG that scales to its box: black
	on white with the quiet zone scanners need, also in dark mode and in print.
-->
<script lang="ts">
	import { QR_MARGIN, qrPath } from "./qr-code.ts";

	let {
		value,
		label,
		class: className,
	}: {
		value: string;
		/** What the code is for, for screen readers, e.g. "QR code of Deur D-17". */
		label: string;
		class?: string;
	} = $props();

	const code = $derived(qrPath(value));
	const box = $derived(code.size + 2 * QR_MARGIN);
</script>

<svg
	viewBox="{-QR_MARGIN} {-QR_MARGIN} {box} {box}"
	role="img"
	aria-label={label}
	shape-rendering="crispEdges"
	class={className}
	data-qr={value}
>
	<rect x={-QR_MARGIN} y={-QR_MARGIN} width={box} height={box} fill="#fff" />
	<path d={code.d} fill="#000" />
</svg>
