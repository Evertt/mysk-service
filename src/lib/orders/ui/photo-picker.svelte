<!--
	@component
	A form's photos of an order (the portal's breakdown report, a photos card's form): the chosen
	photos as square tiles, each with a button that takes it off again, and a dashed "+" tile after
	them that opens the camera or the photo library, at most `MAX_PHOTOS`. Each is shrunk before it's added (`shrinkPhoto()`), so
	the form sends small JPEGs; the server checks them again. The photos are the form field's value,
	which the file input sends. Its form needs `enctype="multipart/form-data"`.

	Without JavaScript (or until the page has loaded it) it's the browser's own file input, whose
	photos go as they are: the server takes them up to `MAX_PHOTO_BYTES` each.
-->
<script lang="ts">
	import type { RemoteFormField } from "$app/server";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import XIcon from "@lucide/svelte/icons/x";
	import { onDestroy, onMount } from "svelte";

	import { formatNumber } from "#lib/i18n/index.ts";

	import { MAX_PHOTOS } from "../photos.ts";
	import { shrinkPhoto } from "./shrink.ts";

	let {
		field,
		label = m.orders_photos(),
		description,
	}: {
		field: RemoteFormField<File[]>;
		label?: string;
		description?: string;
	} = $props();

	const id = $props.id();
	let input = $state<HTMLInputElement>();

	/** Whether the page runs its script: the button and the thumbnails then take the input's place. */
	let enhanced = $state(false);
	onMount(() => (enhanced = true));

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
			problem = m.orders_photos_too_many({ max: formatNumber(MAX_PHOTOS) });
		}
		shrinking = true;
		const added: { file: File; url: string }[] = [];
		for (const file of picked.slice(0, Math.max(0, room))) {
			try {
				const shrunk = await shrinkPhoto(file);
				added.push({ file: shrunk, url: URL.createObjectURL(shrunk) });
			} catch {
				problem = m.orders_photo_unreadable();
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

	/** Takes every photo off, e.g. once the form has sent them. */
	export function clear() {
		for (const photo of photos) URL.revokeObjectURL(photo.url);
		problem = null;
		keep([]);
	}

	onDestroy(() => {
		for (const photo of photos) URL.revokeObjectURL(photo.url);
	});
</script>

<Field.Field data-invalid={issues.length ? true : undefined} data-photo-picker>
	<Field.FieldLabel for={id}>{label}</Field.FieldLabel>
	<input
		{...field.as("file multiple")}
		{id}
		bind:this={input}
		accept="image/*"
		class={enhanced ? "sr-only" : "text-sm"}
		tabindex={enhanced ? -1 : undefined}
		onchange={add}
	/>
	{#if photos.length || enhanced}
		<!-- Square tiles: the photos, then a dashed one to add more. -->
		<ul class="flex flex-wrap gap-2.5">
			{#each photos as photo, index (photo.url)}
				<li class="relative size-18">
					<img
						src={photo.url}
						alt={m.orders_photo_alt({ number: formatNumber(index + 1) })}
						class="size-full rounded-xl border object-cover"
					/>
					<!-- Small on the tile, its tap area larger (`after:`). -->
					<button
						type="button"
						class="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full bg-foreground text-background shadow-sm ring-2 ring-background outline-none after:absolute after:-inset-2.5 focus-visible:ring-ring"
						aria-label={m.orders_photo_remove({ number: formatNumber(index + 1) })}
						onclick={() => remove(index)}
					>
						<XIcon class="size-3.5" />
					</button>
				</li>
			{/each}
			{#if enhanced && !full}
				<li>
					<button
						type="button"
						class="flex size-18 items-center justify-center rounded-xl border-2 border-dashed border-input bg-card text-muted-foreground transition-colors outline-none hover:border-primary hover:text-primary focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
						disabled={shrinking}
						aria-label={m.orders_photos_add()}
						onclick={() => input?.click()}
						data-photo-add
					>
						{#if shrinking}
							<Spinner class="size-5" />
						{:else}
							<PlusIcon class="size-6" />
						{/if}
					</button>
				</li>
			{/if}
		</ul>
	{/if}
	{#if description}
		<Field.FieldDescription>{description}</Field.FieldDescription>
	{/if}
	<Field.FieldError errors={issues} />
</Field.Field>
