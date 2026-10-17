<!--
	@component
	Where a unit stands this year, as the mockup badges it: "2026 ✓" once a checklist of it was
	completed this year, "2026 open" while a draft is open, nothing otherwise.
-->
<script lang="ts">
	import type { YearState } from "../model.ts";

	let { state, year }: { state: YearState; year: number } = $props();
</script>

{#if state === "done"}
	<Badge variant="success" class="tabular-nums" data-year-state={state}>
		{m.checklists_year_badge_done({ year: String(year) })}
	</Badge>
{:else if state === "open"}
	<Badge variant="warning" class="tabular-nums" data-year-state={state}>
		{m.checklists_year_badge_open({ year: String(year) })}
	</Badge>
{/if}
