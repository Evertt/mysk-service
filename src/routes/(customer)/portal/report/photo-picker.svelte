<!--
	@component
	The report form's photos: a button that opens the camera or the photo library, the chosen photos
	as thumbnails, each with a button that takes it off again, at most `MAX_PHOTOS`. Each is shrunk
	before it's added (`shrinkPhoto()`), so the form sends small JPEGs; the server checks them again.
	The photos are the form field's value, which the file input sends.
-->
<script lang="ts">
	import ImagePlusIcon from "@lucide/svelte/icons/image-plus";
	import XIcon from "@lucide/svelte/icons/x";
	import type { RemoteFormField } from "@sveltejs/kit";
	import { onDestroy } from "svelte";

	import { formatNumber } from "#lib/i18n/index.ts";
	import { MAX_PHOTOS } from "#lib/orders/photos.ts";

	import { shrinkPhoto } from "./shrink.ts";

	let { field }: { field: RemoteFormField<File[]> } = $props();

	const id = $props.id();
	let input = $state<HTMLInputElement>();

	/** The chosen photos, shrunk, each with its thumbnail's object URL. */
	let photos = $state.raw<{ file: File; url: string }[]>([]);
	let shrinking = $state(false);
	let problem = $state<string | null>(null);

	const full = $derived(photos.length >= MAX_PHOTOS);
	const issues = $derived([...(problem ? [{ message: problem }] : []), ...(field.issues() ?? [])]);

	function keep(next: { file: File; url: string }[]) {
		photos = next;
		field.set(next.map((photo) => photo.file));
	}

	/** Adds the photos just picked (the input holds only those now), shrunk, up to the limit. */
	async function add() {
		const picked = [...(input?.files ?? [])].filter(
			(file) => !photos.some((photo) => photo.file === file),
		);
		if (!picked.length) return;
		problem = null;
		const room = MAX_PHOTOS - photos.length;
		if (picked.length > room) {
			problem = m.client_report_photos_too_many({ max: formatNumber(MAX_PHOTOS) });
		}
		shrinking = true;
		const added: { file: File; url: string }[] = [];
		for (const file of picked.slice(0, Math.max(0, room))) {
			try {
				const shrunk = await shrinkPhoto(file);
				added.push({ file: shrunk, url: URL.createObjectURL(shrunk) });
			} catch {
				problem = m.client_report_photo_unreadable();
			}
		}
		shrinking = false;
		keep([...photos, ...added]);
	}

	function remove(index: number) {
		URL.revokeObjectURL(photos[index].url);
		problem = null;
		keep(photos.filter((_, i) => i !== index));
	}

	onDestroy(() => {
		for (const photo of photos) URL.revokeObjectURL(photo.url);
	});
</script>

<Field.Field data-invalid={issues.length ? true : undefined} data-photo-picker>
	<Field.FieldLabel for={id}>{m.client_report_photos()}</Field.FieldLabel>
	<input
		{...field.as("file multiple")}
		{id}
		bind:this={input}
		accept="image/*"
		class="sr-only"
		tabindex="-1"
		onchange={add}
	/>
	{#if photos.length}
		<ul class="grid grid-cols-3 gap-2 sm:grid-cols-5">
			{#each photos as photo, index (photo.url)}
				<li class="relative">
					<img
						src={photo.url}
						alt={m.orders_photo_alt({ number: formatNumber(index + 1) })}
						class="aspect-square w-full rounded-md border object-cover"
					/>
					<Button
						type="button"
						variant="secondary"
						size="icon-sm"
						class="absolute top-1 right-1 rounded-full"
						aria-label={m.client_report_photo_remove({ number: formatNumber(index + 1) })}
						onclick={() => remove(index)}
					>
						<XIcon />
					</Button>
				</li>
			{/each}
		</ul>
	{/if}
	<div>
		<Button
			type="button"
			variant="outline"
			disabled={full || shrinking}
			onclick={() => input?.click()}
		>
			<ImagePlusIcon data-icon="inline-start" />
			{m.client_report_photos_add()}
		</Button>
	</div>
	<Field.FieldDescription>
		{m.client_report_photos_description({ max: formatNumber(MAX_PHOTOS) })}
	</Field.FieldDescription>
	<Field.FieldError errors={issues} />
</Field.Field>
