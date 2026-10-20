<!--
	@component
	The steps the office can take with a shop order (confirm, ship, deliver), and cancelling it,
	which asks first: its credit goes back into the partner's wallet and its stock back on the shelf.
-->
<script lang="ts">
	import { toast } from "svelte-sonner";

	import ConfirmDialog from "#lib/components/form/confirm-dialog.svelte";
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

<ConfirmDialog
	form={cancel}
	hidden={{ number, step: "cancel" }}
	title={m.shop_cancel_title({ number })}
	description={m.shop_cancel_description({ total: formatCents(total) })}
	confirmLabel={m.shop_cancel_confirm()}
	destructive
	done={m.shop_cancelled({ number })}
	bind:open={cancelling}
/>
