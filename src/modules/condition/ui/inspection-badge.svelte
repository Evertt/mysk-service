<!--
	@component
	A unit's inspection status as the Connect page shows it (with checklists on): valid, expiring,
	expired, rejected; a dash without one.
-->
<script lang="ts">
	import EnumBadge from "#lib/components/enum-badge.svelte";
	import { type BadgeDisplay, labelled } from "#lib/i18n/index.ts";

	import type { InspectionState } from "../model.ts";

	let { status }: { status: string | null } = $props();

	const display = labelled({
		valid: { label: m.condition_inspection_valid, tone: "success" },
		expiring: { label: m.condition_inspection_expiring, tone: "warning" },
		rejected: { label: m.condition_inspection_rejected, tone: "warning" },
		expired: { label: m.condition_inspection_expired, tone: "danger" },
		none: { label: m.condition_inspection_none, tone: "neutral" },
	} satisfies Record<InspectionState, BadgeDisplay & { label: () => string }>);
	const known = $derived(
		status && status !== "none" && Object.hasOwn(display, status)
			? (status as InspectionState)
			: null,
	);
</script>

{#if known}
	<EnumBadge {display} value={known} data-inspection={known} />
{:else}
	<span class="text-muted-foreground">—</span>
{/if}
