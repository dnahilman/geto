<script lang="ts">
  import { useFieldContext } from '../hooks/form-context.js'
  import CellContainer from './cell-container.svelte'
  import * as Popover from '$lib/components/ui/popover/index.js'
  import CalendarIcon from '@lucide/svelte/icons/calendar'
  import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left'
  import ChevronRightIcon from '@lucide/svelte/icons/chevron-right'
  import { CalendarDate, today, getLocalTimeZone } from '@internationalized/date'
  import {
    parseStandardDateTime,
    getShortcutDateTime,
    getMonthNames,
    getDecadeYears,
    getCalendarGrid,
    type DateShortcut,
  } from '../utils/date-utils.js'

  const field = useFieldContext<string | null>()

  const initial = parseStandardDateTime(field.state.value)
  const defaultDate = initial.date ?? today(getLocalTimeZone())

  let selectedDate = $state<CalendarDate | undefined>(initial.date)
  let currentYear = $state<number>(defaultDate.year)
  let currentMonth = $state<number>(defaultDate.month)
  let viewMode = $state<'days' | 'months' | 'years'>('days')
  let isOpen = $state(true)

  const monthNames = getMonthNames()
  const decade = $derived(getDecadeYears(currentYear))
  const calendarGrid = $derived(getCalendarGrid(currentYear, currentMonth))

  function formatDateOnly(date?: CalendarDate | null): string | null {
    if (!date) return null
    const y = String(date.year).padStart(4, '0')
    const m = String(date.month).padStart(2, '0')
    const d = String(date.day).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  function handleShortcut(shortcut: DateShortcut) {
    if (shortcut === 'null') {
      selectedDate = undefined
      field.handleChange(null)
    } else {
      const res = getShortcutDateTime(shortcut)
      selectedDate = res.date
      if (res.date) {
        currentYear = res.date.year
        currentMonth = res.date.month
        field.handleChange(formatDateOnly(res.date))
      }
    }
    viewMode = 'days'
  }

  function handleSelectDay(day: {
    year: number
    month: number
    day: number
    dateValue: CalendarDate
  }) {
    selectedDate = day.dateValue
    currentYear = day.year
    currentMonth = day.month
    field.handleChange(formatDateOnly(selectedDate))
  }

  function handleSelectMonth(m: number) {
    currentMonth = m
    if (selectedDate) {
      try {
        selectedDate = new CalendarDate(
          currentYear,
          m,
          Math.min(selectedDate.day, new Date(currentYear, m, 0).getDate()),
        )
        field.handleChange(formatDateOnly(selectedDate))
      } catch {
        // fallback
      }
    }
    viewMode = 'days'
  }

  function handleSelectYear(y: number) {
    currentYear = y
    if (selectedDate) {
      try {
        selectedDate = new CalendarDate(
          y,
          currentMonth,
          Math.min(selectedDate.day, new Date(y, currentMonth, 0).getDate()),
        )
        field.handleChange(formatDateOnly(selectedDate))
      } catch {
        // fallback
      }
    }
    viewMode = 'months'
  }

  function handlePrev() {
    if (viewMode === 'days') {
      if (currentMonth === 1) {
        currentMonth = 12
        currentYear -= 1
      } else {
        currentMonth -= 1
      }
    } else if (viewMode === 'months') {
      currentYear -= 1
    } else if (viewMode === 'years') {
      currentYear -= 10
    }
  }

  function handleNext() {
    if (viewMode === 'days') {
      if (currentMonth === 12) {
        currentMonth = 1
        currentYear += 1
      } else {
        currentMonth += 1
      }
    } else if (viewMode === 'months') {
      currentYear += 1
    } else if (viewMode === 'years') {
      currentYear += 10
    }
  }

  $effect(() => {
    const parsed = parseStandardDateTime(field.state.value)
    selectedDate = parsed.date
    if (parsed.date) {
      currentYear = parsed.date.year
      currentMonth = parsed.date.month
    }
  })

  function formatDisplay(val: unknown): string {
    if (val === undefined || val === null || val === '') return ''
    const parsed = parseStandardDateTime(val as string | number | Date)
    if (!parsed.date) return String(val)
    return formatDateOnly(parsed.date) ?? String(val)
  }
</script>

<CellContainer {field} {formatDisplay}>
  {#snippet children({ stopEditing })}
    <Popover.Root
      bind:open={isOpen}
      onOpenChange={(open: boolean) => {
        if (!open) {
          stopEditing()
        }
      }}
    >
      <Popover.Trigger
        class="flex h-full w-full items-center justify-between rounded-none border-0 bg-background px-2.5 py-1 font-mono text-xs shadow-none ring-1 ring-neutral-700 focus-visible:ring-1 focus-visible:ring-neutral-500"
      >
        <span class="truncate font-mono">
          {field.state.value ? formatDisplay(field.state.value) : 'YYYY-MM-DD'}
        </span>
        <CalendarIcon class="ml-1 size-3.5 shrink-0 text-muted-foreground" />
      </Popover.Trigger>

      <Popover.Content
        align="start"
        side="bottom"
        sideOffset={1}
        class="z-50 flex w-auto overflow-hidden rounded-md border border-neutral-800 bg-[#0d1117] p-0 text-neutral-200 shadow-2xl ring-1 ring-neutral-800 outline-hidden select-none"
      >
        <!-- 2-Panel Main Container -->
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

          <!-- Panel 2: Interactive Calendar (Right) -->
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
        </div>
      </Popover.Content>
    </Popover.Root>
  {/snippet}
</CellContainer>
