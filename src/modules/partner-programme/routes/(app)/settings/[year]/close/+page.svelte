<script lang="ts">
	import { resolve } from "$app/paths";
	import type { RouteParams } from "$app/types";

	import PageHeader from "#lib/components/page-header.svelte";
	import { getClosePreview } from "#modules/partner-programme/close.remote.ts";
	import ClosePreview from "#modules/partner-programme/detail/close-preview.svelte";

	let {
		params,
	}: { params: RouteParams<"/(app)/(modules)/partner-programme/settings/[year]/close"> } = $props();

	// Not a year at all: the query refuses it.
	const year = $derived(Number(params.year));
	const preview = $derived(await getClosePreview(year));
</script>

<svelte:head>
	<title>{m.partners_close_title({ year: String(year) })} · {m.partners_title()}</title>
</svelte:head>

<PageHeader
	title={m.partners_close_title({ year: String(year) })}
	description={m.partners_close_description()}
	breadcrumbs={[
		{ label: m.partners_title(), href: resolve("/(app)/(modules)/partner-programme") },
		{
			label: m.partners_years_title(),
			href: resolve("/(app)/(modules)/partner-programme/settings"),
		},
		{
			label: String(year),
			href: resolve("/(app)/(modules)/partner-programme/settings/[year]", { year: String(year) }),
		},
		{ label: m.partners_years_close() },
	]}
/>

<ClosePreview {preview} />
