<!--
	@component
	An order's photos on its page in the office and in the engineer portal: the photos (`OrderPhotos`:
	whoever may delete one has its button), and while photos may be added (`canAdd`, see
	`mayAddPhotos()`) the picker and a button that sends them (`addPhotos`). With JavaScript the
	picker shrinks them first; without, the form sends them as they are.
-->
<script lang="ts">
	import ImageUpIcon from "@lucide/svelte/icons/image-up";
	import { toast } from "svelte-sonner";

	import SubmitButton from "#lib/components/form/submit-button.svelte";
	import { submitted } from "#lib/components/form/submitted.ts";
	import { formatNumber } from "#lib/i18n/index.ts";

	import { addPhotos } from "../photos.remote.ts";
	import { MAX_PHOTOS } from "../photos.ts";
	import OrderPhotos from "./order-photos.svelte";
	import PhotoPicker from "./photo-picker.svelte";

	let {
		orderId,
		photos,
		canAdd,
		description,
		size = "default",
	}: {
		orderId: number;
		photos: readonly { id: number; deletable: boolean }[];
		canAdd: boolean;
		description?: string;
		/** `lg` for the engineer portal's large buttons on a phone. */
		size?: "default" | "lg";
	} = $props();

	const form = $derived(addPhotos.for(String(orderId)));
	let picker = $state<ReturnType<typeof PhotoPicker>>();
</script>

<Card.Root data-photos-card>
	<Card.Header>
		<Card.Title>{m.orders_photos()}</Card.Title>
		{#if description}
			<Card.Description>{description}</Card.Description>
		{/if}
	</Card.Header>
	<Card.Content class="flex flex-col gap-4">
		{#if photos.length}
			<OrderPhotos {photos} />
		{:else}
			<p class="text-sm text-muted-foreground">{m.orders_photos_none()}</p>
		{/if}
		{#if canAdd}
			<form
				{...form.enhance(async ({ submit }) => {
					if (!(await submitted(submit))) return;
					picker?.clear();
					toast.success(m.orders_photos_added());
				})}
				enctype="multipart/form-data"
				class="flex flex-col gap-3"
				data-add-photos
			>
				<input {...form.fields.id.as("hidden", String(orderId))} />
				<PhotoPicker
					bind:this={picker}
					field={form.fields.photos}
					label={m.orders_photos_to_add()}
					description={m.orders_photos_add_description({ max: formatNumber(MAX_PHOTOS) })}
				/>
				<Field.FieldError errors={form.fields.issues()} />
				<div>
					<SubmitButton
						variant="outline"
						{size}
						class={size === "lg" ? "h-12 w-full" : undefined}
						icon={ImageUpIcon}
						pending={form.pending}
					>
						{m.orders_photos_upload()}
					</SubmitButton>
				</div>
			</form>
		{/if}
	</Card.Content>
</Card.Root>
