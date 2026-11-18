<!--
	The engineer portal's QR scanner, full screen (`qr-scanner.svelte`), from the header's scan
	button: a unit's or location's code opens it in the portal; a serial number typed in its place
	opens that unit.
-->
<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";

	import QrScanner from "../../../qr-scanner.svelte";

	/** Back where the scanner was opened from, or to My work when it was opened by its link. */
	function leave() {
		if (history.length > 1) history.back();
		else void goto(resolve("/(field)/my"));
	}
</script>

<svelte:head>
	<title>{m.common_scan_title()} · {m.portal_title()}</title>
</svelte:head>

<QrScanner
	unitPath={(serial) => resolve("/(field)/my/equipment/[serial]", { serial })}
	onclose={leave}
/>
