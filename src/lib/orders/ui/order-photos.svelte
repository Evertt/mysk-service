<!--
	@component
	An order's photos, as the office and the customer portal show them: square thumbnails in a row
	that wraps, each a link to the photo in full in a new tab. Each is served by `/photos/<id>` to
	whoever may read the order (`servePhoto()`), never at a public URL.
-->
<script lang="ts">
	import { resolve } from "$app/paths";

	import { formatNumber } from "#lib/i18n/index.ts";

	let { photos }: { photos: readonly { id: number }[] } = $props();
</script>

<ul class="grid grid-cols-3 gap-2 sm:grid-cols-5" data-order-photos>
	{#each photos as photo, index (photo.id)}
		{@const src = resolve("/photos/[id]", { id: String(photo.id) })}
		<li>
			<a
				href={src}
				target="_blank"
				rel="noopener"
				class="block overflow-hidden rounded-md border bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
				aria-label={m.orders_photo_open({ number: formatNumber(index + 1) })}
			>
				<img
					{src}
					alt={m.orders_photo_alt({ number: formatNumber(index + 1) })}
					loading="lazy"
					class="aspect-square w-full object-cover"
					data-order-photo={photo.id}
				/>
			</a>
		</li>
	{/each}
</ul>
