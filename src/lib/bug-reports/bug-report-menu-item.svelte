<!--
	@component
	"Report a problem" in a dropdown menu (the engineer portal's header menu): starts recording, as
	the record button does from idle. Only while nothing is recorded: from then on the record button
	(`whileActive`) is in the header, to stop the recording and send it.
-->
<script lang="ts">
	import BugIcon from "@lucide/svelte/icons/bug";

	import { bugRecorder } from "./recorder.svelte.ts";
	import { startBugReport } from "./start.ts";

	const recorder = bugRecorder();
</script>

{#if recorder.phase === "idle"}
	<DropdownMenu.Item data-slot="bug-report-menu-item" onSelect={() => void startBugReport()}>
		<BugIcon />
		{m.bugs_report_button()}
	</DropdownMenu.Item>
{/if}
