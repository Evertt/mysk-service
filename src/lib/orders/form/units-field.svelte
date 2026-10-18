<!--
	@component
	The order form's units: which of the customer's units the order is about, in the order they're
	worked on. The chosen ones are listed in that order, each with buttons to move it up or down or
	take it off; "Add units" opens the customer's other units to tick, by site, with "all of this
	site" to take a site's units at once (the yearly inspection of every door). Each chosen unit is a
	ticked checkbox of the form's `equipmentIds`, so the form submits them in their order; none for
	a new installation or a survey.
-->
<script lang="ts">
	import type { RemoteFormField, RemoteFormIssue } from "$app/server";
	import ArrowDownIcon from "@lucide/svelte/icons/arrow-down";
	import ArrowUpIcon from "@lucide/svelte/icons/arrow-up";
	import CheckIcon from "@lucide/svelte/icons/check";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import XIcon from "@lucide/svelte/icons/x";

	import { unitLine, unitModel, unitTitle } from "#lib/equipment/index.ts";
	import { formatNumber } from "#lib/i18n/index.ts";
	import { cn } from "#lib/utils.ts";

	import { chosenUnitIds } from "./chosen-units.ts";

	interface Unit {
		id: number;
		name: string | null;
		manufacturer: string;
		model: string;
		serialNumber: string;
		location: string | null;
		site: { id: number; name: string };
	}

	let {
		field,
		units,
		initial = [],
		disabled = false,
	}: {
		field: RemoteFormField<string[]>;
		/** The chosen customer's units, by site. */
		units: readonly Unit[];
		/** The units of the order being edited, in their order. */
		initial?: readonly number[];
		/** Until a customer is chosen. */
		disabled?: boolean;
	} = $props();

	const id = $props.id();

	/** The chosen units' ids in their order: the form's, or the order's until it has any. */
	const chosen = $derived(chosenUnitIds(field.value() as string[] | undefined, initial));
	const byId = $derived(new Map(units.map((unit) => [unit.id, unit])));
	/** The chosen ones that are the customer's (another customer's go with a change of customer). */
	const listed = $derived(chosen.flatMap((unitId) => byId.get(unitId) ?? []));
	const sites = $derived(Map.groupBy(units, (unit) => unit.site.id));
	const issues = $derived(field.issues() as RemoteFormIssue[] | undefined);

	const choose = (ids: number[]) => field.set([...new Set(ids)].map(String));

	function toggle(unitId: number) {
		choose(
			chosen.includes(unitId) ? chosen.filter((other) => other !== unitId) : [...chosen, unitId],
		);
	}

	/** Adds a site's units that aren't chosen yet, after the chosen ones, or takes them all off. */
	function toggleSite(siteUnits: readonly Unit[]) {
		const ids = siteUnits.map((unit) => unit.id);
		const all = ids.every((unitId) => chosen.includes(unitId));
		choose(all ? chosen.filter((unitId) => !ids.includes(unitId)) : [...chosen, ...ids]);
	}

	function move(index: number, by: -1 | 1) {
		const next = listed.map((unit) => unit.id);
		const [unit] = next.splice(index, 1);
		next.splice(index + by, 0, unit);
		choose(next);
	}

	const where = (unit: Unit) => [unit.site.name, unit.location].filter(Boolean).join(" · ");
</script>

<Field.Field data-invalid={issues?.length ? true : undefined} class="md:col-span-2">
	<Field.FieldLabel id="{id}-label">{m.orders_field_units()}</Field.FieldLabel>
	{#if listed.length}
		<ol aria-labelledby="{id}-label" class="flex flex-col divide-y rounded-md border">
			{#each listed as unit, index (unit.id)}
				<li class="flex items-center gap-3 px-3 py-2 text-sm">
					<input {...field.as("checkbox", String(unit.id), true)} hidden />
					<span class="w-6 shrink-0 text-right text-muted-foreground tabular-nums">
						{formatNumber(index + 1)}
					</span>
					<div class="flex min-w-0 flex-1 flex-col">
						<span class="truncate font-medium">{unitTitle(unit)}</span>
						<span class="truncate text-xs text-muted-foreground">
							{[unit.name ? unitModel(unit) : null, unit.serialNumber, where(unit)]
								.filter(Boolean)
								.join(" · ")}
						</span>
					</div>
					<div class="flex shrink-0 items-center">
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							disabled={index === 0}
							aria-label={m.orders_unit_move_up({ unit: unitTitle(unit) })}
							onclick={() => move(index, -1)}
						>
							<ArrowUpIcon />
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							disabled={index === listed.length - 1}
							aria-label={m.orders_unit_move_down({ unit: unitTitle(unit) })}
							onclick={() => move(index, 1)}
						>
							<ArrowDownIcon />
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							aria-label={m.orders_unit_remove({ unit: unitTitle(unit) })}
							onclick={() => toggle(unit.id)}
						>
							<XIcon />
						</Button>
					</div>
				</li>
			{/each}
		</ol>
	{/if}
	<div class="flex flex-wrap items-center gap-3">
		<Popover.Root>
			<Popover.Trigger disabled={disabled || !units.length}>
				{#snippet child({ props })}
					<Button {...props} variant="outline" size="sm" class="self-start">
						<PlusIcon data-icon="inline-start" />
						{m.orders_units_add()}
					</Button>
				{/snippet}
			</Popover.Trigger>
			<Popover.Content class="w-80 p-0" align="start">
				<Command.Root>
					<Command.Input
						placeholder={m.orders_units_search()}
						aria-label={m.orders_units_search()}
					/>
					<Command.List>
						<Command.Empty>{m.common_table_filter_no_results()}</Command.Empty>
						{#each sites as [siteId, siteUnits] (siteId)}
							<Command.Group heading={siteUnits[0].site.name}>
								{#if siteUnits.length > 1}
									{@const all = siteUnits.every((unit) => chosen.includes(unit.id))}
									<Command.Item
										value="site-{siteId}"
										keywords={[siteUnits[0].site.name]}
										onSelect={() => toggleSite(siteUnits)}
									>
										{@render tick(all)}
										<span class="truncate font-medium">
											{m.orders_units_all_at({
												site: siteUnits[0].site.name,
												count: formatNumber(siteUnits.length),
											})}
										</span>
									</Command.Item>
								{/if}
								{#each siteUnits as unit (unit.id)}
									<Command.Item
										value="unit-{unit.id}"
										keywords={[unitLine(unit), unit.location ?? ""]}
										onSelect={() => toggle(unit.id)}
									>
										{@render tick(chosen.includes(unit.id))}
										<div class="flex min-w-0 flex-col">
											<span class="truncate">{unitTitle(unit)}</span>
											<span class="truncate text-xs text-muted-foreground">
												{[unit.serialNumber, unit.location].filter(Boolean).join(" · ")}
											</span>
										</div>
									</Command.Item>
								{/each}
							</Command.Group>
						{/each}
					</Command.List>
				</Command.Root>
			</Popover.Content>
		</Popover.Root>
		{#if listed.length > 1}
			<Button type="button" variant="ghost" size="sm" onclick={() => choose([])}>
				{m.orders_units_clear()}
			</Button>
		{/if}
	</div>
	<Field.FieldDescription>
		{disabled
			? m.orders_equipment_customer_first()
			: listed.length
				? m.common_count_units({ count: listed.length })
				: m.orders_units_none()}
	</Field.FieldDescription>
	<Field.FieldError errors={issues} />
</Field.Field>

{#snippet tick(on: boolean)}
	<div
		class={cn(
			"flex size-4 shrink-0 items-center justify-center rounded-[4px] border",
			on ? "border-primary bg-primary text-primary-foreground" : "border-input [&_svg]:invisible",
		)}
	>
		<CheckIcon class="size-3.5" />
	</div>
{/snippet}
