<script lang="ts">
	import { resolve } from "$app/paths";
	import PlusIcon from "@lucide/svelte/icons/plus";

	import PageHeader from "#lib/components/page-header.svelte";
	import { EngineersTable } from "#lib/engineers/components.ts";
	import { getEngineers } from "#lib/engineers/remotes.ts";
</script>

<PageHeader title={m.engineers_title()} description={m.engineers_description()}>
	{#snippet actions()}
		<Button href={resolve("/(app)/engineers/new")}>
			<PlusIcon data-icon="inline-start" />
			{m.engineers_new()}
		</Button>
	{/snippet}
</PageHeader>

<EngineersTable engineers={await getEngineers()} />
