<!--
	@component
	A link to a credit note's page, for the invoice's card and the credit notes' table.
-->
<script lang="ts">
	import { resolve } from "$app/paths";

	let { number }: { number: string } = $props();
</script>

<a
	href={resolve("/(app)/(modules)/invoices/credit-notes/[number]", { number })}
	class="font-medium whitespace-nowrap underline-offset-4 hover:underline"
>
	{number}
</a>
