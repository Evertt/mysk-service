<script lang="ts">
	import { resolve } from "$app/paths";
	import type { RouteParams } from "$app/types";

	import PageHeader from "#lib/components/page-header.svelte";
	import RulesView from "#modules/partner-programme/detail/rules-view.svelte";
	import RulesForm from "#modules/partner-programme/form/rules-form.svelte";
	import { getYearRules } from "#modules/partner-programme/years.remote.ts";

	let { params }: { params: RouteParams<"/(app)/(modules)/partner-programme/settings/[year]"> } =
		$props();

	// Not a year at all: the query refuses it.
	const year = $derived(Number(params.year));
	const data = $derived(await getYearRules(year));
</script>

<PageHeader
	title={m.partners_rules_title({ year: String(year) })}
	description={data.setUp
		? m.partners_rules_description()
		: data.from
			? m.partners_rules_inherited({ year: String(data.from) })
			: m.partners_rules_none()}
	breadcrumbs={[
		{ label: m.partners_title(), href: resolve("/(app)/(modules)/partner-programme") },
		{
			label: m.partners_years_title(),
			href: resolve("/(app)/(modules)/partner-programme/settings"),
		},
		{ label: String(year) },
	]}
>
	{#snippet actions()}
		<Button
			variant="outline"
			href={resolve("/(app)/(modules)/partner-programme/settings/[year]/close", {
				year: String(year),
			})}
		>
			{m.partners_years_close()}
		</Button>
	{/snippet}
</PageHeader>

{#if data.canManage}
	{#key year}
		<RulesForm {year} rules={data.rules} />
	{/key}
{:else}
	<RulesView rules={data.rules} />
{/if}
