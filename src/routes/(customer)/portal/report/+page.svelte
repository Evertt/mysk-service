<!--
	Report a breakdown ("Storing melden"), as a phone app's form: the unit (by its site), what kind of
	fault it is ("Wat is er aan de hand?", optional), what's wrong, photos of it (optional, shrunk
	before they're sent) and how urgent it is, the top urgency in the portal's words ("Stilstand"),
	each under a small label, and "Send report" at the foot, in reach while the form scrolls. A
	unit's QR code (or its page) leads here with the unit filled in (`?unit=<serial>`), named under
	the app bar's title instead of a field to choose it; a location's with its units to choose from
	(`?location=<id>`). One the contact doesn't see is a 404. The order it makes awaits a planner's
	acceptance.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import SendIcon from "@lucide/svelte/icons/send";

	import AppBar from "#lib/client/app-bar.svelte";
	import FilterChips from "#lib/components/filter-chips.svelte";
	import SelectField from "#lib/components/form/select-field.svelte";
	import SubmitButton from "#lib/components/form/submit-button.svelte";
	import TextField from "#lib/components/form/text-field.svelte";
	import { unitTitle } from "#lib/equipment/index.ts";
	import { label } from "#lib/i18n/index.ts";
	import { type ReportFault, reportFaults, reportUrgencies } from "#lib/models.ts";
	import { PhotoPicker } from "#lib/orders/components.ts";

	import {
		getPortalLocation,
		getPortalSites,
		getPortalUnit,
		reportBreakdown,
	} from "../client.remote.ts";
	import { portalPriority } from "../urgency.ts";

	const serial = $derived(page.url.searchParams.get("unit"));
	const locationParam = $derived(page.url.searchParams.get("location"));
	/** Whether a scanned QR code led here (`?via=qr`, `qrDestination()`): kept with the report. */
	const via = $derived(page.url.searchParams.get("via") === "qr" ? "qr" : "portal");

	// With a scanned unit's or location's: a 404 when it isn't the contact's to see.
	const [sites, scanned, place] = $derived(
		await Promise.all([
			getPortalSites(),
			serial ? getPortalUnit(serial) : null,
			locationParam ? getPortalLocation(locationParam) : null,
		]),
	);
	const location = $derived(place ? place.location : null);

	const sitesWithUnits = $derived(sites.filter((site) => site.units.length));
	let chosenSite = $derived(
		String(
			scanned?.site.id ?? location?.site.id ?? (sitesWithUnits.length ? sitesWithUnits[0].id : ""),
		),
	);
	const units = $derived(
		(sites.find((site) => String(site.id) === chosenSite)?.units ?? []).filter(
			(unit) => !location || unit.locationId === location.id,
		),
	);
	const unitOptions = $derived(
		units.map((unit) => ({
			value: String(unit.id),
			label: unit.location ? `${unitTitle(unit)} · ${unit.location}` : unitTitle(unit),
		})),
	);

	/** What the report is of, under the app bar's title: the unit, or the location. */
	const subtitle = $derived(
		scanned
			? unitTitle(scanned)
			: location
				? m.client_report_at_location({ location: location.name, site: location.site.name })
				: null,
	);
	/** Back to the unit's page from its report, else home. */
	const back = $derived(
		scanned
			? {
					href: resolve("/(customer)/portal/equipment/[serial]", { serial: scanned.serialNumber }),
					label: unitTitle(scanned),
				}
			: { href: resolve("/(customer)/portal"), label: m.client_nav_home() },
	);

	type ReportUrgency = (typeof reportUrgencies)[number];

	const urgencyDescription: Record<ReportUrgency, () => string> = {
		normal: m.client_urgency_normal_description,
		high: m.client_urgency_high_description,
		urgent: m.client_urgency_urgent_description,
	};

	const fields = $derived(reportBreakdown.fields);

	/** The kind of fault chosen with the chips, if any. */
	let fault = $state<ReportFault | null>(null);
	/** How urgent it is: always one, normal at first. */
	let urgency = $state<ReportUrgency>("normal");
</script>

<AppBar title={m.client_report_title()} {subtitle} {back} />

{#if sitesWithUnits.length}
	<form
		{...reportBreakdown}
		enctype="multipart/form-data"
		class="flex flex-1 flex-col gap-6"
		novalidate
		data-scanned-unit={scanned?.serialNumber}
		data-scanned-location={location?.id}
	>
		<input {...fields.via.as("hidden", via)} />
		{#if scanned}
			<input {...fields.unitId.as("hidden", String(scanned.id))} />
		{:else}
			{#if !location && sitesWithUnits.length > 1}
				<Field.Field>
					<Field.FieldLabel for="report-site">{m.client_report_site()}</Field.FieldLabel>
					<NativeSelect.Root id="report-site" class="w-full" bind:value={chosenSite}>
						{#each sitesWithUnits as site (site.id)}
							<NativeSelect.Option value={String(site.id)}>{site.name}</NativeSelect.Option>
						{/each}
					</NativeSelect.Root>
				</Field.Field>
			{/if}
			<SelectField
				field={fields.unitId}
				label={m.client_report_unit()}
				options={unitOptions}
				placeholder={m.client_report_unit_placeholder()}
			/>
		{/if}

		<Field.Field data-invalid={fields.fault.issues()?.length ? true : undefined}>
			<p class="section-label" aria-hidden="true">{m.client_report_fault()}</p>
			<FilterChips
				label={m.client_report_fault()}
				options={reportFaults.map((each) => ({
					value: each,
					label: label("reportFault", each),
				}))}
				value={fault}
				onchange={(chosen) => (fault = reportFaults.find((each) => each === chosen) ?? null)}
				data-report-faults
			/>
			{#if fault}
				<input {...fields.fault.as("hidden", fault)} />
			{/if}
			<Field.FieldError errors={fields.fault.issues()} />
		</Field.Field>

		<TextField
			field={fields.description}
			label={m.client_report_what()}
			placeholder={m.client_report_what_placeholder()}
			multiline
		/>

		<PhotoPicker field={fields.photos} />

		<Field.Field data-invalid={fields.urgency.issues()?.length ? true : undefined}>
			<p class="section-label" aria-hidden="true">{m.client_report_urgency()}</p>
			<FilterChips
				label={m.client_report_urgency()}
				options={reportUrgencies.map((each) => ({ value: each, label: portalPriority(each) }))}
				value={urgency}
				onchange={(chosen) =>
					(urgency = reportUrgencies.find((each) => each === chosen) ?? urgency)}
				data-report-urgency
			/>
			<input {...fields.urgency.as("hidden", urgency)} />
			<p class="text-sm text-muted-foreground" data-urgency-description>
				{urgencyDescription[urgency]()}
			</p>
			<Field.FieldError errors={fields.urgency.issues()} />
		</Field.Field>

		<!-- At the foot, over the tab bar, in reach while the form scrolls. -->
		<div
			class="sticky bottom-(--tab-bar-height) z-10 -mx-4 mt-auto flex flex-col gap-2 bg-gradient-to-t from-background from-70% to-transparent px-4 pt-4 pb-3"
		>
			<Field.FieldError errors={fields.issues()} />
			<SubmitButton pending={reportBreakdown.pending} icon={SendIcon} class="primary-action">
				{m.client_report_submit()}
			</SubmitButton>
		</div>
	</form>
{:else}
	<Empty.Root class="rounded-xl border bg-card">
		<Empty.Header>
			<Empty.Title>{m.client_no_units()}</Empty.Title>
			<Empty.Description>{m.client_no_units_description()}</Empty.Description>
		</Empty.Header>
	</Empty.Root>
{/if}
