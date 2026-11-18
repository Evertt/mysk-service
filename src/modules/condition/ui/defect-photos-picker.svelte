<!--
	@component
	A defect's photos to send with its form: a button that opens the camera or the photo library, the
	chosen photos as thumbnails, each with a button that takes it off again, at most `max`. Each is
	shrunk before it's added (`shrinkPhoto()`), so the form sends small JPEGs; the server checks them
	again. The photos are `photos` (bindable, so a row of a form's line items keeps its own), which
	this puts in the file input the form sends: its name comes from `field`, its value from here. A
	module-local copy of the customer portal's report picker, which lives in its route.
-->
<script lang="ts">
	import type { RemoteFormField } from "$app/server";
	import ImagePlusIcon from "@lucide/svelte/icons/image-plus";
	import XIcon from "@lucide/svelte/icons/x";
	import { onDestroy } from "svelte";

	import { withoutValue } from "#lib/components/form/line-items.svelte.ts";
	import { formatNumber } from "#lib/i18n/index.ts";

	import { MAX_DEFECT_PHOTOS } from "../photos.ts";
	import { shrinkPhoto } from "./shrink.ts";

	let {
		field,
		photos = $bindable([]),
		max = MAX_DEFECT_PHOTOS,
		label = m.condition_photos(),
	}: {
		field: RemoteFormField<File[]>;
		photos?: File[];
		/** How many it may have, less those already kept. */
		max?: number;
		label?: string;
	} = $props();

	const id = $props.id();
	let picker = $state<HTMLInputElement>();
	let shrinking = $state(false);
	let problem = $state<string | null>(null);

	/** Each photo's thumbnail: not state, a cache of object URLs to revoke. */
	const urls: [File, string][] = [];
	const urlOf = (file: File) => {
		const found = urls.find(([each]) => each === file)?.[1];
		if (found) return found;
		const url = URL.createObjectURL(file);
		urls.push([file, url]);
		return url;
	};

	const full = $derived(photos.length >= max);
	const issues = $derived([...(problem ? [{ message: problem }] : []), ...(field.issues() ?? [])]);

	/** The form sends what the file input holds: puts these photos in it, whenever they change. */
	const holdPhotos = (input: HTMLInputElement) => {
		const files = new DataTransfer();
		for (const photo of photos) files.items.add(photo);
		input.files = files.files;
	};

	/** Adds the photos just picked, shrunk, up to the limit. */
	async function add() {
		const picked = [...(picker?.files ?? [])];
		if (picker) picker.value = "";
		if (!picked.length) return;
		problem = null;
		const room = max - photos.length;
		if (picked.length > room) {
			problem = m.condition_photos_too_many({ max: formatNumber(max) });
		}
		shrinking = true;
		const added: File[] = [];
		for (const file of picked.slice(0, Math.max(0, room))) {
			try {
				added.push(await shrinkPhoto(file));
			} catch {
				problem = m.condition_photo_unreadable();
			}
		}
		shrinking = false;
		photos = [...photos, ...added];
	}

	function remove(index: number) {
		const [gone] = photos.splice(index, 1);
		const at = urls.findIndex(([each]) => each === gone);
		if (at >= 0) URL.revokeObjectURL(urls.splice(at, 1)[0][1]);
		problem = null;
		photos = [...photos];
	}

	onDestroy(() => {
		for (const [, url] of urls) URL.revokeObjectURL(url);
	});
</script>

<Field.Field data-invalid={issues.length ? true : undefined} data-defect-photos>
	<Field.FieldLabel for={id}>{label}</Field.FieldLabel>
	<!-- What the form sends: the photos, set from `photos`. -->
	<input
		{...withoutValue(field.as("file multiple"))}
		{@attach holdPhotos}
		class="sr-only"
		tabindex="-1"
		aria-hidden="true"
	/>
	<!-- What the button opens: the camera or the library. -->
	<input
		{id}
		bind:this={picker}
		type="file"
		multiple
		accept="image/*"
		class="sr-only"
		tabindex="-1"
		onchange={add}
	/>
	{#if photos.length}
		<ul class="grid grid-cols-4 gap-2 sm:grid-cols-5">
			{#each photos as photo, index (photo)}
				<li class="relative">
					<img
						src={urlOf(photo)}
						alt={m.condition_photo_alt({ number: formatNumber(index + 1) })}
						class="aspect-square w-full rounded-md border object-cover"
					/>
					<Button
						type="button"
						variant="secondary"
						size="icon-sm"
						class="absolute top-1 right-1 rounded-full"
						aria-label={m.condition_photo_remove({ number: formatNumber(index + 1) })}
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
			size="sm"
			disabled={full || shrinking}
			onclick={() => picker?.click()}
		>
			<ImagePlusIcon data-icon="inline-start" />
			{m.condition_photos_add()}
		</Button>
	</div>
	<Field.FieldError errors={issues} />
</Field.Field>
