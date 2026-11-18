<!--
	@component
	A site on the sites overview: its name (a link to its page, over the whole card), its address
	and units, whether it needs attention, its chips (`SiteChips`) and a link to its report. A site
	needing attention has a bar in the tone of its worst chip down its side. `data-site-card` is its
	id and `data-attention` whether it needs attention, for tests.
-->
<script lang="ts">
	import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
	import FileTextIcon from "@lucide/svelte/icons/file-text";

	import { siteAddressLine } from "../address.ts";
	import type { SiteFigure } from "../extensions.ts";
	import { chipsOf } from "./figures.ts";
	import SiteChips from "./site-chips.svelte";

	let {
		site,
		href,
		reportHref,
	}: {
		site: {
			id: number;
			name: string;
			address: string;
			postalCode: string;
			city: string;
			units: number;
			figures: readonly SiteFigure[];
		};
		/** The site's page. */
		href: string;
		/** The site's report. */
		reportHref: string;
	} = $props();

	/** The tone of its worst chip, if that asks for attention. */
	const worst = $derived.by(() => {
		const tone = chipsOf(site.figures)[0]?.chip;
		return tone === "danger" || tone === "warning" ? tone : null;
	});
</script>

<Card.Root
	class={[
		"relative gap-3 py-4 transition-shadow hover:shadow-md",
		worst === "danger" && "border-l-4 border-l-destructive",
		worst === "warning" && "border-l-4 border-l-warning",
	]}
	data-site-card={site.id}
	data-attention={worst !== null}
>
	<Card.Header class="px-4">
		<Card.Title class="text-base leading-snug">
			<a
				{href}
				class="outline-none after:absolute after:inset-0 after:rounded-[inherit] focus-visible:underline"
			>
				{site.name}
			</a>
		</Card.Title>
		<Card.Description>
			{siteAddressLine(site)}
			<span class="whitespace-nowrap">· {m.common_count_units({ count: site.units })}</span>
		</Card.Description>
		<Card.Action>
			{#if worst}
				<Badge variant={worst}>{m.customers_overview_needs_attention()}</Badge>
			{:else}
				<Badge variant="success">{m.customers_overview_fine()}</Badge>
			{/if}
		</Card.Action>
	</Card.Header>
	<Card.Content class="px-4">
		<SiteChips figures={site.figures} />
	</Card.Content>
	<Card.Footer class="relative z-10 justify-between gap-2 px-4">
		<Button variant="outline" href={reportHref} data-site-report>
			<FileTextIcon data-icon="inline-start" />
			{m.customers_overview_report()}
		</Button>
		<ChevronRightIcon class="size-5 text-muted-foreground" aria-hidden="true" />
	</Card.Footer>
</Card.Root>
