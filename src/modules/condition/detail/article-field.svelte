<!--
	@component
	The component dialog's article: one of the tenant's materials, or none. Its options come from the
	server as you type (`findArticles`, the first matches by SKU), so a tenant with any number of
	materials finds each one; the chosen one is the form field's value, in a hidden input.
-->
<script lang="ts">
	import type { RemoteFormField } from "$app/server";
	import CheckIcon from "@lucide/svelte/icons/check";
	import ChevronsUpDownIcon from "@lucide/svelte/icons/chevrons-up-down";
	import { untrack } from "svelte";

	import FormField from "#lib/components/form/form-field.svelte";
	import { cn } from "#lib/utils.ts";

	import type { Article } from "../api/extensions.ts";
	import { findArticles } from "../components.remote.ts";

	/** An article as a search finds it: with the points its shop product fixes. */
	type Found = Awaited<ReturnType<typeof findArticles>>["articles"][number];

	let {
		field,
		label,
		description,
		article,
		onchoose,
	}: {
		field: RemoteFormField<string>;
		label: string;
		description?: string;
		/** The article to start from, e.g. the component's being changed. */
		article: Article | null;
		/** After an article was chosen (none: `null`). */
		onchoose?: (article: Found | null) => void;
	} = $props();

	/** How long typing waits before searching. */
	const searchDelay = 250;

	// Starts from `article`, then follows the choices: the dialog is made again for another component.
	let chosen = $state.raw<Article | null>(untrack(() => article));
	let open = $state(false);
	let search = $state("");
	let found = $state.raw<Awaited<ReturnType<typeof findArticles>>>();
	let searching = $state(false);

	// Searching, while open: right away when opened, then once typing pauses.
	$effect(() => {
		if (!open) return;
		const term = search.trim();
		let current = true;
		searching = true;
		const timer = setTimeout(
			async () => {
				try {
					const result = await findArticles(term);
					if (current) found = result;
				} catch {
					// Keep what was found before.
				} finally {
					if (current) searching = false;
				}
			},
			term ? searchDelay : 0,
		);
		return () => {
			current = false;
			clearTimeout(timer);
		};
	});

	const name = (each: Article) => `${each.sku} · ${each.name}`;

	function choose(next: Found | null) {
		chosen = next;
		open = false;
		search = "";
		onchoose?.(next);
	}
</script>

<FormField {label} issues={field.issues()} {description}>
	{#snippet children({ id })}
		<input {...field.as("hidden", chosen ? String(chosen.id) : "")} />
		<Popover.Root bind:open>
			<Popover.Trigger {id}>
				{#snippet child({ props })}
					<Button
						{...props}
						variant="outline"
						role="combobox"
						aria-expanded={open}
						class="w-full justify-between font-normal"
					>
						<span class={cn("truncate", !chosen && "text-muted-foreground")}>
							{chosen ? name(chosen) : m.condition_component_article_none()}
						</span>
						<ChevronsUpDownIcon class="opacity-50" />
					</Button>
				{/snippet}
			</Popover.Trigger>
			<Popover.Content class="w-(--bits-popover-anchor-width) min-w-72 p-0" align="start">
				<Command.Root shouldFilter={false}>
					<Command.Input
						bind:value={search}
						placeholder={m.condition_component_article_search()}
						aria-label={m.condition_component_article_search()}
					/>
					<Command.List aria-busy={searching || undefined}>
						<Command.Group class={cn(searching && "opacity-60 transition-opacity")}>
							{#if !search.trim()}
								<Command.Item value="none" onSelect={() => choose(null)}>
									{@render tick(!chosen)}
									<span class="truncate">{m.condition_component_article_none()}</span>
								</Command.Item>
							{/if}
							{#each found?.articles ?? [] as each (each.id)}
								<Command.Item value={String(each.id)} onSelect={() => choose(each)}>
									{@render tick(chosen?.id === each.id)}
									<span class="truncate">{name(each)}</span>
								</Command.Item>
							{/each}
						</Command.Group>
						{#if !found?.articles.length}
							<p class="py-6 text-center text-sm text-muted-foreground" role="status">
								{searching || !found
									? m.common_table_filter_searching()
									: m.common_table_filter_no_results()}
							</p>
						{:else if found.more}
							<p class="px-2 py-1.5 text-xs text-muted-foreground">
								{m.common_table_filter_more()}
							</p>
						{/if}
					</Command.List>
				</Command.Root>
			</Popover.Content>
		</Popover.Root>
	{/snippet}
</FormField>

{#snippet tick(on: boolean)}
	<CheckIcon class={cn("size-4 shrink-0", !on && "invisible")} />
{/snippet}
