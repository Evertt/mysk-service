<script lang="ts">
	import { resolve } from "$app/paths";

	let { id, name }: { id: number; name: string } = $props();
</script>

<a
	href={resolve("/(app)/engineers/[id]", { id: String(id) })}
	class="font-medium underline-offset-4 hover:underline"
>
	{name}
</a>
