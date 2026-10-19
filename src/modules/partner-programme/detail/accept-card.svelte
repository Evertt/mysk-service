<!--
	@component
	For a manager, on the page of a customer that isn't a partner: accepts it into the programme.
-->
<script lang="ts">
	import { toast } from "svelte-sonner";

	import SubmitButton from "#lib/components/form/submit-button.svelte";
	import { submitted } from "#lib/components/form/submitted.ts";

	import { acceptPartner } from "../partners.remote.ts";

	let { customer }: { customer: { code: string; name: string } } = $props();

	const form = $derived(acceptPartner.for(customer.code));
</script>

<Card.Root data-partner-card>
	<Card.Header>
		<Card.Title>{m.partners_module_name()}</Card.Title>
		<Card.Description>{m.partners_not_partner({ name: customer.name })}</Card.Description>
	</Card.Header>
	<Card.Content>
		<form
			{...form.enhance(async ({ submit }) => {
				if (await submitted(submit)) toast.success(m.partners_accepted({ name: customer.name }));
			})}
			class="flex flex-col gap-3"
		>
			<input {...form.fields.code.as("hidden", customer.code)} />
			<Field.FieldError errors={form.fields.allIssues()} />
			<SubmitButton variant="outline" class="w-fit" pending={form.pending}>
				{m.partners_accept()}
			</SubmitButton>
		</form>
	</Card.Content>
</Card.Root>
