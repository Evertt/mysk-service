<!--
	The shop's categories (the module's settings): each with how many products it has, in the order
	the portal's catalogue shows them. Managers add, rename and delete them; one with products stays.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import type { RouteParams } from "$app/types";
	import { toast } from "svelte-sonner";

	import SubmitButton from "#lib/components/form/submit-button.svelte";
	import { submitted } from "#lib/components/form/submitted.ts";
	import PageHeader from "#lib/components/page-header.svelte";
	import { formatNumber } from "#lib/i18n/index.ts";
	import {
		addShopCategory,
		deleteShopCategory,
		getShopCategories,
		renameShopCategory,
	} from "#modules/parts-shop/categories.remote.ts";

	// The props the route passes; this page needs none of them.
	const _props: { params: RouteParams<"/(app)/(modules)/parts-shop/settings"> } = $props();

	const data = $derived(await getShopCategories());
</script>

<PageHeader
	title={m.shop_categories_title()}
	description={m.shop_categories_description()}
	breadcrumbs={[
		{ label: m.shop_products_title(), href: resolve("/(app)/(modules)/parts-shop/products") },
		{ label: m.shop_categories_title() },
	]}
/>

<Card.Root class="max-w-2xl" data-shop-categories>
	<Card.Content class="flex flex-col gap-4">
		{#if data.categories.length}
			<ul class="flex flex-col divide-y">
				{#each data.categories as category (category.id)}
					{@const rename = renameShopCategory.for(String(category.id))}
					{@const remove = deleteShopCategory.for(String(category.id))}
					<li class="flex flex-col gap-2 py-3" data-shop-category={category.name}>
						{#if data.canManage}
							<div class="flex flex-wrap items-center gap-2">
								<form
									class="flex min-w-0 flex-1 items-center gap-2"
									{...rename.enhance(async ({ submit }) => {
										if (await submitted(submit)) toast.success(m.shop_category_saved());
									})}
								>
									<input {...rename.fields.id.as("hidden", String(category.id))} />
									<Input
										class="min-w-0 flex-1"
										aria-label={m.shop_field_name()}
										{...rename.fields.name.as("text", category.name)}
									/>
									<SubmitButton size="sm" variant="outline" pending={rename.pending}>
										{m.common_save()}
									</SubmitButton>
								</form>
								<form {...remove.enhance(async ({ submit }) => void (await submitted(submit)))}>
									<input {...remove.fields.id.as("hidden", String(category.id))} />
									<SubmitButton size="sm" variant="ghost" pending={remove.pending}>
										{m.common_delete()}
									</SubmitButton>
								</form>
								<span class="text-xs text-muted-foreground tabular-nums">
									{m.shop_category_products({ count: category.products })}
								</span>
							</div>
							<Field.FieldError
								errors={[
									...(rename.fields.allIssues() ?? []),
									...(remove.fields.allIssues() ?? []),
								]}
							/>
						{:else}
							<div class="flex items-center justify-between gap-2">
								<span class="font-medium">{category.name}</span>
								<span class="text-xs text-muted-foreground tabular-nums">
									{formatNumber(category.products)}
								</span>
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		{:else}
			<p class="text-sm text-muted-foreground">{m.shop_categories_none_description()}</p>
		{/if}

		{#if data.canManage}
			<form
				class="flex flex-col gap-2"
				{...addShopCategory.enhance(async ({ element, submit }) => {
					if (await submitted(submit)) {
						element.reset();
						toast.success(m.shop_category_added());
					}
				})}
			>
				<div class="flex items-center gap-2">
					<Input
						class="min-w-0 flex-1"
						aria-label={m.shop_category_new()}
						placeholder={m.shop_category_new()}
						{...addShopCategory.fields.name.as("text")}
					/>
					<SubmitButton pending={addShopCategory.pending}>{m.shop_category_add()}</SubmitButton>
				</div>
				<Field.FieldError errors={addShopCategory.fields.allIssues()} />
			</form>
		{:else}
			<p class="text-xs text-muted-foreground">{m.shop_categories_managers()}</p>
		{/if}
	</Card.Content>
</Card.Root>
