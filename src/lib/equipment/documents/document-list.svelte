<!--
	@component
	A unit's documents as every shell lists them, phone first: grouped by kind (manuals first), each a
	row as wide as the list that opens it (`/documents/<id>`, served to whoever may read the unit): a
	PDF or an image in a new tab, a Word or Excel file saved by its name. Its format, size and when it
	was added under its title; `actions` adds the office's buttons beside it.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import DownloadIcon from "@lucide/svelte/icons/download";
	import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
	import FileIcon from "@lucide/svelte/icons/file";
	import FileImageIcon from "@lucide/svelte/icons/file-image";
	import FileSpreadsheetIcon from "@lucide/svelte/icons/file-spreadsheet";
	import FileTextIcon from "@lucide/svelte/icons/file-text";
	import type { Snippet } from "svelte";

	import { formatDate, formatFileSize, label } from "#lib/i18n/index.ts";
	import { equipmentDocumentKinds } from "#lib/models.ts";

	import { documentFormat, opensInline, type UnitDocument } from "./documents.ts";

	let {
		documents,
		actions,
		size = "default",
	}: {
		documents: readonly UnitDocument[];
		/** The buttons beside a document, e.g. the office's edit and delete. */
		actions?: Snippet<[UnitDocument]>;
		/** `lg` for the engineer portal's larger rows on a phone. */
		size?: "default" | "lg";
	} = $props();

	const groups = $derived(
		equipmentDocumentKinds
			.map((kind) => ({ kind, documents: documents.filter((document) => document.kind === kind) }))
			.filter((group) => group.documents.length),
	);

	/** The icon of a document's format. */
	const iconOf = (type: string) =>
		type === "application/pdf"
			? FileTextIcon
			: type.startsWith("image/")
				? FileImageIcon
				: type.includes("spreadsheet")
					? FileSpreadsheetIcon
					: FileIcon;
</script>

<div class="flex flex-col gap-4" data-documents>
	{#each groups as group (group.kind)}
		<section class="flex flex-col gap-1" aria-label={label("equipmentDocumentKind", group.kind)}>
			<h3 class="text-xs font-medium tracking-wide text-muted-foreground uppercase">
				{label("equipmentDocumentKind", group.kind)}
			</h3>
			<ul class="divide-y rounded-md border">
				{#each group.documents as document (document.id)}
					{@const inline = opensInline(document.contentType)}
					{@const Icon = iconOf(document.contentType)}
					{@const OpenIcon = inline ? ExternalLinkIcon : DownloadIcon}
					<li class="flex items-center gap-1 pr-1" data-document={document.id}>
						<a
							href={resolve("/documents/[id]", { id: String(document.id) })}
							target={inline ? "_blank" : undefined}
							rel={inline ? "noopener" : undefined}
							download={inline ? undefined : document.filename}
							class={[
								"flex min-w-0 flex-1 items-center gap-3 rounded-md px-3 transition-colors outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50",
								size === "lg" ? "py-3" : "py-2",
							]}
							aria-label={inline
								? m.equipment_documents_open({ title: document.title })
								: m.equipment_documents_download({ title: document.title })}
						>
							<Icon class="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
							<span class="flex min-w-0 flex-1 flex-col">
								<span class="truncate text-sm font-medium" data-document-title>
									{document.title}
								</span>
								<span class="truncate text-xs text-muted-foreground">
									{[
										documentFormat(document.contentType),
										formatFileSize(document.size),
										m.equipment_documents_added_on({ date: formatDate(document.createdAt) }),
									].join(" · ")}
								</span>
							</span>
							<OpenIcon class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
						</a>
						{@render actions?.(document)}
					</li>
				{/each}
			</ul>
		</section>
	{/each}
</div>
