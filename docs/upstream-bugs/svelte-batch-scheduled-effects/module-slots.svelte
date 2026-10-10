<!--
	@component
	What the current tenant's modules add to a core page at `name` (see `slots` in
	`#lib/modules/manifests.ts`), with `props` passed on. Wrapped in a `div` with `class` (by default
	`contents`, so the components lay out as the page's own), or nothing if no module adds anything.

	Each module's part is rendered in a boundary of its own, so when it fails (its remote query
	throws, its chunk doesn't load) the page and the other modules' parts still render, and it shows
	a small card saying so, with a retry.

	By default the parts are server-rendered and awaited like the rest of the page, without a
	loading state. With `deferred` they render in the browser only: the server renders a skeleton
	card per module in their place and neither loads their components nor runs their queries, and
	after hydration the parts load and replace the skeleton (a boundary with a `pending` snippet,
	which the server renders instead of its children). Which modules add something is known before
	that, from the tenant the app shell has already loaded, so a page whose tenant has none renders
	nothing, not even a skeleton. The dashboard defers its modules' cards, so one that fails can't
	make it an error page (see below); the parts of a record's page are server-rendered.

	The components are loaded together, up front: loading each in a component of its own (an async
	`$derived` per part) froze the browser after an order was deleted from its page (Svelte 5.57).
	A component that doesn't load is thrown inside its boundary, so it fails like one that throws.

	The error of a part that fails on the server reaches the boundary through SvelteKit's
	`transformError`, which runs it through `handleError` (so the server logs it, and `failed` gets
	an `App.Error`). SvelteKit also takes it as the page's error: a page whose part failed on the
	server is answered with that status (500), and `page.error` is set, though the page renders as
	usual. Hydrating a part that failed on the server needs the fix in
	`patches/svelte@5.57.1.patch`. A deferred part fails in the browser, which doesn't touch the
	page's status.
-->
<script lang="ts" generics="Name extends SlotName">
	import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";

	import {
		type ModuleId,
		modules,
		type SlotName,
		type SlotProps,
		slotLoaders,
	} from "#lib/modules/manifests.ts";

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

	/** How often each module's part was tried again: each time loads it again, in a new boundary. */
	const attempts = $state<Partial<Record<ModuleId, number>>>({});

	// The app shell has loaded the tenant already, so this doesn't wait on anything new.
	const tenant = $derived(await getCurrentTenant());
	const contributions = $derived(slotLoaders(name, tenant.modules));

	/** Loads the parts' components, together; one that doesn't load comes with its error. */
	const loadParts = () =>
		Promise.all(
			contributions.map(({ id, load }) => {
				const attempt = attempts[id] ?? 0;
				return load().then(
					({ default: Slot }) => ({ id, attempt, Slot, error: undefined }),
					(error: unknown) => ({ id, attempt, Slot: undefined, error }),
				);
			}),
		);

	const labelOf = (id: ModuleId) => modules.find((module) => module.id === id)?.label ?? id;

	/** Fails the boundary it's rendered in with `error`. */
	const fail = (error: unknown): never => {
		throw error;
	};
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
		<!-- With a `pending` snippet, the server renders only that, and the browser the parts. -->
		<svelte:boundary pending={deferred ? skeleton : undefined}>
			{#each await loadParts() as { id, attempt, Slot, error } (id)}
				{#key attempt}
					<svelte:boundary
						onerror={(error: unknown) =>
							console.error(`The ${id} module's part of the ${name} slot failed`, error)}
					>
						{#if Slot}
							<Slot {...props} />
						{:else}
							{fail(error)}
						{/if}

						{#snippet failed()}
							<Card.Root size="sm" data-module-slot-failed={id}>
								<Card.Content class="flex-row items-center gap-3 text-muted-foreground">
									<TriangleAlertIcon class="size-4 shrink-0" aria-hidden="true" />
									<p class="flex-1">{m.common_error_module_part({ module: labelOf(id) })}</p>
									<Button variant="outline" size="sm" onclick={() => (attempts[id] = attempt + 1)}>
										{m.common_try_again()}
									</Button>
								</Card.Content>
							</Card.Root>
						{/snippet}
					</svelte:boundary>
				{/key}
			{/each}
		</svelte:boundary>
	</div>
{/if}
