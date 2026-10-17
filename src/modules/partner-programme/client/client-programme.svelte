<!--
	@component
	The programme as a partner reads it in the customer portal: the year's levels with their
	percentages and what the bonus is at each threshold, the revenue that counts ("Omzet die
	meetelt"), the year's cycle and the conditions in short.
-->
<script lang="ts">
	import { formatCents } from "#lib/i18n/index.ts";

	import { formatEuros, formatRate } from "../display.ts";
	import { partnerLabels } from "../labels.ts";
	import { atRate, type CategoryRule, type Tier } from "../model.ts";

	let {
		rules,
	}: { rules: { tiers: Tier[]; categories: CategoryRule[]; creditValidYears: number } } = $props();

	const cycle = $derived([
		m.partners_client_cycle_build(),
		m.partners_client_cycle_close(),
		m.partners_client_cycle_spend(),
		m.partners_client_cycle_expire(),
	]);
	const conditions = $derived([
		[m.partners_client_terms_participation_title(), m.partners_client_terms_participation()],
		[m.partners_client_terms_revenue_title(), m.partners_client_terms_revenue()],
		[m.partners_client_terms_level_title(), m.partners_client_terms_level()],
		[m.partners_client_terms_projects_title(), m.partners_client_terms_projects()],
		[m.partners_client_terms_choice_title(), m.partners_client_terms_choice()],
		[m.partners_client_terms_cash_title(), m.partners_client_terms_cash()],
		[m.partners_client_terms_credit_title(), m.partners_client_terms_credit()],
		[m.partners_client_terms_validity_title(), m.partners_client_terms_validity()],
		[m.partners_client_terms_changes_title(), m.partners_client_terms_changes()],
	]);
</script>

<Card.Root data-client-tiers>
	<Card.Header>
		<Card.Title>{m.partners_rules_levels()}</Card.Title>
		<Card.Description>{m.partners_client_levels_description()}</Card.Description>
	</Card.Header>
	<Card.Content>
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>{m.partners_column_threshold()}</Table.Head>
					<Table.Head>{m.partners_column_level()}</Table.Head>
					<Table.Head class="text-right">{m.partners_column_cash_rate()}</Table.Head>
					<Table.Head class="text-right">{m.partners_column_cash_at()}</Table.Head>
					<Table.Head class="text-right">{m.partners_column_credit_rate()}</Table.Head>
					<Table.Head class="text-right">{m.partners_column_credit_at()}</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each rules.tiers as tier (tier.level)}
					<Table.Row data-tier={tier.level}>
						<Table.Cell class="tabular-nums">{formatEuros(tier.threshold)}</Table.Cell>
						<Table.Cell class="font-medium">{tier.level}</Table.Cell>
						<Table.Cell class="text-right tabular-nums">{formatRate(tier.cashRate)}</Table.Cell>
						<Table.Cell class="text-right tabular-nums">
							{formatCents(atRate(tier.threshold, tier.cashRate))}
						</Table.Cell>
						<Table.Cell class="text-right tabular-nums">{formatRate(tier.creditRate)}</Table.Cell>
						<Table.Cell class="text-right tabular-nums">
							{formatCents(atRate(tier.threshold, tier.creditRate))}
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
		<p class="mt-3 text-xs text-muted-foreground">{m.partners_client_levels_note()}</p>
	</Card.Content>
</Card.Root>

<Card.Root data-client-categories>
	<Card.Header>
		<Card.Title>{m.partners_field_categories()}</Card.Title>
		<Card.Description>{m.partners_client_categories_description()}</Card.Description>
	</Card.Header>
	<Card.Content>
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>{m.partners_field_category()}</Table.Head>
					<Table.Head>{m.partners_column_counts_level()}</Table.Head>
					<Table.Head>{m.partners_form_cash()}</Table.Head>
					<Table.Head>{m.partners_form_credit()}</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each rules.categories as rule (rule.category)}
					<Table.Row>
						<Table.Cell>{partnerLabels.label("revenueCategory", rule.category)}</Table.Cell>
						<Table.Cell>{rule.level ? m.partners_rule_yes() : m.partners_rule_no()}</Table.Cell>
						<Table.Cell>{partnerLabels.label("categoryRule", rule.cash)}</Table.Cell>
						<Table.Cell>{partnerLabels.label("categoryRule", rule.credit)}</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
		<p class="mt-3 text-xs text-muted-foreground">{m.partners_client_categories_note()}</p>
	</Card.Content>
</Card.Root>

<Card.Root data-client-cycle>
	<Card.Header>
		<Card.Title>{m.partners_client_cycle_title()}</Card.Title>
		<Card.Description>{m.partners_valid_years({ count: rules.creditValidYears })}</Card.Description>
	</Card.Header>
	<Card.Content>
		<ol class="flex flex-col gap-3">
			{#each cycle as step, i (i)}
				<li class="flex gap-3 text-sm">
					<span
						class="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums"
					>
						{i + 1}
					</span>
					<span class="pt-0.5">{step}</span>
				</li>
			{/each}
		</ol>
	</Card.Content>
</Card.Root>

<Card.Root data-client-terms>
	<Card.Header>
		<Card.Title>{m.partners_client_terms_title()}</Card.Title>
	</Card.Header>
	<Card.Content>
		<dl class="flex flex-col gap-4 text-sm">
			{#each conditions as [title, text] (title)}
				<div class="flex flex-col gap-1">
					<dt class="font-medium">{title}</dt>
					<dd class="text-muted-foreground">{text}</dd>
				</div>
			{/each}
		</dl>
		<p class="mt-4 text-xs text-muted-foreground">{m.partners_client_terms_footer()}</p>
	</Card.Content>
</Card.Root>
