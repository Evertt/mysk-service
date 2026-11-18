<!--
	@component
	An order's photos, as every shell shows them: square thumbnails in a row that wraps, each a link
	to the photo in full in a new tab. Each is served by `/photos/<id>` to whoever may read the order
	(`servePhoto()`), never at a public URL. A photo the viewer may delete (`deletable`, the access
	registry's say) has a button that asks first, then deletes it (`deletePhoto`).
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";

	import ConfirmDialog from "#lib/components/form/confirm-dialog.svelte";
	import { formatNumber } from "#lib/i18n/index.ts";

	import { deletePhoto } from "../photos.remote.ts";

	let { photos }: { photos: readonly { id: number; deletable?: boolean }[] } = $props();

	/** The photo the dialog asks about, by its place among them (from 1). */
	let asking = $state<{ id: number; number: number } | null>(null);
	let open = $state(false);
</script>

<ul class="grid grid-cols-3 gap-2 sm:grid-cols-5" data-order-photos>
	{#each photos as photo, index (photo.id)}
		{@const src = resolve("/photos/[id]", { id: String(photo.id) })}
		{@const number = formatNumber(index + 1)}
		<li class="relative">
			<a
				href={src}
				target="_blank"
				rel="noopener"
				class="block overflow-hidden rounded-md border bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
				aria-label={m.orders_photo_open({ number })}
			>
				<img
					{src}
					alt={m.orders_photo_alt({ number })}
					loading="lazy"
					class="aspect-square w-full object-cover"
					data-order-photo={photo.id}
				/>
			</a>
			{#if photo.deletable}
				<Button
					type="button"
					variant="secondary"
					size="icon-sm"
					class="absolute top-1 right-1 rounded-full"
					aria-label={m.orders_photo_delete({ number })}
					data-delete-photo={photo.id}
					onclick={() => {
						asking = { id: photo.id, number: index + 1 };
						open = true;
					}}
				>
					<Trash2Icon />
				</Button>
			{/if}
		</li>
	{/each}
</ul>

<ConfirmDialog
	bind:open
	form={deletePhoto}
	hidden={{ id: asking ? String(asking.id) : undefined }}
	title={m.orders_photo_delete_title({ number: formatNumber(asking?.number ?? 1) })}
	description={m.orders_photo_delete_description()}
	confirmLabel={m.common_delete()}
	confirmIcon={Trash2Icon}
	destructive
	done={m.orders_photo_deleted()}
/>
