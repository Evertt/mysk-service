<!--
	@component
	What the current tenant's modules add to a core page at the slot `point` (see `defineSlot()` in
	`#lib/extensions/define.ts`), with `props` passed on (and, at a form slot, `defineFormSlot()`,
	each module's part of the form's `fields`, the form's `modules` field, as `fields`): the contributions in
	`#lib/extensions/contributions.gen.ts` to that point, of the modules the tenant has, in registry
	order. Wrapped in a `div` with `class` (by default `contents`, so the components lay out as the
	page's own), or nothing if no module adds anything.

	Each contribution is rendered in a boundary of its own (`ErrorBoundary`, which logs and reports
	the error, and resets a part that failed for an unknown reason once by itself), so when it fails
	(its remote query throws, its chunk doesn't load) the page and the other contributions still
	render, and it shows a small card saying so, with a retry. Trying again loads the contribution
	again, in a new boundary: resetting the boundary alone wouldn't load a chunk that failed. The
	parts are server-rendered and awaited like the rest of the page, without a loading state.

	The components are loaded together, up front: loading each in a component of its own (an async
	`$derived` per part) froze the browser after an order was deleted from its page (Svelte 5.57).
	A component that doesn't load is thrown inside its boundary, so it fails like one that throws.

	The error reaches the boundary through SvelteKit's `transformError`, which runs it through
	`handleError` (so the server logs it, and `failed` gets an `App.Error`). SvelteKit also takes it
	as the page's error: a page whose part failed on the server is answered with that status (500),
	and `page.error` is set, though the page renders as usual. Hydrating a part that failed on the
	server needs the fix in `patches/svelte@5.57.1.patch`.
-->
<script lang="ts" generics="Props extends Record<string, unknown>">
	import { browser } from "$app/env";
	import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";

	import { getTenantModules } from "#lib/auth/session.remote.ts";
	import CrashSwitch from "#lib/errors/crash-switch.svelte";
	import { crashSwitches } from "#lib/errors/crash-switch.ts";
	import ErrorBoundary from "#lib/errors/error-boundary.svelte";
	import { slotContributions } from "#lib/extensions/contributions.gen.ts";
	import type { FormSlotPoint, SlotContribution, SlotPoint } from "#lib/extensions/define.ts";
	import { formPartKey } from "#lib/extensions/form-part-key.ts";
	import { type ModuleId, modules } from "#lib/modules/manifests.ts";

	let {
		point,
		props,
		fields,
		class: className = "contents",
	}: (
		| { point: SlotPoint<Props>; fields?: undefined }
		| {
				point: FormSlotPoint<Props>;
				/** The form's `modules` field, whose `<key>` (`formPartKey()`) is each module's part. */
				fields: object;
		  }
	) & { props: Props; class?: string } = $props();

	/** What a contribution gets besides `props`: at a form slot, its module's part's fields. */
	const partOf = (module: ModuleId) =>
		fields ? { fields: (fields as Record<string, unknown>)[formPartKey(module)] } : {};

	/** How often each contribution was tried again: each time loads it again, in a new boundary. */
	const attempts = $state<Record<string, number>>({});

	const enabled = $derived(await getTenantModules());
	const parts = $derived(
		await Promise.all(
			slotContributions
				.filter((entry) => entry.point === point.id && enabled.includes(entry.module))
				.map(({ id, module, load }) => {
					const attempt = attempts[id] ?? 0;
					// A contribution to this point takes this point's props (`slotContribution()`), and at a
					// form slot its part's fields (`formSlotContribution()`).
					return (load as SlotContribution<Props & { fields?: unknown }>["load"])().then(
						({ default: Slot }) => ({ id, module, attempt, Slot, error: undefined }),
						(error: unknown) => ({ id, module, attempt, Slot: undefined, error }),
					);
				}),
		),
	);

	const labelOf = (id: ModuleId) => modules.find((module) => module.id === id)?.label ?? id;

	/** Fails the boundary it's rendered in with `error`. */
	const fail = (error: unknown): never => {
		throw error;
	};
</script>

{#if parts.length}
	<div class={className}>
		{#each parts as { id, module, attempt, Slot, error } (id)}
			{#key attempt}
				<ErrorBoundary name={`part:${id}`}>
					{#if crashSwitches}
						<!-- A test switch (e2e and dev only): this part crashes when a test asks. -->
						<CrashSwitch where={`part:${id}`} />
					{/if}
					{#if Slot}
						<Slot {...props} {...partOf(module)} />
					{:else if browser}
						<!-- In the browser, fails the boundary once mounted, not while rendering: a chunk that
							loaded on the server and not in the browser would fail it mid-hydration, after
							which Svelte (5.57) hydrated the next parts into the wrong place and showed them
							twice. -->
						<span hidden {@attach () => fail(error)}></span>
					{:else}
						<!-- On the server, while rendering, so the page's HTML has the part's notice. -->
						{fail(error)}
					{/if}

					{#snippet failed()}
						<Card.Root size="sm" data-extension-failed={id}>
							<Card.Content class="flex-row items-center gap-3 text-muted-foreground">
								<TriangleAlertIcon class="size-4 shrink-0" aria-hidden="true" />
								<p class="flex-1">{m.common_error_module_part({ module: labelOf(module) })}</p>
								<Button variant="outline" size="sm" onclick={() => (attempts[id] = attempt + 1)}>
									{m.common_try_again()}
								</Button>
							</Card.Content>
						</Card.Root>
					{/snippet}
				</ErrorBoundary>
			{/key}
		{/each}
	</div>
{/if}
