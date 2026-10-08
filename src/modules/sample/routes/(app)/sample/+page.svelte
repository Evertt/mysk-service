<script lang="ts">
	import { resolve } from "$app/paths";
	import type { RouteParams } from "$app/types";

	import { listSampleNotes } from "../../../sample.remote.js";

	let { data }: { data: { sampleLayout: string }; params: RouteParams<"/(app)/sample"> } = $props();

	const notes = $derived(await listSampleNotes());
</script>

<svelte:head>
	<title>{m.sample_title()}</title>
</svelte:head>

<h1 class="text-2xl font-semibold">{m.sample_title()}</h1>
{#if notes.length}
	<ul class="list-disc pl-6">
		{#each notes as note (note.id)}
			<li>
				<a href={resolve("/(app)/sample/[id]", { id: String(note.id) })} class="underline">
					{m.sample_note_for({ text: note.text, customer: note.customer })}
				</a>
			</li>
		{/each}
	</ul>
{:else}
	<p>{m.sample_empty()}</p>
{/if}
<span hidden data-layout={data.sampleLayout}></span>
