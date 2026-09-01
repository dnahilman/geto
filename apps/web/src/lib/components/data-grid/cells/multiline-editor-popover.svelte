<script lang="ts">
  import * as Popover from '$lib/components/ui/popover/index.js'
  import * as Kbd from '$lib/components/ui/kbd/index.js'
  import { Button } from '$lib/components/ui/button/index.js'
  import AlignLeftIcon from '@lucide/svelte/icons/align-left'

  let {
    open = $bindable(false),
    value = '',
    onSave,
    onClose,
    onCancel,
  }: {
    open?: boolean
    value?: string | null
    onSave?: (newValue: string | null) => void
    onClose?: () => void
    onCancel?: () => void
  } = $props()

  let currentText = $state<string>('')
  let textareaRef = $state<HTMLTextAreaElement | null>(null)
  let gutterRef = $state<HTMLDivElement | null>(null)

  $effect(() => {
    if (open) {
      currentText = value ?? ''
      setTimeout(() => {
        if (textareaRef) {
          textareaRef.focus()
          textareaRef.setSelectionRange(textareaRef.value.length, textareaRef.value.length)
        }
      }, 30)
    }
  })

  const lineCount = $derived(Math.max(1, currentText.split('\n').length))
  const lineNumbers = $derived(Array.from({ length: lineCount }, (_, i) => i + 1))

  function handleScroll() {
    if (textareaRef && gutterRef) {
      gutterRef.scrollTop = textareaRef.scrollTop
    }
  }

  function handleSave() {
    onSave?.(currentText)
    open = false
  }

  function handleCancel() {
    onClose?.()
    onCancel?.()
    open = false
  }

  function handleSetNull() {
    onSave?.(null)
    open = false
  }

  function handleKeyDown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      handleSave()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      handleCancel()
    }
  }
</script>

<Popover.Root
  bind:open
  onOpenChange={(isOpen: boolean) => {
    if (!isOpen) {
      handleCancel()
    }
  }}
>
  <div class="group/tooltip relative flex items-center">
    <Popover.Trigger
      class="flex size-6 items-center justify-center rounded border border-neutral-700/60 bg-neutral-800/80 text-neutral-300 shadow-xs transition-colors hover:border-neutral-600 hover:bg-neutral-700 hover:text-white"
      aria-label="Open multiline editor"
    >
      <AlignLeftIcon class="size-3.5" />
    </Popover.Trigger>

    <!-- Tooltip -->
    <div
      class="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 hidden -translate-x-1/2 items-center gap-1.5 rounded-md border border-neutral-800 bg-[#0d1117] px-2 py-1 text-[11px] font-medium whitespace-nowrap text-neutral-200 shadow-xl select-none group-hover/tooltip:flex"
    >
      <span>Multiline editor</span>
      <div class="flex items-center gap-1 text-neutral-400">
        <span class="rounded bg-neutral-800 px-1 py-0.5 font-mono text-[10px]">⇧</span>
        <span class="rounded bg-neutral-800 px-1 py-0.5 font-mono text-[10px]">↵</span>
      </div>
    </div>
  </div>

  <Popover.Content
    align="end"
    side="bottom"
    sideOffset={4}
    class="z-50 w-[420px] max-w-xl gap-0 overflow-hidden rounded-lg border border-neutral-800 bg-[#0d1117] p-0 text-neutral-200 shadow-2xl ring-1 ring-neutral-800 outline-hidden select-none"
  >
    <!-- Editor Area -->
    <div class="flex h-64 overflow-hidden">
      <!-- Line Numbers Gutter -->
      <div
        bind:this={gutterRef}
        class="w-10 shrink-0 overflow-hidden border-r border-neutral-800/80 bg-neutral-900/60 p-3 text-right font-mono text-xs leading-5 text-neutral-500 select-none"
      >
        {#each lineNumbers as line (line)}
          <div>{line}</div>
        {/each}
      </div>

      <!-- Textarea -->
      <textarea
        bind:this={textareaRef}
        bind:value={currentText}
        onscroll={handleScroll}
        onkeydown={handleKeyDown}
        placeholder="Enter text..."
        class="h-full flex-1 resize-none overflow-y-auto bg-transparent p-3 font-mono text-xs leading-5 text-neutral-100 placeholder:text-neutral-600 focus:outline-hidden"
      ></textarea>
    </div>

    <!-- Dashed Divider -->
    <div class="border-b border-dashed border-neutral-800"></div>

    <!-- Bottom Action Bar -->
    <div class="flex items-center justify-between bg-neutral-900/30 p-2.5">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        class="h-7 font-mono text-xs text-neutral-400 hover:bg-neutral-800 hover:text-white"
        onmousedown={(e) => e.preventDefault()}
        onclick={handleSetNull}
      >
        Set NULL
      </Button>

      <div class="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          class="pe-2 text-xs"
          onclick={handleCancel}
        >
          Cancel <Kbd.Root>Esc</Kbd.Root>
        </Button>

        <Button type="button" size="sm" class="pe-2 text-xs font-medium" onclick={handleSave}>
          Save <Kbd.Root>Ctrl+Enter</Kbd.Root>
        </Button>
      </div>
    </div>
  </Popover.Content>
</Popover.Root>
