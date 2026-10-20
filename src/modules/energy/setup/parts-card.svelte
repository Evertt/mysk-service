<!--
	@component
	A card of a site's zones, consumers or doors on its setup page: a table of them (`heads`, and a
	row's `cells`), each with its edit dialog (`edit`) and a delete button that asks first and shows
	the server's refusal (it holds measurements), the dialog that adds one (`add`), and `empty` when
	there are none. A row is marked `data-setup-<kind>` with its `name`, which its toast names too.
-->
<script lang="ts" generics="Part extends { id: number }">
	import type { RemoteForm } from "$app/server";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";
	import type { Snippet } from "svelte";

	import ConfirmDialog from "#lib/components/form/confirm-dialog.svelte";

	let {
		kind,
		siteId,
		title,
		description,
		parts,
		name,
		empty,
		remove,
		add,
		heads,
		cells,
		edit,
	}: {
		/** `zone`, `consumer` or `door`: the card is `data-setup="<kind>s"`. */
		kind: string;
		siteId: number;
		title: string;
		description: Snippet | string;
		parts: Part[];
		/** What a part is called, e.g. a zone's code. */
		name: (part: Part) => string;
		empty: string;
		remove: {
			form: RemoteForm<{ energySiteId: string; id: string }, unknown>;
			/** The question, e.g. "Delete zone Z-A?"; also the button's label. */
			title: (part: Part) => string;
			description: string;
		};
		add: Snippet;
		heads: Snippet;
		cells: Snippet<[Part]>;
		edit: Snippet<[Part]>;
	} = $props();
</script>

<Card.Root data-setup="{kind}s">
	<Card.Header>
		<Card.Title>{title}</Card.Title>
		<Card.Description>
			{#if typeof description === "string"}{description}{:else}{@render description()}{/if}
		</Card.Description>
		<Card.Action>{@render add()}</Card.Action>
	</Card.Header>
	<Card.Content>
		{#if parts.length}
			<div class="overflow-x-auto">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							{@render heads()}
							<Table.Head class="w-0">
								<span class="sr-only">{m.energy_setup_actions()}</span>
							</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each parts as part (part.id)}
							<Table.Row {...{ [`data-setup-${kind}`]: name(part) }}>
								{@render cells(part)}
								<Table.Cell>
									<div class="flex justify-end gap-1">
										{@render edit(part)}
										<ConfirmDialog
											form={remove.form.for(String(part.id))}
											hidden={{ energySiteId: String(siteId), id: String(part.id) }}
											title={remove.title(part)}
											description={remove.description}
											confirmLabel={m.common_delete()}
											destructive
											done={m.energy_setup_deleted({ name: name(part) })}
										>
											{#snippet trigger(props)}
												<Button
													{...props}
													variant="ghost"
													size="icon-sm"
													aria-label={remove.title(part)}
												>
													<Trash2Icon />
												</Button>
											{/snippet}
										</ConfirmDialog>
									</div>
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</div>
		{:else}
			<p class="text-sm text-muted-foreground">{empty}</p>
		{/if}
	</Card.Content>
</Card.Root>
