<script lang="ts">
	import { resolve } from "$app/paths";
	import type { RouteParams } from "$app/types";
	import { toast } from "svelte-sonner";

	import FormActions from "#lib/components/form/form-actions.svelte";
	import TextField from "#lib/components/form/text-field.svelte";
	import PageHeader from "#lib/components/page-header.svelte";
	import { formatCents } from "#lib/i18n/index.ts";
	import { createInvoiceCredit, getCreditable } from "#modules/invoices/credit-notes.remote.ts";

	let { params }: { params: RouteParams<"/(app)/(modules)/invoices/[number]/credit"> } = $props();

	const data = $derived(await getCreditable(params.number));
	const invoice = $derived(data.invoice);
	const invoiceHref = $derived(
		resolve("/(app)/(modules)/invoices/[number]", { number: invoice.number }),
	);
	// Lines with something left to credit; to start with, all of it is checked.
	const lines = $derived(data.lines.filter((line) => line.left !== 0));
</script>

<svelte:head>
	<title>{m.invoices_credit_invoice_title({ number: invoice.number })} · {m.invoices_title()}</title
	>
</svelte:head>

<PageHeader
	title={m.invoices_credit_invoice_title({ number: invoice.number })}
	description={m.invoices_credit_invoice_description({ customer: invoice.customer.name })}
	breadcrumbs={[
		{ label: m.invoices_title(), href: resolve("/(app)/(modules)/invoices") },
		{ label: invoice.number, href: invoiceHref },
		{ label: m.invoices_credit_breadcrumb() },
	]}
/>

{#if data.creditable}
	<form
		{...createInvoiceCredit.enhance(async ({ submit }) => {
			// On success the server redirects to the draft; otherwise the form shows what's wrong.
			if (await submit()) toast.success(m.invoices_credit_created());
		})}
		class="flex flex-col gap-6"
	>
		<input {...createInvoiceCredit.fields.invoiceId.as("hidden", String(invoice.id))} />
		<Card.Root>
			<Card.Header>
				<Card.Title>{m.invoices_credit_what()}</Card.Title>
				<Card.Description>
					{m.invoices_credit_left({ amount: formatCents(data.left) })}
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<Table.Root data-credit-lines>
					<Table.Header>
						<Table.Row>
							<Table.Head class="w-10"
								><span class="sr-only">{m.invoices_credit_line_credit()}</span></Table.Head
							>
							<Table.Head>{m.invoices_description_column()}</Table.Head>
							<Table.Head class="text-right">{m.invoices_amount()}</Table.Head>
							<Table.Head class="text-right">{m.invoices_credit_line_left()}</Table.Head>
							<Table.Head class="w-40 text-right">{m.invoices_credit_amount()}</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each lines as line, index (line.id)}
							{@const fields = createInvoiceCredit.fields.lines[index]}
							<Table.Row data-line={line.id}>
								<Table.Cell>
									<input {...fields.lineId.as("hidden", String(line.id))} />
									<!-- Native, so the form submits it as it is. -->
									<input
										class="size-4 accent-primary"
										aria-label={m.invoices_credit_line_label({ description: line.description })}
										{...fields.credit.as("checkbox", true)}
									/>
								</Table.Cell>
								<Table.Cell class="whitespace-normal">
									<div class="flex flex-col">
										<span>{line.description}</span>
										{#if line.detail}
											<span class="text-xs text-muted-foreground">{line.detail}</span>
										{/if}
									</div>
								</Table.Cell>
								<Table.Cell class="text-right tabular-nums">{formatCents(line.amount)}</Table.Cell>
								<Table.Cell class="text-right tabular-nums">{formatCents(line.left)}</Table.Cell>
								<Table.Cell>
									<InputGroup.Root>
										<InputGroup.Addon><InputGroup.Text>€</InputGroup.Text></InputGroup.Addon>
										<InputGroup.Input
											aria-label={m.invoices_credit_amount_of({ description: line.description })}
											min={0}
											max={Math.abs(line.left) / 100}
											step={0.01}
											class="text-right tabular-nums"
											{...fields.amount.as("number", Math.abs(line.left) / 100)}
										/>
									</InputGroup.Root>
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
				<p class="mt-3 text-xs text-muted-foreground">{m.invoices_credit_discount_hint()}</p>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Content>
				<TextField
					field={createInvoiceCredit.fields.reason}
					label={m.invoices_credit_reason()}
					description={m.invoices_credit_reason_description()}
					class="max-w-xl"
				/>
			</Card.Content>
		</Card.Root>

		<!-- The form's own problems and the lines' (the reason's show at its field). -->
		<Field.FieldError
			errors={[
				...(createInvoiceCredit.fields.issues() ?? []),
				...(createInvoiceCredit.fields.lines.allIssues() ?? []),
			]}
		/>
		<FormActions
			pending={createInvoiceCredit.pending}
			submitLabel={m.invoices_create_draft()}
			cancelHref={invoiceHref}
		/>
	</form>
{:else}
	<Empty.Root class="border">
		<Empty.Header>
			<Empty.Title>{m.invoices_credit_nothing_to_credit()}</Empty.Title>
			<Empty.Description>{m.invoices_credit_only_sent_or_paid()}</Empty.Description>
		</Empty.Header>
		<Empty.Content>
			<Button variant="outline" href={invoiceHref}
				>{m.invoices_credit_back({ number: invoice.number })}</Button
			>
		</Empty.Content>
	</Empty.Root>
{/if}
