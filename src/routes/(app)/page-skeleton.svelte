<!--
	@component
	What an office page shows while its data loads: the page's own skeleton if it has one (a
	module's, see `loadModuleSkeletons()`), else the outline of the page it'll be, by its route (see
	`pageShape()`).
-->
<script lang="ts">
	import type { Component } from "svelte";

	import { pageShape } from "./page-skeleton.ts";

	let {
		routeId,
		skeletons,
	}: {
		routeId: string | null;
		/** The pages' own skeletons, by route id. */
		skeletons: ReadonlyMap<string, Component>;
	} = $props();

	const Own = $derived(routeId === null ? undefined : skeletons.get(routeId));
	const shape = $derived(pageShape(routeId));
</script>

{#snippet header({ breadcrumbs = false, action = false })}
	<div class="flex flex-col gap-4">
		{#if breadcrumbs}
			<Skeleton class="h-4 w-40" />
		{/if}
		<div class="flex items-end justify-between gap-4">
			<div class="flex flex-col gap-2">
				<Skeleton class="h-8 w-56" />
				<Skeleton class="h-5 w-80 max-w-full" />
			</div>
			{#if action}
				<Skeleton class="h-9 w-28" />
			{/if}
		</div>
	</div>
{/snippet}

{#snippet card(className: string)}
	<div class={["flex flex-col gap-4 rounded-xl border p-6", className]}>
		<Skeleton class="h-5 w-40" />
		<Skeleton class="h-4 w-64 max-w-full" />
		<Skeleton class="mt-2 flex-1" />
	</div>
{/snippet}

<div class="flex flex-col gap-6">
	{#if Own}
		<Own />
	{:else if shape === "dashboard"}
		{@render header({})}
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
			{#each { length: 5 }, index (index)}
				<Skeleton class="h-32" />
			{/each}
		</div>
		<div class="grid gap-6 lg:grid-cols-2">
			{@render card("h-80")}
			{@render card("h-80")}
		</div>
	{:else if shape === "list"}
		{@render header({ action: true })}
		<div class="flex items-center gap-2">
			<Skeleton class="h-9 w-full sm:w-48" />
			<Skeleton class="hidden h-9 w-24 sm:block" />
			<Skeleton class="hidden h-9 w-24 sm:block" />
			<Skeleton class="ml-auto hidden h-9 w-24 sm:block" />
		</div>
		<div class="flex flex-col overflow-hidden rounded-md border">
			<Skeleton class="h-10 rounded-none" />
			{#each { length: 10 }, index (index)}
				<div class="flex items-center gap-6 border-t px-4 py-3">
					<Skeleton class="h-4 w-28" />
					<Skeleton class="h-4 flex-1" />
					<Skeleton class="hidden h-4 w-24 md:block" />
					<Skeleton class="hidden h-4 w-20 md:block" />
				</div>
			{/each}
		</div>
	{:else if shape === "detail"}
		{@render header({ breadcrumbs: true, action: true })}
		<div class="grid items-start gap-6 lg:grid-cols-3">
			<div class="flex flex-col gap-6 lg:col-span-2">
				{@render card("h-64")}
				{@render card("h-48")}
			</div>
			{@render card("h-80")}
		</div>
	{:else if shape === "form"}
		{@render header({ breadcrumbs: true })}
		<div class="grid gap-6 rounded-xl border p-6 md:grid-cols-2">
			{#each { length: 6 }, index (index)}
				<div class="flex flex-col gap-2">
					<Skeleton class="h-4 w-24" />
					<Skeleton class="h-9" />
				</div>
			{/each}
			<Skeleton class="h-24 md:col-span-2" />
		</div>
	{:else}
		{@render header({})}
		<div class="grid items-start gap-6 lg:grid-cols-2">
			{@render card("h-64")}
			{@render card("h-64")}
		</div>
	{/if}
</div>
