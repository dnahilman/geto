<script lang="ts">
	import { useFieldContext } from '../hooks/form-context.js';
	import CellContainer from './cell-container.svelte';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { CalendarDate, today, getLocalTimeZone } from '@internationalized/date';
	import {
		parseStandardDateTime,
		formatStandardDateTime,
		getShortcutDateTime,
		getMonthNames,
		getDecadeYears,
		getCalendarGrid,
		type DateShortcut
	} from '../utils/date-utils.js';

	const field = useFieldContext<string>();

	const initial = parseStandardDateTime(field.state.value);
	const defaultDate = initial.date ?? today(getLocalTimeZone());

	let selectedDate = $state<CalendarDate | undefined>(initial.date);
	let selectedHour = $state<number>(initial.hour);
	let selectedMinute = $state<number>(initial.minute);
	let selectedSecond = $state<number>(initial.second);

	let currentYear = $state<number>(defaultDate.year);
	let currentMonth = $state<number>(defaultDate.month);
	let viewMode = $state<'days' | 'months' | 'years'>('days');
	let isOpen = $state(true);

	let hourColRef = $state<HTMLDivElement | null>(null);
	let minuteColRef = $state<HTMLDivElement | null>(null);
	let secondColRef = $state<HTMLDivElement | null>(null);

	const monthNames = getMonthNames();
	const decade = $derived(getDecadeYears(currentYear));
	const calendarGrid = $derived(getCalendarGrid(currentYear, currentMonth));

	const hours = Array.from({ length: 24 }, (_, i) => i);
	const minutes = Array.from({ length: 60 }, (_, i) => i);
	const seconds = Array.from({ length: 60 }, (_, i) => i);

	function handleShortcut(shortcut: DateShortcut) {
		const res = getShortcutDateTime(shortcut);
		selectedDate = res.date;
		selectedHour = res.hour;
		selectedMinute = res.minute;
		selectedSecond = res.second;
		if (res.date) {
			currentYear = res.date.year;
			currentMonth = res.date.month;
		}
		field.handleChange(
			formatStandardDateTime(selectedDate, selectedHour, selectedMinute, selectedSecond)
		);
		viewMode = 'days';
	}

	function handleSelectDay(day: {
		year: number;
		month: number;
		day: number;
		dateValue: CalendarDate;
	}) {
		selectedDate = day.dateValue;
		currentYear = day.year;
		currentMonth = day.month;
		field.handleChange(
			formatStandardDateTime(selectedDate, selectedHour, selectedMinute, selectedSecond)
		);
	}

	function handleSelectMonth(m: number) {
		currentMonth = m;
		if (selectedDate) {
			try {
				selectedDate = new CalendarDate(
					currentYear,
					m,
					Math.min(selectedDate.day, new Date(currentYear, m, 0).getDate())
				);
				field.handleChange(
					formatStandardDateTime(selectedDate, selectedHour, selectedMinute, selectedSecond)
				);
			} catch {
				// fallback
			}
		}
		viewMode = 'days';
	}

	function handleSelectYear(y: number) {
		currentYear = y;
		if (selectedDate) {
			try {
				selectedDate = new CalendarDate(
					y,
					currentMonth,
					Math.min(selectedDate.day, new Date(y, currentMonth, 0).getDate())
				);
				field.handleChange(
					formatStandardDateTime(selectedDate, selectedHour, selectedMinute, selectedSecond)
				);
			} catch {
				// fallback
			}
		}
		viewMode = 'months';
	}

	function handleSelectHour(h: number) {
		selectedHour = h;
		if (!selectedDate) selectedDate = defaultDate;
		field.handleChange(
			formatStandardDateTime(selectedDate, selectedHour, selectedMinute, selectedSecond)
		);
	}

	function handleSelectMinute(m: number) {
		selectedMinute = m;
		if (!selectedDate) selectedDate = defaultDate;
		field.handleChange(
			formatStandardDateTime(selectedDate, selectedHour, selectedMinute, selectedSecond)
		);
	}

	function handleSelectSecond(s: number) {
		selectedSecond = s;
		if (!selectedDate) selectedDate = defaultDate;
		field.handleChange(
			formatStandardDateTime(selectedDate, selectedHour, selectedMinute, selectedSecond)
		);
	}

	function handlePrev() {
		if (viewMode === 'days') {
			if (currentMonth === 1) {
				currentMonth = 12;
				currentYear -= 1;
			} else {
				currentMonth -= 1;
			}
		} else if (viewMode === 'months') {
			currentYear -= 1;
		} else if (viewMode === 'years') {
			currentYear -= 10;
		}
	}

	function handleNext() {
		if (viewMode === 'days') {
			if (currentMonth === 12) {
				currentMonth = 1;
				currentYear += 1;
			} else {
				currentMonth += 1;
			}
		} else if (viewMode === 'months') {
			currentYear += 1;
		} else if (viewMode === 'years') {
			currentYear += 10;
		}
	}

	function scrollTimeColumn(container: HTMLElement | null, selectedVal: number) {
		if (!container) return;
		const target = container.querySelector(
			`[data-time-value="${selectedVal}"]`
		) as HTMLElement | null;
		if (target) {
			target.scrollIntoView({ block: 'center', behavior: 'instant' });
		}
	}

	$effect(() => {
		const parsed = parseStandardDateTime(field.state.value);
		selectedDate = parsed.date;
		selectedHour = parsed.hour;
		selectedMinute = parsed.minute;
		selectedSecond = parsed.second;
		if (parsed.date) {
			currentYear = parsed.date.year;
			currentMonth = parsed.date.month;
		}
	});

	$effect(() => {
		if (isOpen) {
			// Center the time lists after DOM renders
			setTimeout(() => {
				scrollTimeColumn(hourColRef, selectedHour);
				scrollTimeColumn(minuteColRef, selectedMinute);
				scrollTimeColumn(secondColRef, selectedSecond);
			}, 30);
		}
	});

	function formatDisplay(val: unknown): string {
		if (val === undefined || val === null || val === '') return '';
		const parsed = parseStandardDateTime(val as string | number | Date);
		if (!parsed.date) return String(val);
		return formatStandardDateTime(parsed.date, parsed.hour, parsed.minute, parsed.second);
	}
</script>

<CellContainer {field} {formatDisplay}>
	{#snippet children({ stopEditing })}
		<Popover.Root
			bind:open={isOpen}
			onOpenChange={(open: boolean) => {
				if (!open) {
					stopEditing();
				}
			}}
		>
			<Popover.Trigger
				class="flex h-full w-full items-center justify-between rounded-none border-0 bg-background px-2.5 py-1 font-mono text-xs shadow-none ring-1 ring-neutral-700 focus-visible:ring-1 focus-visible:ring-neutral-500"
			>
				<span class="truncate font-mono">
					{field.state.value ? formatDisplay(field.state.value) : 'YYYY-MM-DD HH:mm:ss'}
				</span>
				<CalendarIcon class="ml-1 size-3.5 shrink-0 text-muted-foreground" />
			</Popover.Trigger>

			<Popover.Content
				align="start"
				side="bottom"
				sideOffset={1}
				class="z-50 flex w-auto overflow-hidden rounded-md border border-neutral-800 bg-[#0d1117] p-0 text-neutral-200 shadow-2xl ring-1 ring-neutral-800 outline-hidden select-none"
			>
				<!-- 3-Panel Main Container -->
				<div class="flex h-[280px] divide-x divide-neutral-800 text-xs">
					<!-- Panel 1: Presets & Shortcuts (Left) -->
					<div
						class="flex w-24 flex-col justify-start gap-1 p-3 font-mono text-[11px] text-neutral-400"
					>
						<button
							type="button"
							class="rounded px-2 py-1 text-left font-mono transition-colors hover:bg-neutral-800 hover:text-white"
							onclick={() => handleShortcut('null')}
						>
							NULL
						</button>
						<button
							type="button"
							class="rounded px-2 py-1 text-left font-mono transition-colors hover:bg-neutral-800 hover:text-white"
							onclick={() => handleShortcut('now')}
						>
							now
						</button>
						<button
							type="button"
							class="rounded px-2 py-1 text-left font-mono transition-colors hover:bg-neutral-800 hover:text-white"
							onclick={() => handleShortcut('today')}
						>
							today
						</button>
						<button
							type="button"
							class="rounded px-2 py-1 text-left font-mono transition-colors hover:bg-neutral-800 hover:text-white"
							onclick={() => handleShortcut('tomorrow')}
						>
							tomorrow
						</button>
						<button
							type="button"
							class="rounded px-2 py-1 text-left font-mono transition-colors hover:bg-neutral-800 hover:text-white"
							onclick={() => handleShortcut('yesterday')}
						>
							yesterday
						</button>
					</div>

					<!-- Panel 2: Interactive Calendar (Center) -->
					<div class="flex w-[230px] flex-col p-2.5">
						<!-- Header with Navigation and View Switching -->
						<div class="mb-2 flex items-center justify-between px-1">
							<button
								type="button"
								class="flex size-6 items-center justify-center rounded text-neutral-400 hover:bg-neutral-800 hover:text-white"
								onclick={handlePrev}
								aria-label="Previous"
							>
								<ChevronLeftIcon class="size-3.5" />
							</button>

							<div class="flex items-center gap-1 font-sans text-xs font-semibold text-neutral-100">
								{#if viewMode === 'days'}
									<button
										type="button"
										class="rounded px-1 py-0.5 hover:bg-neutral-800 hover:text-white"
										onclick={() => (viewMode = 'months')}
									>
										{monthNames[currentMonth - 1].name}
									</button>
									<button
										type="button"
										class="rounded px-1 py-0.5 hover:bg-neutral-800 hover:text-white"
										onclick={() => (viewMode = 'years')}
									>
										{currentYear}
									</button>
								{:else if viewMode === 'months'}
									<button
										type="button"
										class="rounded px-1.5 py-0.5 hover:bg-neutral-800 hover:text-white"
										onclick={() => (viewMode = 'years')}
									>
										{currentYear}
									</button>
								{:else if viewMode === 'years'}
									<span class="px-1 py-0.5 font-mono">
										{decade.startYear} - {decade.endYear}
									</span>
								{/if}
							</div>

							<button
								type="button"
								class="flex size-6 items-center justify-center rounded text-neutral-400 hover:bg-neutral-800 hover:text-white"
								onclick={handleNext}
								aria-label="Next"
							>
								<ChevronRightIcon class="size-3.5" />
							</button>
						</div>

						<!-- View Mode: Days Grid -->
						{#if viewMode === 'days'}
							<div class="mb-1 grid grid-cols-7 text-center font-mono text-[10px] text-neutral-500">
								<span>Su</span>
								<span>Mo</span>
								<span>Tu</span>
								<span>We</span>
								<span>Th</span>
								<span>Fr</span>
								<span>Sa</span>
							</div>

							<div class="grid flex-1 grid-cols-7 gap-y-0.5">
								{#each calendarGrid as week, wIdx (wIdx)}
									{#each week as day (`${day.year}-${day.month}-${day.day}-${day.isCurrentMonth}`)}
										{@const isSelected =
											selectedDate &&
											selectedDate.year === day.year &&
											selectedDate.month === day.month &&
											selectedDate.day === day.day}
										<button
											type="button"
											class="flex size-7 items-center justify-center font-mono text-xs transition-colors {isSelected
												? 'rounded-md bg-zinc-200 font-semibold text-zinc-900 shadow-xs'
												: day.isCurrentMonth
													? 'rounded text-neutral-200 hover:bg-neutral-800 hover:text-white'
													: 'rounded text-neutral-600 hover:bg-neutral-800/60'}"
											onclick={() => handleSelectDay(day)}
										>
											{day.day}
										</button>
									{/each}
								{/each}
							</div>

							<!-- View Mode: Months Grid -->
						{:else if viewMode === 'months'}
							<div class="grid flex-1 grid-cols-3 gap-1.5 p-1">
								{#each monthNames as m (m.month)}
									{@const isSelected =
										selectedDate &&
										selectedDate.year === currentYear &&
										selectedDate.month === m.month}
									<button
										type="button"
										class="flex h-12 items-center justify-center rounded font-sans text-xs transition-colors {isSelected
											? 'bg-zinc-200 font-semibold text-zinc-900'
											: currentMonth === m.month
												? 'bg-neutral-800 font-medium text-white'
												: 'text-neutral-300 hover:bg-neutral-800/80 hover:text-white'}"
										onclick={() => handleSelectMonth(m.month)}
									>
										{m.shortName}
									</button>
								{/each}
							</div>

							<!-- View Mode: Years Grid (Decade) -->
						{:else if viewMode === 'years'}
							<div class="grid flex-1 grid-cols-3 gap-1.5 p-1">
								{#each decade.years as y (y)}
									{@const isSelected = selectedDate && selectedDate.year === y}
									{@const isOutsideDecade = y < decade.startYear || y > decade.endYear}
									<button
										type="button"
										class="flex h-12 items-center justify-center rounded font-mono text-xs transition-colors {isSelected
											? 'bg-zinc-200 font-semibold text-zinc-900'
											: isOutsideDecade
												? 'text-neutral-600 hover:bg-neutral-800/50'
												: 'text-neutral-300 hover:bg-neutral-800/80 hover:text-white'}"
										onclick={() => handleSelectYear(y)}
									>
										{y}
									</button>
								{/each}
							</div>
						{/if}
					</div>

					<!-- Panel 3: 3-Column Scrollable Time Selector (Right) -->
					<div class="flex w-[150px] gap-1.5 p-2 font-mono text-xs">
						<!-- Hours Column -->
						<div
							bind:this={hourColRef}
							class="flex flex-1 [scrollbar-width:none] flex-col gap-1 overflow-x-hidden overflow-y-auto py-1 [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
						>
							{#each hours as h (h)}
								{@const isSelected = selectedHour === h}
								<button
									type="button"
									data-time-value={h}
									class="flex h-6 w-full shrink-0 items-center justify-center rounded font-mono text-xs transition-colors {isSelected
										? 'rounded-md bg-zinc-200 font-semibold text-zinc-900 shadow-xs'
										: 'text-neutral-300 hover:bg-neutral-800 hover:text-white'}"
									onclick={() => handleSelectHour(h)}
								>
									{String(h).padStart(2, '0')}
								</button>
							{/each}
						</div>

						<!-- Minutes Column -->
						<div
							bind:this={minuteColRef}
							class="flex flex-1 [scrollbar-width:none] flex-col gap-1 overflow-x-hidden overflow-y-auto py-1 [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
						>
							{#each minutes as m (m)}
								{@const isSelected = selectedMinute === m}
								<button
									type="button"
									data-time-value={m}
									class="flex h-6 w-full shrink-0 items-center justify-center rounded font-mono text-xs transition-colors {isSelected
										? 'rounded-md bg-zinc-200 font-semibold text-zinc-900 shadow-xs'
										: 'text-neutral-300 hover:bg-neutral-800 hover:text-white'}"
									onclick={() => handleSelectMinute(m)}
								>
									{String(m).padStart(2, '0')}
								</button>
							{/each}
						</div>

						<!-- Seconds Column -->
						<div
							bind:this={secondColRef}
							class="flex flex-1 [scrollbar-width:none] flex-col gap-1 overflow-x-hidden overflow-y-auto py-1 [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
						>
							{#each seconds as s (s)}
								{@const isSelected = selectedSecond === s}
								<button
									type="button"
									data-time-value={s}
									class="flex h-6 w-full shrink-0 items-center justify-center rounded font-mono text-xs transition-colors {isSelected
										? 'rounded-md bg-zinc-200 font-semibold text-zinc-900 shadow-xs'
										: 'text-neutral-300 hover:bg-neutral-800 hover:text-white'}"
									onclick={() => handleSelectSecond(s)}
								>
									{String(s).padStart(2, '0')}
								</button>
							{/each}
						</div>
					</div>
				</div>
			</Popover.Content>
		</Popover.Root>
	{/snippet}
</CellContainer>
