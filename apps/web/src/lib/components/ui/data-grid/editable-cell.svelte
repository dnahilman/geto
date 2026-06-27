<script lang="ts">
  import { toast } from 'svelte-sonner'
  import { Maximize2 } from 'lucide-svelte'
  import { formatCell } from '$lib/components/ui/data-table'
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
  } from './cell-variant'

  let {
    value,
    variant,
    options = [],
    typeName = '',
    editing,
    onsave,
    oncancel,
  }: {
    value: unknown
    variant: CellVariant
    options?: string[]
    typeName?: string
    editing: boolean
    onsave: (wire: string) => void
    oncancel: () => void
  } = $props()

  const withTz = $derived(/tz|with time zone/i.test(typeName))

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
        const p = toDateTimeParts(value)
        dtDate = p.date
        dtTime = p.time
      } else {
        draft = toEditText(value, variant)
      }
    }
    prevEditing = editing
  })

  // Long / multi-line text gets the popover textarea instead of a cramped input —
  // either auto (newline or long) or when the user clicks the expand affordance.
  const multiline = $derived(
    variant === 'text' && (expanded || draft.includes('\n') || draft.length > 60),
  )

  const display = $derived(formatCell(value))
  // JSON-ish cells (objects/arrays, or strings that parse to them) stay inline but
  // open a read-only detail modal on click — the table layout never changes.
  const jsonObj = $derived(asJsonObject(value))
  let jsonOpen = $state(false)

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
  <Checkbox checked={toBool(value)} onCheckedChange={(c) => onsave(c ? 'true' : 'false')} />
{:else if variant === 'enum'}
  <Select.Root
    type="single"
    value={value == null ? undefined : String(value)}
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
{:else if variant === 'date'}
  <Popover.Root
    open={editing}
    onOpenChange={(o) => {
      if (!o) oncancel()
    }}
  >
    <Popover.Trigger class="w-full text-left font-mono">{display.text}</Popover.Trigger>
    <Popover.Content class="w-auto p-0" align="start">
      <Calendar
        type="single"
        value={toCalendarDate(value)}
        onValueChange={(v: DateValue | undefined) => {
          if (v) onsave(serializeDate(v as CalendarDate))
        }}
      />
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
        <Button size="xs" class="ml-auto" onclick={commitDateTime}>Set</Button>
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
      <div class="mt-2 flex justify-end gap-1">
        <Button size="xs" variant="ghost" onclick={oncancel}>Cancel</Button>
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
      <div class="mt-2 flex justify-end gap-1">
        <Button size="xs" variant="ghost" onclick={oncancel}>Cancel</Button>
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
