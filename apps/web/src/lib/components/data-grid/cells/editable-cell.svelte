<script lang="ts">
  import { toast } from 'svelte-sonner'
  import { Maximize2 } from 'lucide-svelte'
  import { asJsonObject } from '$lib/json'
  import JsonDetailDialog from './json-detail-dialog.svelte'
  import { Checkbox } from '$lib/components/ui/checkbox'
  import { Textarea } from '$lib/components/ui/textarea'
  import { Input } from '$lib/components/ui/input'
  import { Button } from '$lib/components/ui/button'
  import * as Select from '$lib/components/ui/select'
  import * as Popover from '$lib/components/ui/popover'
  import { Calendar } from '$lib/components/ui/calendar'
  import type { CalendarDate, DateValue } from '@internationalized/date'
  import {
    type CellVariant,
    toBool,
    toCalendarDate,
    toDateTimeParts,
    toEditText,
    serializeDate,
    serializeDateTime,
    NULL_WIRE,
    EMPTY_WIRE,
  } from '../utils/cell-variant'

  interface Props {
    value: unknown
    variant: CellVariant
    options?: string[]
    typeName?: string
    editing: boolean
    onsave: (wire: string) => void
    oncancel: () => void
  }

  let { value, variant, options = [], typeName = '', editing, onsave, oncancel }: Props = $props()

  const withTz = $derived(/tz|with time zone/i.test(typeName))

  // A pending edit may be a NULL / EMPTY sentinel — resolve it for display + seeding
  // so the cell shows "NULL" / "" rather than the raw sentinel string.
  const realValue = $derived(value === NULL_WIRE ? null : value === EMPTY_WIRE ? '' : value)

  // Local editor state, seeded once when edit mode opens.
  let draft = $state('') // text / number / json
  let dtDate = $state<CalendarDate | undefined>(undefined) // datetime
  let dtTime = $state('') // datetime, 'HH:MM'
  let expanded = $state(false) // text: user popped out to the multiline editor
  let prevEditing = false
  $effect.pre(() => {
    if (editing && !prevEditing) {
      expanded = false
      if (variant === 'datetime') {
        const p = toDateTimeParts(realValue)
        dtDate = p.date
        dtTime = p.time
      } else {
        draft = toEditText(realValue, variant)
      }
    }
    prevEditing = editing
  })

  // Long / multi-line text gets the popover textarea instead of a cramped input —
  // either auto (newline or long) or when the user clicks the expand affordance.
  const multiline = $derived(
    variant === 'text' && (expanded || draft.includes('\n') || draft.length > 60),
  )

 function formatCell(v: unknown): { text: string; muted: boolean } {
    if (v === null || v === undefined) return { text: 'NULL', muted: true }
    if (typeof v === 'object') return { text: JSON.stringify(v), muted: false }
    return { text: String(v), muted: false }
  }


  const display = $derived(formatCell(realValue))
  // JSON-ish cells (objects/arrays, or strings that parse to them) stay inline but
  // open a read-only detail modal on click — the table layout never changes.
  const jsonObj = $derived(asJsonObject(realValue))
  let jsonOpen = $state(false)

  // Explicit NULL / empty-string — you can't type these unambiguously.
  const setNull = () => onsave(NULL_WIRE)
  const setEmpty = () => onsave(EMPTY_WIRE)

  function commitText() {
    onsave(draft)
  }
  function commitJson() {
    const v = draft.trim()
    if (v !== '') {
      try {
        JSON.parse(v)
      } catch {
        toast.error('Invalid JSON')
        return
      }
    }
    onsave(draft)
  }
  function commitDateTime() {
    onsave(serializeDateTime(dtDate, dtTime, withTz))
  }
</script>

{#snippet quick(showEmpty: boolean)}
  <button
    type="button"
    class="text-muted-foreground hover:text-foreground hover:bg-accent shrink-0 rounded border px-1.5 text-[10px] leading-5"
    title="Set NULL"
    onmousedown={(e) => e.preventDefault()}
    onclick={setNull}
  >
    NULL
  </button>
  {#if showEmpty}
    <button
      type="button"
      class="text-muted-foreground hover:text-foreground hover:bg-accent shrink-0 rounded border px-1.5 text-[10px] leading-5"
      title="Set empty string ('')"
      onmousedown={(e) => e.preventDefault()}
      onclick={setEmpty}
    >
      ''
    </button>
  {/if}
{/snippet}

{#if !editing}
  {#if jsonObj}
    <span class="group/json flex items-center gap-1">
      <button
        type="button"
        class="hover:text-foreground min-w-0 truncate text-left"
        title="View JSON detail"
        onclick={() => (jsonOpen = true)}
      >
        {display.text}
      </button>
      <button
        type="button"
        class="text-muted-foreground hover:text-foreground shrink-0 opacity-0 group-hover/json:opacity-100"
        title="View JSON detail"
        aria-label="View JSON detail"
        onclick={() => (jsonOpen = true)}
      >
        <Maximize2 class="size-3" />
      </button>
    </span>
    <JsonDetailDialog bind:open={jsonOpen} value={jsonObj} />
  {:else}
    <span class={display.muted ? 'text-muted-foreground italic' : ''}>{display.text}</span>
  {/if}
{:else if variant === 'boolean'}
  <div class="flex items-center gap-1.5">
    <Checkbox checked={toBool(realValue)} onCheckedChange={(c) => onsave(c ? 'true' : 'false')} />
    {@render quick(false)}
  </div>
{:else if variant === 'enum'}
  <div class="flex items-center gap-1">
    <Select.Root
      type="single"
      value={realValue == null ? undefined : String(realValue)}
      open={editing}
      onValueChange={(v) => onsave(v)}
      onOpenChange={(o) => {
        if (!o) oncancel()
      }}
    >
      <Select.Trigger size="sm" class="h-6 w-full font-mono">{display.text}</Select.Trigger>
      <Select.Content>
        {#each options as opt (opt)}
          <Select.Item value={opt}>{opt}</Select.Item>
        {/each}
      </Select.Content>
    </Select.Root>
    {@render quick(false)}
  </div>
{:else if variant === 'date'}
  <Popover.Root
    open={editing}
    onOpenChange={(o) => {
      if (!o) oncancel()
    }}
  >
    <Popover.Trigger class="w-full text-left font-mono">{display.text}</Popover.Trigger>
    <Popover.Content class="w-auto p-2" align="start">
      <Calendar
        type="single"
        value={toCalendarDate(realValue)}
        onValueChange={(v: DateValue | undefined) => {
          if (v) onsave(serializeDate(v as CalendarDate))
        }}
      />
      <div class="mt-2 flex justify-end gap-1">{@render quick(false)}</div>
    </Popover.Content>
  </Popover.Root>
{:else if variant === 'datetime'}
  <Popover.Root
    open={editing}
    onOpenChange={(o) => {
      if (!o) oncancel()
    }}
  >
    <Popover.Trigger class="w-full truncate text-left font-mono">{display.text}</Popover.Trigger>
    <Popover.Content class="w-auto p-2" align="start">
      <Calendar type="single" bind:value={dtDate as DateValue} />
      <div class="mt-2 flex items-center gap-2">
        <Input type="time" bind:value={dtTime} class="h-8 w-32 font-mono" step="60" />
        <span class="text-muted-foreground text-[10px]">{withTz ? 'UTC' : ''}</span>
        <span class="ml-auto flex items-center gap-1">
          {@render quick(false)}
          <Button size="xs" onclick={commitDateTime}>Set</Button>
        </span>
      </div>
    </Popover.Content>
  </Popover.Root>
{:else if variant === 'json'}
  <Popover.Root
    open={editing}
    onOpenChange={(o) => {
      if (!o) oncancel()
    }}
  >
    <Popover.Trigger class="w-full truncate text-left font-mono">{display.text}</Popover.Trigger>
    <Popover.Content class="w-80 p-2" align="start">
      <Textarea
        bind:value={draft}
        class="h-40 font-mono text-xs"
        onkeydown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) commitJson()
          else if (e.key === 'Escape') oncancel()
        }}
      />
      <div class="mt-2 flex items-center gap-1">
        {@render quick(true)}
        <Button size="xs" variant="ghost" class="ml-auto" onclick={oncancel}>Cancel</Button>
        <Button size="xs" onclick={commitJson}>Save</Button>
      </div>
    </Popover.Content>
  </Popover.Root>
{:else if multiline}
  <!-- long / multi-line text: focusable popover textarea ("Multiline editor") -->
  <Popover.Root
    open={editing}
    onOpenChange={(o) => {
      if (!o) oncancel()
    }}
  >
    <Popover.Trigger class="w-full truncate text-left font-mono">{display.text}</Popover.Trigger>
    <Popover.Content class="w-80 p-2" align="start">
      <Textarea
        bind:value={draft}
        class="h-40 font-mono text-xs"
        onkeydown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) commitText()
          else if (e.key === 'Escape') oncancel()
        }}
      />
      <div class="mt-2 flex items-center gap-1">
        {@render quick(true)}
        <Button size="xs" variant="ghost" class="ml-auto" onclick={oncancel}>Cancel</Button>
        <Button size="xs" onclick={commitText}>Save</Button>
      </div>
    </Popover.Content>
  </Popover.Root>
{:else}
  <!-- text / number: inline input. Text gets an expand affordance to pop out. -->
  <!-- svelte-ignore a11y_autofocus -->
  <div class="flex items-center gap-1">
    <input
      class="border-primary bg-background w-full min-w-32 border px-1 font-mono"
      type={variant === 'number' ? 'number' : 'text'}
      bind:value={draft}
      autofocus
      onkeydown={(e) => {
        if (e.key === 'Enter') commitText()
        else if (e.key === 'Escape') oncancel()
      }}
      onblur={commitText}
    />
    {@render quick(true)}
    {#if variant === 'text'}
      <button
        type="button"
        class="text-muted-foreground hover:text-foreground shrink-0"
        title="Expand editor"
        aria-label="Expand editor"
        onmousedown={(e) => e.preventDefault()}
        onclick={() => (expanded = true)}
      >
        <Maximize2 class="size-3" />
      </button>
    {/if}
  </div>
{/if}
