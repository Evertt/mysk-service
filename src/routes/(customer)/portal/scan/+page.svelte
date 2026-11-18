<!--
	The customer portal's Scan tab: the camera's QR scanner, full screen (`qr-scanner.svelte`). A
	unit's code opens its page, a location's the report of a breakdown there; a serial number typed
	in its place opens that unit's page.
-->
<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";

	import QrScanner from "../../../qr-scanner.svelte";

	/** Back where the scanner was opened from, or home when it was opened by its link. */
	function leave() {
		if (history.length > 1) history.back();
		else void goto(resolve("/(customer)/portal"));
	}
</script>

<svelte:head>
	<title>{m.common_scan_title()} · {m.client_title()}</title>
</svelte:head>

<QrScanner
	unitPath={(serial) => resolve("/(customer)/portal/equipment/[serial]", { serial })}
	onclose={leave}
/>
