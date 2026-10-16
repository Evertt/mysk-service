<!--
	@component
	When a plan's next visit is due (or a unit's next maintenance), badged when it's overdue; a dash
	when there's none.
-->
<script lang="ts">
	import { formatDate } from "#lib/i18n/index.ts";

	import { isOverdue } from "../model.ts";

	let {
		value,
		badge = true,
	}: {
		value: Temporal.PlainDate | null;
		/** Whether to badge it when it's overdue (not for a paused plan, say). */
		badge?: boolean;
	} = $props();
</script>

{#if value}
	<span class="inline-flex items-center gap-2 whitespace-nowrap tabular-nums">
		{formatDate(value)}
		{#if badge && isOverdue(value)}
			<Badge variant="danger" data-overdue>{m.maintenance_overdue()}</Badge>
		{/if}
	</span>
{:else}
	<span class="text-muted-foreground">—</span>
{/if}
