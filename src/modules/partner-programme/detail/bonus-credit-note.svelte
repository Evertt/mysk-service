<!--
	@component
	How a closed year's cash bonus is paid out: the invoicing module's credit note for it, with where
	it stands, or, for a manager, a way to make one (a draft, which the office issues on its page).
	Without one the cash is paid outside the app.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import { toast } from "svelte-sonner";

	import SubmitButton from "#lib/components/form/submit-button.svelte";
	import { submitted } from "#lib/components/form/submitted.ts";
	import { formatCents } from "#lib/i18n/index.ts";
	import type { CreditNoteStatus } from "#modules/invoices/api/credit-notes.server.ts";

	import { createBonusCreditNote } from "../partners.remote.ts";

	let {
		code,
		year,
		creditNote,
		canManage,
	}: { code: string; year: number; creditNote: CreditNoteStatus | null; canManage: boolean } =
		$props();

	const form = $derived(createBonusCreditNote.for(`${code}:${year}`));
	const paying = $derived(creditNote && creditNote.status !== "void" ? creditNote : null);
	const states = {
		draft: m.partners_credit_note_draft,
		sent: m.partners_credit_note_sent,
		paid: m.partners_credit_note_settled,
		void: m.partners_credit_note_void,
	};
</script>

{#if paying}
	<p class="text-sm" data-bonus-credit-note={paying.number}>
		{m.partners_credit_note_paid_with()}
		<a
			class="font-medium underline-offset-4 hover:underline"
			href={resolve("/(app)/(modules)/invoices/credit-notes/[number]", { number: paying.number })}
			>{paying.number}</a
		>
		· {states[paying.status]()} · <span class="tabular-nums">{formatCents(paying.total)}</span>
	</p>
{:else if canManage}
	<form
		{...form.enhance(async ({ submit }) => {
			if (await submitted(submit)) toast.success(m.partners_credit_note_created());
		})}
		class="flex flex-col gap-2"
	>
		<input {...form.fields.code.as("hidden", code)} />
		<input {...form.fields.year.as("hidden", String(year))} />
		<p class="text-xs text-muted-foreground">{m.partners_credit_note_offer()}</p>
		<SubmitButton size="sm" variant="outline" class="w-fit" pending={form.pending}>
			{m.partners_credit_note_create()}
		</SubmitButton>
		<Field.FieldError errors={form.fields.allIssues()} />
	</form>
{:else}
	<p class="text-xs text-muted-foreground">{m.partners_credit_note_outside()}</p>
{/if}
