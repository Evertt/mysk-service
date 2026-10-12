<!--
	@component
	A range filter's chosen values (`DateRangeFilter`, `NumberRangeFilter`), each with a button that
	takes it off; nothing while there are none.
-->
<script lang="ts">
	import XIcon from "@lucide/svelte/icons/x";

	let {
		values,
		onremove,
	}: {
		/** The values, by their token in the URL, with what they're called. */
		values: readonly { token: string; label: string }[];
		onremove: (token: string) => void;
	} = $props();
</script>

{#if values.length}
	<ul class="flex flex-wrap gap-1.5 border-b p-2" aria-label={m.common_table_range_chosen()}>
		{#each values as value (value.token)}
			<li>
				<Badge variant="secondary" class="h-6 gap-1 pr-0.5">
					<span class="max-w-48 truncate">{value.label}</span>
					<button
						type="button"
						class="rounded-sm p-0.5 hover:bg-background/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
						aria-label={m.common_table_range_remove({ value: value.label })}
						onclick={() => onremove(value.token)}
					>
						<XIcon class="size-3" />
					</button>
				</Badge>
			</li>
		{/each}
	</ul>
{/if}
