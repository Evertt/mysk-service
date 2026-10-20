<!--
	@component
	A year's rules, as a manager edits them: the levels (from which Partner Omzet, and the cash and
	credit percentages), how each revenue category counts for the level, the cash bonus and the
	credit, and how long the year's credit stays valid.
-->
<script lang="ts">
	import PlusIcon from "@lucide/svelte/icons/plus";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";
	import { toast } from "svelte-sonner";

	import { lineItems, withoutValue } from "#lib/components/form/line-items.svelte.ts";
	import NumberField from "#lib/components/form/number-field.svelte";
	import SubmitButton from "#lib/components/form/submit-button.svelte";
	import { submitted } from "#lib/components/form/submitted.ts";

	import { partnerLabels } from "../labels.ts";
	import {
		categoryRuleValues,
		type LevelColour,
		levelColours,
		type ProgrammeRules,
		ruleLimits,
	} from "../model.ts";
	import { saveYearRules } from "../years.remote.ts";

	let { year, rules }: { year: number; rules: ProgrammeRules } = $props();

	const form = saveYearRules;

	/** A level as it's typed: in euros and percentages, a number empty while its field is. */
	interface TypedTier {
		level: string;
		threshold: number | null;
		cashRate: number | null;
		creditRate: number | null;
		colour: LevelColour | "";
	}

	// The numbers are bound (`bind:value`), which keeps what's typed: an empty field stays empty
	// (the form refuses it on save), and "3." on the way to "3.5" isn't written back as a number.
	const tiers = lineItems<TypedTier>(() =>
		rules.tiers.map((tier) => ({
			level: tier.level,
			threshold: tier.threshold / 100,
			cashRate: tier.cashRate / 100,
			creditRate: tier.creditRate / 100,
			colour: tier.colour ?? "",
		})),
	);

	function addTier() {
		const last = tiers.rows.at(-1);
		tiers.add({
			level: "",
			threshold: last?.threshold == null ? 50_000 : last.threshold * 2,
			cashRate: last?.cashRate ?? 2.5,
			creditRate: last?.creditRate ?? 3,
			colour: "",
		});
	}

	const ruleOptions = $derived(partnerLabels.labelOptions("categoryRule", categoryRuleValues));
	const colourOptions = $derived(partnerLabels.labelOptions("levelColour", levelColours));
</script>

<form
	{...form.enhance(async ({ submit }) => {
		if (await submitted(submit)) toast.success(m.partners_rules_saved({ year: String(year) }));
	})}
	class="flex flex-col gap-6"
	data-rules-form
>
	<input {...form.fields.year.as("hidden", String(year))} />

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.partners_rules_levels()}</Card.Title>
			<Card.Description>{m.partners_rules_levels_description()}</Card.Description>
			<Card.Action>
				<Button
					type="button"
					variant="outline"
					size="sm"
					onclick={addTier}
					disabled={tiers.rows.length >= ruleLimits.tiers.max}
				>
					<PlusIcon data-icon="inline-start" />
					{m.partners_rules_add_level()}
				</Button>
			</Card.Action>
		</Card.Header>
		<Card.Content>
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>{m.partners_column_threshold()}</Table.Head>
						<Table.Head>{m.partners_column_level()}</Table.Head>
						<Table.Head>{m.partners_column_cash_rate()}</Table.Head>
						<Table.Head>{m.partners_column_credit_rate()}</Table.Head>
						<Table.Head>{m.partners_column_colour()}</Table.Head>
						<Table.Head class="w-10"
							><span class="sr-only">{m.partners_rules_remove_level()}</span></Table.Head
						>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each tiers.rows as tier, index (tier.key)}
						{@const fields = form.fields.tiers[index]}
						<Table.Row data-tier={index}>
							<Table.Cell>
								<InputGroup.Root class="min-w-32">
									<InputGroup.Addon><InputGroup.Text>€</InputGroup.Text></InputGroup.Addon>
									<InputGroup.Input
										aria-label={m.partners_column_threshold()}
										min={0}
										step={1}
										class="tabular-nums"
										{...withoutValue(fields.threshold.as("number"))}
										bind:value={tier.threshold}
									/>
								</InputGroup.Root>
							</Table.Cell>
							<Table.Cell>
								<Input
									class="min-w-28"
									aria-label={m.partners_column_level()}
									{...withoutValue(fields.level.as("text"))}
									value={tier.level}
									oninput={(event) => (tier.level = event.currentTarget.value)}
								/>
							</Table.Cell>
							<Table.Cell>
								<InputGroup.Root class="min-w-24">
									<InputGroup.Input
										aria-label={m.partners_column_cash_rate()}
										min={0}
										max={100}
										step={0.01}
										class="tabular-nums"
										{...withoutValue(fields.cashRate.as("number"))}
										bind:value={tier.cashRate}
									/>
									<InputGroup.Addon align="inline-end"
										><InputGroup.Text>%</InputGroup.Text></InputGroup.Addon
									>
								</InputGroup.Root>
							</Table.Cell>
							<Table.Cell>
								<InputGroup.Root class="min-w-24">
									<InputGroup.Input
										aria-label={m.partners_column_credit_rate()}
										min={0}
										max={100}
										step={0.01}
										class="tabular-nums"
										{...withoutValue(fields.creditRate.as("number"))}
										bind:value={tier.creditRate}
									/>
									<InputGroup.Addon align="inline-end"
										><InputGroup.Text>%</InputGroup.Text></InputGroup.Addon
									>
								</InputGroup.Root>
							</Table.Cell>
							<Table.Cell>
								<NativeSelect.Root
									class="min-w-32"
									aria-label={m.partners_column_colour()}
									{...withoutValue(fields.colour.as("select"))}
									bind:value={tier.colour}
								>
									<NativeSelect.Option value=""
										>{m.partners_rules_colour_by_name()}</NativeSelect.Option
									>
									{#each colourOptions as option (option.value)}
										<NativeSelect.Option value={option.value}>{option.label}</NativeSelect.Option>
									{/each}
								</NativeSelect.Root>
							</Table.Cell>
							<Table.Cell>
								<Button
									type="button"
									variant="ghost"
									size="icon-sm"
									aria-label={m.partners_rules_remove_level()}
									disabled={tiers.rows.length <= ruleLimits.tiers.min}
									onclick={() => tiers.remove(index)}
								>
									<Trash2Icon />
								</Button>
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
			<Field.FieldError errors={form.fields.tiers.allIssues()} />
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.partners_field_categories()}</Card.Title>
			<Card.Description>{m.partners_rules_categories_description()}</Card.Description>
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
					{#each rules.categories as rule, index (rule.category)}
						{@const fields = form.fields.categories[index]}
						{@const name = partnerLabels.label("revenueCategory", rule.category)}
						<Table.Row data-category={rule.category}>
							<Table.Cell>
								<input {...fields.category.as("hidden", rule.category)} />
								{name}
							</Table.Cell>
							<Table.Cell>
								<Checkbox
									aria-label={m.partners_counts_level_for({ category: name })}
									name={fields.level.as("checkbox", rule.level).name}
									checked={rule.level}
								/>
							</Table.Cell>
							<Table.Cell>
								<NativeSelect.Root
									class="min-w-36"
									aria-label={m.partners_counts_cash_for({ category: name })}
									{...fields.cash.as("select", rule.cash)}
								>
									{#each ruleOptions as option (option.value)}
										<NativeSelect.Option value={option.value}>{option.label}</NativeSelect.Option>
									{/each}
								</NativeSelect.Root>
							</Table.Cell>
							<Table.Cell>
								<NativeSelect.Root
									class="min-w-36"
									aria-label={m.partners_counts_credit_for({ category: name })}
									{...fields.credit.as("select", rule.credit)}
								>
									{#each ruleOptions as option (option.value)}
										<NativeSelect.Option value={option.value}>{option.label}</NativeSelect.Option>
									{/each}
								</NativeSelect.Root>
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Content>
			<Field.FieldGroup class="max-w-sm">
				<NumberField
					field={form.fields.creditValidYears}
					label={m.partners_field_credit_valid_years()}
					description={m.partners_credit_valid_description()}
					value={rules.creditValidYears}
					min={ruleLimits.creditValidYears.min}
					max={ruleLimits.creditValidYears.max}
					step={1}
				/>
			</Field.FieldGroup>
		</Card.Content>
	</Card.Root>

	<Field.FieldError errors={form.fields.issues()} />
	<div>
		<SubmitButton pending={form.pending}>{m.partners_rules_save()}</SubmitButton>
	</div>
</form>
