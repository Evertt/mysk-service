<!--
	@component
	An engineer's profile on their page: how to reach them, their specialty, region and rate, when
	they were hired and whether they're active.
-->
<script lang="ts">
	import DetailItem from "#lib/components/detail-item.svelte";
	import EnumBadge from "#lib/components/enum-badge.svelte";
	import { formatCents, formatDate } from "#lib/i18n/index.ts";

	import { engineerSpecialtyDisplay, regionLabel } from "../display.ts";
	import type { getEngineer } from "../engineers.remote.ts";
	import ActiveBadge from "../ui/active-badge.svelte";

	let {
		engineer,
	}: {
		engineer: Awaited<ReturnType<typeof getEngineer>>["engineer"];
	} = $props();
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.engineers_profile()}</Card.Title>
	</Card.Header>
	<Card.Content class="flex flex-col gap-4">
		<!-- Full width, so email addresses don't wrap. -->
		<dl class="grid gap-4">
			<DetailItem
				label={m.engineers_field_email()}
				value={engineer.email}
				href={`mailto:${engineer.email}`}
			/>
		</dl>
		<dl class="grid grid-cols-2 gap-4">
			<DetailItem
				label={m.engineers_field_phone()}
				value={engineer.phone}
				href={`tel:${engineer.phone}`}
			/>
			<DetailItem label={m.engineers_field_specialty()}>
				<EnumBadge display={engineerSpecialtyDisplay} value={engineer.specialty} />
			</DetailItem>
			<DetailItem label={m.engineers_field_region()} value={regionLabel(engineer.region)} />
			<DetailItem
				label={m.engineers_field_hourly_rate()}
				value={formatCents(engineer.hourlyRate)}
			/>
			<DetailItem label={m.engineers_column_hired()} value={formatDate(engineer.hiredAt)} />
			<DetailItem label={m.engineers_column_status()}>
				<ActiveBadge active={engineer.active} />
			</DetailItem>
		</dl>
	</Card.Content>
</Card.Root>
