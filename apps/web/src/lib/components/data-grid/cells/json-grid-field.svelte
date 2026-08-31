<script lang="ts">
  import { useFieldContext } from '../hooks/form-context.js'
  import CellContainer from './cell-container.svelte'
  import * as Popover from '$lib/components/ui/popover/index.js'
  import { Button } from '$lib/components/ui/button/index.js'
  import JsonDetailDialog from '$lib/components/ui/data-grid/json-detail-dialog.svelte'
  import Maximize2 from '@lucide/svelte/icons/maximize-2'
  import { toast } from 'svelte-sonner'
  import { asJsonObject } from '$lib/json.js'

  const field = useFieldContext<unknown>()

  let isDetailOpen = $state(false)
  let isOpen = $state(true)
  let textareaRef = $state<HTMLTextAreaElement | null>(null)

  function formatDraft(val: unknown): string {
    if (val === null || val === undefined) return ''
    if (typeof val === 'object') {
      return JSON.stringify(val, null, 2)
    }
    if (typeof val === 'string') {
      const trimmed = val.trim()
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          const parsed = JSON.parse(trimmed)
          if (typeof parsed === 'object' && parsed !== null) {
            return JSON.stringify(parsed, null, 2)
          }
        } catch {
          // not JSON
        }
      }
      return val
    }
    return String(val)
  }

  let draft = $state<string>(formatDraft(field.state.value))

  $effect(() => {
    if (isOpen) {
      draft = formatDraft(field.state.value)
      setTimeout(() => {
        if (textareaRef) {
          textareaRef.focus()
          textareaRef.setSelectionRange(0, 0)
        }
      }, 30)
    }
  })

  const rawValue = $derived(field.state.value)
  const parsedJsonValue = $derived.by(() => {
    const obj = asJsonObject(rawValue)
    if (obj !== null) return obj
    return rawValue
  })

  function handleSave(stopEditing: () => void) {
    const trimmed = draft.trim()
    if (trimmed === '') {
      field.handleChange('')
      stopEditing()
      return
    }
    try {
      const parsed = JSON.parse(trimmed)
      field.handleChange(parsed)
      stopEditing()
    } catch {
      toast.error('Invalid JSON')
    }
  }

  function handleSetNull(stopEditing: () => void) {
    field.handleChange(null)
    stopEditing()
  }

  function handleSetEmpty(stopEditing: () => void) {
    field.handleChange('')
    stopEditing()
  }

  function handleCancel(stopEditing: () => void) {
    stopEditing()
  }
</script>

<CellContainer {field}>
  {#snippet hoverAction()}
    <button
      type="button"
      class="flex size-5 items-center justify-center rounded border border-neutral-700/60 bg-neutral-800/80 text-neutral-300 shadow-xs transition-colors hover:border-neutral-600 hover:bg-neutral-700 hover:text-white"
      title="View JSON detail"
      aria-label="View JSON detail"
      onclick={(e) => {
        e.stopPropagation()
        isDetailOpen = true
      }}
    >
      <Maximize2 class="size-3" />
    </button>
  {/snippet}

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
          {draft || '{ ... }'}
        </span>
      </Popover.Trigger>

      <Popover.Content
        align="start"
        side="bottom"
        sideOffset={4}
        class="z-50 w-[420px] max-w-xl gap-0 overflow-hidden rounded-lg border border-neutral-800 bg-[#0d1117] p-0 text-neutral-200 shadow-2xl ring-1 ring-neutral-800 outline-hidden select-none"
      >
        <!-- Textarea editor -->
        <div class="h-64 p-3">
          <textarea
            bind:this={textareaRef}
            bind:value={draft}
            placeholder="&#123; ... &#125;"
            class="h-full w-full resize-none overflow-y-auto bg-transparent font-mono text-xs leading-5 text-neutral-100 placeholder:text-neutral-600 focus:outline-hidden"
            onkeydown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault()
                e.stopPropagation()
                handleSave(stopEditing)
              } else if (e.key === 'Escape') {
                e.preventDefault()
                e.stopPropagation()
                handleCancel(stopEditing)
              }
            }}
          ></textarea>
        </div>

        <!-- Dashed Divider -->
        <div class="border-b border-dashed border-neutral-800"></div>

        <!-- Bottom Action Bar -->
        <div class="flex items-center justify-between bg-neutral-900/30 p-2.5">
          <div class="flex items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              class="h-7 font-mono text-xs text-neutral-400 hover:bg-neutral-800 hover:text-white"
              onclick={() => handleSetNull(stopEditing)}
            >
              Set NULL
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              class="h-7 font-mono text-xs text-neutral-400 hover:bg-neutral-800 hover:text-white"
              onclick={() => handleSetEmpty(stopEditing)}
            >
              Set ''
            </Button>
          </div>

          <div class="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              class="h-7 border-neutral-700 bg-neutral-800 text-xs text-neutral-300 hover:bg-neutral-700 hover:text-white"
              onclick={() => handleCancel(stopEditing)}
            >
              <span>Cancel</span>
              <kbd
                class="rounded border border-neutral-700 bg-neutral-900 px-1 py-0.5 text-[10px] text-neutral-400"
              >
                Esc
              </kbd>
            </Button>

            <Button
              type="button"
              size="sm"
              class="h-7 bg-neutral-100 text-xs font-medium text-neutral-900 hover:bg-neutral-200"
              onclick={() => handleSave(stopEditing)}
            >
              <span>Save</span>
              <kbd class="rounded bg-neutral-300/80 px-1 py-0.5 text-[10px] text-neutral-900">
                Ctrl+Enter
              </kbd>
            </Button>
          </div>
        </div>
      </Popover.Content>
    </Popover.Root>
  {/snippet}

  {#snippet actions()}
    <JsonDetailDialog bind:open={isDetailOpen} value={parsedJsonValue} />
  {/snippet}
</CellContainer>
