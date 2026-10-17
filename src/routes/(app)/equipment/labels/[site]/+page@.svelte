<!--
	A site's QR labels to print (`?location=12` for one location's, `?unit=SERIAL` for one unit's),
	on a page of its own: outside the app's shell (`@`), so it prints the labels and nothing else.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
	import PrinterIcon from "@lucide/svelte/icons/printer";

	import { LabelSheet } from "#lib/equipment/components.ts";
	import { getLabelSheet } from "#lib/equipment/remotes.ts";

	import type { PageProps } from "./$types";

	let { params }: PageProps = $props();

	const sheet = $derived(
		await getLabelSheet({
			site: params.site,
			location: page.url.searchParams.get("location") ?? undefined,
			unit: page.url.searchParams.get("unit") ?? undefined,
		}),
	);
	const count = $derived(sheet.locations.length + sheet.units.length);
</script>

<svelte:head>
	<title>{m.equipment_labels_title({ site: sheet.site.name })}</title>
</svelte:head>

<main class="mx-auto flex max-w-5xl flex-col gap-6 p-6 print:max-w-none print:p-0">
	<header class="flex flex-wrap items-start justify-between gap-4 print:hidden">
		<div class="flex flex-col gap-1">
			<h1 class="text-2xl font-semibold tracking-tight">
				{m.equipment_labels_title({ site: sheet.site.name })}
			</h1>
			<p class="text-sm text-muted-foreground">
				{sheet.site.customer.name} · {m.equipment_labels_count({ count })}
			</p>
		</div>
		<div class="flex gap-2">
			<Button
				variant="outline"
				href={resolve("/(app)/customers/[code]", { code: sheet.site.customer.code })}
			>
				<ArrowLeftIcon data-icon="inline-start" />
				{m.equipment_labels_back()}
			</Button>
			<Button onclick={() => window.print()} disabled={!count}>
				<PrinterIcon data-icon="inline-start" />
				{m.equipment_labels_print()}
			</Button>
		</div>
	</header>

	{#if count}
		<LabelSheet {sheet} />
	{:else}
		<Empty.Root class="border p-6">
			<Empty.Header>
				<Empty.Title>{m.equipment_labels_empty_title()}</Empty.Title>
				<Empty.Description>{m.equipment_labels_empty_description()}</Empty.Description>
			</Empty.Header>
		</Empty.Root>
	{/if}
</main>
