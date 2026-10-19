<!--
	@component
	What closing a year freezes, partner by partner: the level, Partner Omzet, Bonus Omzet and the
	bonus in each form, as they are now (or as they were closed), and, for a manager once the year is
	over, the close itself, after asking.
-->
<script lang="ts">
	import { toast } from "svelte-sonner";

	import SubmitButton from "#lib/components/form/submit-button.svelte";
	import { submitted } from "#lib/components/form/submitted.ts";
	import { CustomerLink } from "#lib/customers/components.ts";
	import { formatCents, formatDate } from "#lib/i18n/index.ts";

	import { closeProgrammeYear, type getClosePreview } from "../close.remote.ts";
	import { formatEuros } from "../display.ts";
	import LevelBadge from "../ui/level-badge.svelte";

	let { preview }: { preview: Awaited<ReturnType<typeof getClosePreview>> } = $props();

	let open = $state(false);
	const rows = $derived(
		preview.partners.map((partner) => {
			const { closed, figures } = partner;
			return {
				id: partner.id,
				code: partner.code,
				name: partner.name,
				level: closed ? closed.level : (figures?.level?.level ?? null),
				revenue: closed ? closed.partnerRevenue : (figures?.partnerRevenue ?? 0),
				bonusRevenue: closed ? closed.bonusRevenueCash : (figures?.bonusRevenue.cash ?? 0),
				cash: closed ? closed.cashAmount : (figures?.bonus.cash ?? 0),
				credit: closed ? closed.creditAmount : (figures?.bonus.credit ?? 0),
				closedAt: closed?.finalisedAt ?? null,
			};
		}),
	);
	const waiting = $derived(rows.filter((row) => !row.closedAt));
	const totals = $derived({
		cash: waiting.reduce((sum, row) => sum + row.cash, 0),
		credit: waiting.reduce((sum, row) => sum + row.credit, 0),
	});
</script>

<div class="flex flex-col gap-6">
	{#if !preview.rules}
		<p class="text-sm text-muted-foreground">
			{m.partners_no_rules({ year: String(preview.year) })}
		</p>
	{:else if !preview.closable}
		<p class="text-sm text-muted-foreground">
			{m.partners_close_not_over({ year: String(preview.year) })}
		</p>
	{/if}

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.partners_close_partners({ count: rows.length })}</Card.Title>
			<Card.Description>
				{waiting.length
					? m.partners_close_open({
							count: waiting.length,
							cash: formatCents(totals.cash),
							credit: formatCents(totals.credit),
						})
					: m.partners_close_all_closed()}
			</Card.Description>
			{#if preview.canManage && preview.closable && preview.rules && waiting.length}
				<Card.Action>
					<AlertDialog.Root bind:open>
						<AlertDialog.Trigger>
							{#snippet child({ props })}
								<Button {...props}
									>{m.partners_close_confirm({ year: String(preview.year) })}</Button
								>
							{/snippet}
						</AlertDialog.Trigger>
						<AlertDialog.Content>
							<AlertDialog.Header>
								<AlertDialog.Title>
									{m.partners_close_confirm_title({ year: String(preview.year) })}
								</AlertDialog.Title>
								<AlertDialog.Description>
									{m.partners_close_confirm_description({ count: waiting.length })}
								</AlertDialog.Description>
							</AlertDialog.Header>
							<form
								{...closeProgrammeYear.enhance(async ({ submit }) => {
									if (await submitted(submit)) {
										open = false;
										toast.success(m.partners_closed({ year: String(preview.year) }));
									}
								})}
							>
								<input {...closeProgrammeYear.fields.year.as("hidden", String(preview.year))} />
								<Field.FieldError errors={closeProgrammeYear.fields.allIssues()} class="mb-4" />
								<AlertDialog.Footer>
									<AlertDialog.Cancel type="button">{m.common_cancel()}</AlertDialog.Cancel>
									<SubmitButton pending={closeProgrammeYear.pending}>
										{m.partners_close_confirm({ year: String(preview.year) })}
									</SubmitButton>
								</AlertDialog.Footer>
							</form>
						</AlertDialog.Content>
					</AlertDialog.Root>
				</Card.Action>
			{/if}
		</Card.Header>
		<Card.Content>
			{#if rows.length}
				<Table.Root data-close-preview>
					<Table.Header>
						<Table.Row>
							<Table.Head>{m.partners_column_partner()}</Table.Head>
							<Table.Head>{m.partners_column_level()}</Table.Head>
							<Table.Head class="text-right">{m.partners_partner_revenue()}</Table.Head>
							<Table.Head class="text-right">{m.partners_bonus_revenue()}</Table.Head>
							<Table.Head class="text-right">{m.partners_form_cash()}</Table.Head>
							<Table.Head class="text-right">{m.partners_form_credit()}</Table.Head>
							<Table.Head>{m.partners_column_closed()}</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each rows as row (row.id)}
							<Table.Row data-partner={row.code}>
								<Table.Cell><CustomerLink name={row.name} code={row.code} withCode /></Table.Cell>
								<Table.Cell><LevelBadge level={row.level} /></Table.Cell>
								<Table.Cell class="text-right tabular-nums">{formatEuros(row.revenue)}</Table.Cell>
								<Table.Cell class="text-right tabular-nums"
									>{formatEuros(row.bonusRevenue)}</Table.Cell
								>
								<Table.Cell class="text-right tabular-nums">{formatCents(row.cash)}</Table.Cell>
								<Table.Cell class="text-right tabular-nums">{formatCents(row.credit)}</Table.Cell>
								<Table.Cell class="text-muted-foreground">
									{row.closedAt ? formatDate(row.closedAt) : m.partners_column_open()}
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			{:else}
				<Empty.Root class="p-6">
					<Empty.Header>
						<Empty.Title>{m.partners_empty()}</Empty.Title>
					</Empty.Header>
				</Empty.Root>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
