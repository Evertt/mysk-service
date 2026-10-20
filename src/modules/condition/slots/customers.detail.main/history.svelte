<!--
	@component
	The service history of a customer's units on its page (`customers.detail.main`,
	`#lib/customers/extensions.ts`): what happened to them lately.
-->
<script lang="ts">
	import FeedCard from "../../overview/feed-card.svelte";

	let { code }: { code: string } = $props();
</script>

<FeedCard customer={code} limit={10} />
