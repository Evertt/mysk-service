<!--
	@component
	What the current tenant's modules add to a core page at `name` (see `slots` in
	`#lib/modules/manifests.ts`), with `props` passed on. Wrapped in a `div` with `class` (by default
	`contents`, so the components lay out as the page's own), or nothing if no module adds anything.

	Each module's part is rendered in a boundary of its own (`module-slot-parts.svelte`), so when it
	fails (its remote query throws, its chunk doesn't load) the page and the other modules' parts
	still render, and it shows a small card saying so, with a retry.

	By default the parts are server-rendered and awaited like the rest of the page, without a
	loading state. The error of a part that fails on the server reaches its boundary through
	SvelteKit's `transformError`, which runs it through `handleError` (so the server logs it, and
	`failed` gets an `App.Error`). SvelteKit also takes it as the page's error: a page whose part
	failed on the server is answered with that status (500), and `page.error` is set, though the
	page renders as usual. Hydrating a part that failed on the server needs the fix in
	`patches/svelte@5.57.1.patch`.

	With `deferred`, the parts render in the browser only, so one that fails can't make the page an
	error: the server renders a skeleton card per module in their place, without loading their
	components or running their queries, and after hydration the parts load and replace it. (A
	boundary with a `pending` snippet: the server renders only the snippet, the browser its
	children.) Which modules add something is known before that, from the tenant that the app
	shell has already loaded, so for a tenant whose modules add nothing here there's no skeleton
	either. The dashboard defers its modules' cards; a record's page server-renders its parts.
-->
<script lang="ts" generics="Name extends SlotName">
	import { type SlotName, type SlotProps, slotLoaders } from "#lib/modules/manifests.ts";

	import ModuleSlotParts from "./module-slot-parts.svelte";
	import { getCurrentTenant } from "./session.remote.ts";

	let {
		name,
		props,
		class: className = "contents",
		deferred = false,
	}: {
		name: Name;
		props: SlotProps[Name];
		class?: string;
		/** Render the parts in the browser only, with a skeleton until they've loaded. */
		deferred?: boolean;
	} = $props();

	// The app shell has loaded the tenant already (the layout awaits it), so this waits on nothing.
	const tenant = $derived(await getCurrentTenant());
	const contributions = $derived(slotLoaders(name, tenant.modules));
</script>

<!-- A card per module, while a deferred slot's parts load. -->
{#snippet skeleton()}
	{#each contributions as { id } (id)}
		<Card.Root data-module-slot-pending={id} aria-busy="true">
			<Card.Header>
				<Skeleton class="h-5 w-1/3" />
				<Skeleton class="h-4 w-2/3" />
			</Card.Header>
			<Card.Content>
				<Skeleton class="h-32 w-full" />
			</Card.Content>
		</Card.Root>
	{/each}
{/snippet}

{#if contributions.length}
	<div class={className}>
		<svelte:boundary pending={deferred ? skeleton : undefined}>
			<ModuleSlotParts {name} {props} {contributions} />
		</svelte:boundary>
	</div>
{/if}
