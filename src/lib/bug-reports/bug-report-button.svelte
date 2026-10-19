<!--
	@component
	The record button of the office's header and the engineer portal's: a quiet bug icon that starts
	recording the screen (`recorder.svelte.ts`); while it records, a red pulsing dot with the time it
	has run, which stops it and asks for a note before the report is sent.
-->
<script lang="ts">
	import { version } from "$app/env";
	import { page } from "$app/state";
	import BugIcon from "@lucide/svelte/icons/bug";
	import SendIcon from "@lucide/svelte/icons/send";
	import { onMount } from "svelte";
	import { toast } from "svelte-sonner";

	import { getTimeZone } from "#lib/dates.ts";
	import { formatStopwatch, numberFormatter } from "#lib/i18n/format.ts";
	import { getLocale } from "#lib/paraglide/runtime.js";

	import { collectContext } from "./context.ts";
	import { bugRecorder } from "./recorder.svelte.ts";
	import { maxReportBytes } from "./report.ts";

	const recorder = bugRecorder();
	const time = $derived(formatStopwatch(recorder.elapsed));
	const megabytes = numberFormatter({ style: "unit", unit: "megabyte", maximumFractionDigits: 0 });

	// A recording a reload interrupted is offered for sending.
	onMount(() => recorder.restore());

	async function start() {
		const context = collectContext(
			{ url: page.url.href, routeId: page.route.id },
			{ version, locale: getLocale(), timeZone: getTimeZone() },
		);
		try {
			await recorder.start(context);
			toast.info(m.bugs_recording_started());
		} catch {
			toast.error(m.bugs_recording_failed());
		}
	}

	/** The popover's open state, which the button and the popover itself change. */
	function setOpen(open: boolean) {
		if (open) {
			if (recorder.phase === "idle") void start();
			else if (recorder.phase === "recording") recorder.stop();
			else recorder.reviewing = true;
		} else if (recorder.phase !== "sending") {
			// Closed without a choice: the recording stays, the button opens it again.
			recorder.reviewing = false;
		}
	}

	async function send() {
		const result = await recorder.send();
		if (result.sent) {
			toast.success(m.bugs_sent());
		} else if (result.failure === "too-large") {
			toast.error(m.bugs_too_large({ size: megabytes(maxReportBytes / 1024 / 1024) }));
		} else if (result.failure === "network" || !result.message) {
			toast.error(m.bugs_send_failed_network());
		} else {
			toast.error(m.bugs_send_failed({ reason: result.message }));
		}
	}

	const label = $derived(
		recorder.phase === "recording"
			? m.bugs_recording_button({ time })
			: recorder.phase === "idle"
				? m.bugs_report_button()
				: m.bugs_review_button(),
	);
</script>

<svelte:window onpagehide={() => recorder.keep()} />

<Popover.Root bind:open={() => recorder.reviewing, setOpen}>
	<Tooltip.Provider>
		<Tooltip.Root disabled={recorder.reviewing}>
			<Tooltip.Trigger>
				{#snippet child({ props: tooltipProps })}
					<Popover.Trigger {...tooltipProps}>
						{#snippet child({ props })}
							<Button
								{...props}
								variant="ghost"
								size={recorder.phase === "recording" ? "sm" : "icon-sm"}
								aria-label={label}
								data-slot="bug-report-button"
								data-phase={recorder.phase}
							>
								{#if recorder.phase === "recording"}
									<span class="relative flex size-2.5" aria-hidden="true">
										<span
											class="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-75"
										></span>
										<span class="relative inline-flex size-2.5 rounded-full bg-red-600"></span>
									</span>
									<span class="font-mono text-xs tabular-nums" aria-hidden="true">{time}</span>
								{:else if recorder.phase === "idle"}
									<BugIcon />
								{:else}
									<SendIcon class="text-red-600" />
								{/if}
							</Button>
						{/snippet}
					</Popover.Trigger>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content>{label}</Tooltip.Content>
		</Tooltip.Root>
	</Tooltip.Provider>
	<Popover.Content align="end" class="w-80" data-slot="bug-report-review">
		<form
			class="flex flex-col gap-3"
			onsubmit={(event) => {
				event.preventDefault();
				void send();
			}}
		>
			{#if recorder.interrupted}
				<p class="text-sm text-muted-foreground">{m.bugs_interrupted()}</p>
			{/if}
			<div class="flex flex-col gap-2">
				<div class="flex items-baseline justify-between gap-2">
					<Label for="bug-report-note">{m.bugs_note_label()}</Label>
					<span class="text-xs text-muted-foreground">{m.bugs_recorded_for({ time })}</span>
				</div>
				<Textarea
					id="bug-report-note"
					bind:value={recorder.note}
					placeholder={m.bugs_note_placeholder()}
					rows={4}
					disabled={recorder.phase === "sending"}
				/>
			</div>
			<div class="flex justify-end gap-2">
				<Button
					type="button"
					variant="ghost"
					disabled={recorder.phase === "sending"}
					onclick={() => recorder.discard()}
				>
					{m.bugs_discard()}
				</Button>
				<Button type="submit" disabled={recorder.phase === "sending"}>
					{#if recorder.phase === "sending"}<Spinner />{/if}
					{m.bugs_send()}
				</Button>
			</div>
		</form>
	</Popover.Content>
</Popover.Root>
