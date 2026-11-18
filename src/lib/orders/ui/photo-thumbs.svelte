<!--
	@component
	An order's photos, small, for a line in the office's list of a unit's orders (its service
	history): the first few as tiny thumbnails, each a link to the photo in full in a new tab, and
	how many more there are. Nothing without photos.
-->
<script lang="ts">
	import { resolve } from "$app/paths";

	import { formatNumber } from "#lib/i18n/index.ts";

	let { photos, max = 4 }: { photos: readonly { id: number }[]; max?: number } = $props();

	const shown = $derived(photos.slice(0, max));
</script>

{#if photos.length}
	<ul
		class="flex flex-wrap items-center gap-1.5"
		aria-label={m.orders_count_photos({ count: photos.length })}
		data-photo-thumbs={photos.length}
	>
		{#each shown as photo, index (photo.id)}
			{@const src = resolve("/photos/[id]", { id: String(photo.id) })}
			<li>
				<a
					href={src}
					target="_blank"
					rel="noopener"
					class="block size-10 overflow-hidden rounded border bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
					aria-label={m.orders_photo_open({ number: formatNumber(index + 1) })}
				>
					<img {src} alt="" loading="lazy" class="size-full object-cover" />
				</a>
			</li>
		{/each}
		{#if photos.length > shown.length}
			<li class="text-xs text-muted-foreground tabular-nums">
				+{formatNumber(photos.length - shown.length)}
			</li>
		{/if}
	</ul>
{/if}
