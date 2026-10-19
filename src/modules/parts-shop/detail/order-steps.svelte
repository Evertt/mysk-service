<!--
	@component
	The steps the office can take with a shop order (confirm, ship, deliver), and cancelling it,
	which asks first: its credit goes back into the partner's wallet and its stock back on the shelf.
-->
<script lang="ts">
	import { toast } from "svelte-sonner";

	import SubmitButton from "#lib/components/form/submit-button.svelte";
	import { submitted } from "#lib/components/form/submitted.ts";
	import { formatCents } from "#lib/i18n/index.ts";

	import { shopLabels } from "../labels.ts";
	import { type ShopOrderStatus, type ShopOrderStep, statusAfter, stepsFrom } from "../model.ts";
	import { takeShopOrderStep } from "../orders.remote.ts";

	let { number, status, total }: { number: string; status: ShopOrderStatus; total: number } =
		$props();

	const steps = $derived(stepsFrom(status));
	const forward = $derived(steps.filter((step) => step !== "cancel"));
	let cancelling = $state(false);
	const formFor = (step: ShopOrderStep) => takeShopOrderStep.for(`${number}:${step}`);
	const cancel = $derived(formFor("cancel"));
</script>

{#if steps.length}
	<div class="flex flex-wrap items-center gap-2" data-shop-steps>
		{#each forward as step (step)}
			{@const form = formFor(step)}
			<form
				{...form.enhance(async ({ submit }) => {
					const next = statusAfter(status, step);
					if ((await submitted(submit)) && next) {
						toast.success(
							m.shop_step_done({ number, status: shopLabels.label("shopOrderStatus", next) }),
						);
					}
				})}
			>
				<input {...form.fields.number.as("hidden", number)} />
				<input {...form.fields.step.as("hidden", step)} />
				<SubmitButton pending={form.pending}>{shopLabels.label("shopOrderStep", step)}</SubmitButton
				>
			</form>
		{/each}
		{#if steps.includes("cancel")}
			<Button variant="outline" onclick={() => (cancelling = true)}>
				{shopLabels.label("shopOrderStep", "cancel")}
			</Button>
		{/if}
	</div>
	{#each forward as step (step)}
		<Field.FieldError errors={formFor(step).fields.allIssues()} />
	{/each}
{/if}

<AlertDialog.Root bind:open={cancelling}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{m.shop_cancel_title({ number })}</AlertDialog.Title>
			<AlertDialog.Description>
				{m.shop_cancel_description({ total: formatCents(total) })}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<form
			{...cancel.enhance(async ({ submit }) => {
				if (await submitted(submit)) {
					cancelling = false;
					toast.success(m.shop_cancelled({ number }));
				}
			})}
		>
			<input {...cancel.fields.number.as("hidden", number)} />
			<input {...cancel.fields.step.as("hidden", "cancel")} />
			<Field.FieldError errors={cancel.fields.allIssues()} class="mb-4" />
			<AlertDialog.Footer>
				<AlertDialog.Cancel type="button">{m.common_cancel()}</AlertDialog.Cancel>
				<SubmitButton variant="destructive" pending={cancel.pending}>
					{m.shop_cancel_confirm()}
				</SubmitButton>
			</AlertDialog.Footer>
		</form>
	</AlertDialog.Content>
</AlertDialog.Root>
