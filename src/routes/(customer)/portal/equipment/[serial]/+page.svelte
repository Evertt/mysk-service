<!--
	One of the customer's units in the portal, read-only: what scanning its QR code opens. The app
	bar names it and where it is; then a card of what it is and where, its status and the badges the tenant's modules add
	(`client.unit.badges`, e.g. its condition), and their facts in a grid (`client.unit.facts`, e.g.
	its inspection status and last maintenance); then "report a breakdown" of it, the page's main
	button; then links to more about it (its service history, a page of its own); then the modules'
	cards (`client.unit`, e.g. its completed inspections).
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
	import HistoryIcon from "@lucide/svelte/icons/history";
	import SirenIcon from "@lucide/svelte/icons/siren";

	import AppBar from "#lib/client/app-bar.svelte";
	import { unitBadges, unitFacts, unit as unitParts } from "#lib/client/extensions.ts";
	import { refreshOnRecordChange } from "#lib/components/activity/change-feed.svelte.ts";
	import { refreshOnActivity } from "#lib/components/activity/live-activity.svelte.ts";
	import EnumBadge from "#lib/components/enum-badge.svelte";
	import { unitLine, unitTitle, equipmentStatusDisplay } from "#lib/equipment/index.ts";
	import ExtensionSlot from "#lib/extensions/extension-slot.svelte";

	import { getPortalUnit } from "../../client.remote.ts";
	import type { PageProps } from "./$types";

	let { params }: PageProps = $props();

	const unit = $derived(await getPortalUnit(params.serial));
	const parts = $derived({ serialNumber: unit.serialNumber });

	// Live: the unit and its place (its history is its own page's).
	refreshOnRecordChange(
		() => ({ type: "equipment", id: unit.id }),
		() => getPortalUnit(params.serial).refresh(),
	);
	refreshOnActivity(() => getPortalUnit(params.serial).refresh(), {
		types: ["site", "location"],
	});
</script>

<AppBar
	title={unitTitle(unit)}
	subtitle={[unit.location, unit.site.name].filter(Boolean).join(" · ")}
	back={{ href: resolve("/(customer)/portal/equipment"), label: m.client_tab_equipment() }}
/>

<div class="flex flex-col gap-5" data-client-unit={unit.serialNumber}>
	<Card.Root class="rounded-xl">
		<Card.Content class="flex flex-col gap-4">
			<header class="flex flex-col gap-1">
				<p class="text-[0.9375rem]">
					{unitLine(unit, {
						category: unit.category,
						site: unit.site.name,
						location: unit.location,
					})}
				</p>
			</header>
			<div class="flex flex-wrap items-center gap-x-3 gap-y-2">
				<EnumBadge display={equipmentStatusDisplay} value={unit.status} />
				<ExtensionSlot point={unitBadges} props={parts} notice="inline" />
			</div>
			<ExtensionSlot
				point={unitFacts}
				props={parts}
				notice="inline"
				class="grid grid-cols-2 gap-4 border-t pt-4"
			/>
		</Card.Content>
	</Card.Root>

	<Button
		class="primary-action"
		href={`${resolve("/(customer)/portal/report")}?unit=${encodeURIComponent(unit.serialNumber)}`}
	>
		<SirenIcon data-icon="inline-start" />
		{m.client_report_this()}
	</Button>

	<!-- Links to more about the unit, a page each: room for its manuals and documents. -->
	<nav aria-label={m.client_unit_more()}>
		<!-- Its rows as tall as a tap, their text readable: set here, so each row stays plain. -->
		<Card.Root class="rounded-xl py-0">
			<ul
				class="flex flex-col divide-y [&_a]:min-h-14 [&_a]:py-3.5 [&_a_.text-sm]:text-[0.9375rem] [&_a_.text-xs]:text-[0.8125rem] [&_a_svg]:size-5"
			>
				<li>
					<a
						href={resolve("/(customer)/portal/equipment/[serial]/history", {
							serial: unit.serialNumber,
						})}
						class="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent"
						data-unit-link="history"
					>
						<HistoryIcon class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
						<span class="flex min-w-0 flex-1 flex-col">
							<span class="text-sm font-medium">{m.client_unit_history_link()}</span>
							<span class="truncate text-xs text-muted-foreground">
								{m.client_unit_history_description()}
							</span>
						</span>
						<ChevronRightIcon class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
					</a>
				</li>
			</ul>
		</Card.Root>
	</nav>

	<ExtensionSlot point={unitParts} props={parts} class="flex flex-col gap-5" />
</div>
