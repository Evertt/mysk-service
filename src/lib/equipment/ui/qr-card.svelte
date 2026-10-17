<!--
	@component
	A unit's or location's QR code on its page: the code that opens it when scanned (see `../qr.ts`),
	its link to copy, and a button to print its label.
-->
<script lang="ts">
	import { page } from "$app/state";
	import PrinterIcon from "@lucide/svelte/icons/printer";

	import QrCode from "#lib/components/qr-code.svelte";

	import { qrUrl } from "../qr.ts";

	let {
		token,
		name,
		printHref,
	}: {
		token: string;
		/** What it's the code of, e.g. the unit's name. */
		name: string;
		/** The label sheet with its label. */
		printHref: string;
	} = $props();

	const url = $derived(qrUrl(page.url.origin, token));
</script>

<Card.Root data-testid="qr-card">
	<Card.Header>
		<Card.Title>{m.equipment_qr_title()}</Card.Title>
		<Card.Description>{m.equipment_qr_description()}</Card.Description>
	</Card.Header>
	<Card.Content class="flex min-w-0 flex-col items-center gap-3">
		<QrCode value={url} label={m.equipment_qr_label({ name })} class="size-36 rounded-sm" />
		<a
			href={url}
			class="w-full truncate text-center font-mono text-xs text-muted-foreground hover:underline"
		>
			{url}
		</a>
		<Button variant="outline" size="sm" href={printHref}>
			<PrinterIcon data-icon="inline-start" />
			{m.equipment_qr_print()}
		</Button>
	</Card.Content>
</Card.Root>
