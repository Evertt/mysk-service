<!--
	@component
	A bug report's recording, replayed with rrweb-player (loaded when it's shown), beside the
	console's errors and warnings and the page's requests: clicking one jumps the replay to its moment.
-->
<script lang="ts">
	import type { Attachment } from "svelte/attachments";

	import { consoleEntries, type RecordedEvent, requestEntries } from "#lib/bug-reports/events.ts";
	import type { ReportContext } from "#lib/bug-reports/report.ts";
	import { formatStopwatch, numberFormatter } from "#lib/i18n/format.ts";

	let { events, context }: { events: RecordedEvent[]; context: ReportContext } = $props();

	/** rrweb-player's instance, as far as this uses it. */
	interface Player {
		goto(offset: number, play?: boolean): void;
		$destroy(): void;
	}

	let player: Player | undefined;

	const consoleLog = $derived(consoleEntries(events));
	const requests = $derived(requestEntries(events));
	const milliseconds = numberFormatter({ style: "unit", unit: "millisecond" });
	const kilobytes = numberFormatter({ style: "unit", unit: "kilobyte", maximumFractionDigits: 1 });

	/** Starts the player in `node`, as wide as it is and as high as the recorded screen's ratio. */
	const mountPlayer: Attachment<HTMLElement> = (node) => {
		let destroyed = false;
		let instance: Player | undefined;
		const width = node.clientWidth;
		const { viewport } = context;
		const height = Math.round(Math.min((width * viewport.height) / viewport.width, 720));
		void Promise.all([import("rrweb-player"), import("rrweb-player/dist/style.css")]).then(
			([{ default: RrwebPlayer }]) => {
				if (destroyed) return;
				instance = new RrwebPlayer({
					target: node,
					props: {
						events: events as unknown as ConstructorParameters<
							typeof RrwebPlayer
						>[0]["props"]["events"],
						width,
						height,
						autoPlay: false,
					},
				});
				player = instance;
			},
		);
		return () => {
			destroyed = true;
			instance?.$destroy();
			player = undefined;
		};
	};

	const jump = (offset: number) => player?.goto(offset, false);
</script>

<div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
	<div
		class="min-w-0 overflow-hidden rounded-lg border"
		data-slot="bug-report-player"
		{@attach mountPlayer}
	></div>
	<div class="flex min-w-0 flex-col gap-6">
		<section class="flex flex-col gap-2">
			<h2 class="text-sm font-medium">{m.bugs_console()}</h2>
			{#if consoleLog.length === 0}
				<p class="text-sm text-muted-foreground">{m.bugs_console_empty()}</p>
			{:else}
				<ol class="flex max-h-80 flex-col gap-1 overflow-y-auto" data-slot="bug-report-console">
					{#each consoleLog as { offset, entry }, index (index)}
						<li>
							<button
								type="button"
								class="flex w-full gap-2 rounded px-2 py-1 text-left text-xs hover:bg-muted"
								title={m.bugs_jump({ time: formatStopwatch(offset) })}
								onclick={() => jump(offset)}
							>
								<span class="shrink-0 font-mono text-muted-foreground tabular-nums">
									{formatStopwatch(offset)}
								</span>
								<span
									class={[
										"min-w-0 font-mono break-words",
										entry.level === "error" ? "text-destructive" : "text-amber-600",
									]}
								>
									{entry.text}
								</span>
							</button>
						</li>
					{/each}
				</ol>
			{/if}
		</section>
		<section class="flex flex-col gap-2">
			<h2 class="text-sm font-medium">{m.bugs_requests()}</h2>
			{#if requests.length === 0}
				<p class="text-sm text-muted-foreground">{m.bugs_requests_empty()}</p>
			{:else}
				<ol class="flex max-h-80 flex-col gap-1 overflow-y-auto" data-slot="bug-report-requests">
					{#each requests as { offset, entry }, index (index)}
						<li>
							<button
								type="button"
								class="flex w-full items-baseline gap-2 rounded px-2 py-1 text-left text-xs hover:bg-muted"
								title={m.bugs_jump({ time: formatStopwatch(offset) })}
								onclick={() => jump(offset)}
							>
								<span class="shrink-0 font-mono text-muted-foreground tabular-nums">
									{formatStopwatch(offset)}
								</span>
								<span class="min-w-0 flex-1 truncate font-mono">{entry.name}</span>
								<span
									class={[
										"shrink-0 font-mono tabular-nums",
										(entry.status ?? 500) >= 400 && "text-destructive",
									]}
								>
									{entry.status ?? m.bugs_request_failed()}
								</span>
								<span class="shrink-0 text-muted-foreground tabular-nums">
									{milliseconds(entry.durationMs)}
								</span>
								{#if entry.size !== null}
									<span class="shrink-0 text-muted-foreground tabular-nums">
										{kilobytes(entry.size / 1024)}
									</span>
								{/if}
							</button>
						</li>
					{/each}
				</ol>
			{/if}
		</section>
	</div>
</div>
