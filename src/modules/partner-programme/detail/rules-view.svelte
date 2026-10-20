<!--
	@component
	A year's rules as members who aren't managers see them: the levels with what their bonus would be
	at the threshold, and the revenue that counts.
-->
<script lang="ts">
	import { formatCents } from "#lib/i18n/index.ts";

	import { formatEuros, formatRate } from "../display.ts";
	import { partnerLabels } from "../labels.ts";
	import { atRate, type ProgrammeRules } from "../model.ts";
	import LevelBadge from "../ui/level-badge.svelte";

	let { rules }: { rules: ProgrammeRules } = $props();
</script>

<div class="flex max-w-4xl flex-col gap-6">
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.partners_rules_levels()}</Card.Title>
			<Card.Description>{m.partners_rules_managers()}</Card.Description>
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
						<Table.Row>
							<Table.Cell class="tabular-nums">{formatEuros(tier.threshold)}</Table.Cell>
							<Table.Cell><LevelBadge level={tier.level} colour={tier.colour} /></Table.Cell>
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
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.partners_field_categories()}</Card.Title>
			<Card.Description>
				{m.partners_valid_years({ count: rules.creditValidYears })}
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>{m.partners_field_category()}</Table.Head>
						<Table.Head>{m.partners_column_counts_level()}</Table.Head>
						<Table.Head>{m.partners_enum_bonus_form_cash()}</Table.Head>
						<Table.Head>{m.partners_enum_bonus_form_credit()}</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each rules.categories as rule (rule.category)}
						<Table.Row>
							<Table.Cell>{partnerLabels.label("revenueCategory", rule.category)}</Table.Cell>
							<Table.Cell
								>{rule.level
									? m.partners_enum_category_rule_yes()
									: m.partners_enum_category_rule_no()}</Table.Cell
							>
							<Table.Cell>{partnerLabels.label("categoryRule", rule.cash)}</Table.Cell>
							<Table.Cell>{partnerLabels.label("categoryRule", rule.credit)}</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</Card.Content>
	</Card.Root>
</div>
