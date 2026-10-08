<script lang="ts">
	import { resolve } from "$app/paths";
	import type { RouteParams } from "$app/types";

	let {
		data,
		params,
	}: {
		data: { id: string; sampleLayout: string };
		params: RouteParams<"/(app)/sample/[id]">;
	} = $props();
</script>

<svelte:head>
	<title>{m.sample_detail_title({ id: params.id })}</title>
</svelte:head>

<h1 class="text-2xl font-semibold">{m.sample_detail_title({ id: data.id })}</h1>
<a href={resolve("/(app)/sample/[id]/pdf", { id: params.id })} class="underline">
	{m.sample_download()}
</a>
