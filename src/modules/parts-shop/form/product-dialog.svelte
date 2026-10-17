<!--
	@component
	A material's place in the shop, in a dialog: whether it's in the shop, its category, its
	description for customers, how it's sold, whether it's popular, payable with Parts Credit or only
	on request, and the checklist points it fixes (grouped by template). Saving with "In the shop"
	off takes it out of the shop.
-->
<script lang="ts">
	import { toast } from "svelte-sonner";

	import CheckboxField from "#lib/components/form/checkbox-field.svelte";
	import SelectField from "#lib/components/form/select-field.svelte";
	import SubmitButton from "#lib/components/form/submit-button.svelte";
	import TextField from "#lib/components/form/text-field.svelte";

	import type { Checkpoint } from "../api/extensions.ts";
	import { shopLabels } from "../labels.ts";
	import { type ProductUnit, productUnits } from "../model.ts";
	import { saveShopProduct } from "../products.remote.ts";

	interface Product {
		categoryId: number;
		description: string | null;
		unit: ProductUnit;
		popular: boolean;
		creditEligible: boolean;
		onRequest: boolean;
		checkpointIds: number[];
	}

	let {
		open = $bindable(false),
		material,
		categories,
		checkpoints,
	}: {
		open?: boolean;
		material: { materialId: number; sku: string; name: string; product: Product | null };
		categories: { id: number; name: string }[];
		checkpoints: Checkpoint[];
	} = $props();

	const form = $derived(saveShopProduct.for(String(material.materialId)));
	const product = $derived(material.product);
	const categoryOptions = $derived(
		categories.map((category) => ({ value: String(category.id), label: category.name })),
	);
	const unitOptions = $derived(
		productUnits.map((unit) => ({ value: unit, label: shopLabels.label("productUnit", unit) })),
	);
	const byTemplate = $derived([...Map.groupBy(checkpoints, (point) => point.template)]);
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="max-h-[90svh] overflow-y-auto sm:max-w-lg" data-product-dialog>
		<Dialog.Header>
			<Dialog.Title>{m.shop_product_title({ sku: material.sku, name: material.name })}</Dialog.Title
			>
			<Dialog.Description>{m.shop_product_description()}</Dialog.Description>
		</Dialog.Header>
		<form
			{...form.enhance(async ({ submit }) => {
				if (await submit()) {
					open = false;
					toast.success(m.shop_product_saved({ sku: material.sku }));
				}
			})}
			class="flex flex-col gap-6"
		>
			<input {...form.fields.materialId.as("hidden", String(material.materialId))} />
			<Field.FieldGroup>
				<CheckboxField field={form.fields.inShop} label={m.shop_field_in_shop()} checked={true} />
				<SelectField
					field={form.fields.categoryId}
					label={m.shop_field_category()}
					options={categoryOptions}
					placeholder={m.shop_category_choose()}
					value={product ? String(product.categoryId) : String(categories[0]?.id ?? "")}
				/>
				<TextField
					field={form.fields.description}
					label={m.shop_field_description()}
					value={product?.description ?? ""}
					multiline
				/>
				<SelectField
					field={form.fields.unit}
					label={m.shop_field_unit()}
					options={unitOptions}
					value={product?.unit ?? "piece"}
				/>
				<CheckboxField
					field={form.fields.creditEligible}
					label={m.shop_field_credit_eligible()}
					description={m.shop_field_credit_eligible_description()}
					checked={product?.creditEligible ?? true}
				/>
				<CheckboxField
					field={form.fields.onRequest}
					label={m.shop_field_on_request()}
					description={m.shop_field_on_request_description()}
					checked={product?.onRequest ?? false}
				/>
				<CheckboxField
					field={form.fields.popular}
					label={m.shop_field_popular()}
					checked={product?.popular ?? false}
				/>
				{#if checkpoints.length}
					<Field.FieldSet>
						<Field.FieldLegend variant="label">{m.shop_field_checkpoints()}</Field.FieldLegend>
						<Field.FieldDescription>{m.shop_field_checkpoints_description()}</Field.FieldDescription
						>
						{#each byTemplate as [template, points] (template)}
							<div class="flex flex-col gap-1.5" data-checkpoint-template={template}>
								<span class="text-xs font-medium text-muted-foreground">{template}</span>
								{#each points as point (point.id)}
									<label class="flex items-start gap-2 text-sm">
										<input
											class="mt-0.5 size-4 shrink-0 accent-primary"
											{...form.fields.checkpointIds.as(
												"checkbox",
												String(point.id),
												product?.checkpointIds.includes(point.id) ?? false,
											)}
										/>
										<span>{point.text}</span>
									</label>
								{/each}
							</div>
						{/each}
					</Field.FieldSet>
				{/if}
			</Field.FieldGroup>
			<Field.FieldError errors={form.fields.issues()} />
			<Dialog.Footer>
				<Dialog.Close type="button">
					{#snippet child({ props })}
						<Button {...props} variant="ghost">{m.common_cancel()}</Button>
					{/snippet}
				</Dialog.Close>
				<SubmitButton pending={form.pending}>{m.common_save()}</SubmitButton>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
