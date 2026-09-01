<script lang="ts">
  import { Play, Loader, Braces } from 'lucide-svelte'
  import { Button } from '$lib/components/ui/button'
  import SqlEditor from '$lib/editor/sql-editor.svelte'
  import { formatSql } from '$lib/editor/format'
  import type { CompletionEntities } from '$lib/editor/entities'

  interface Props {
    sql: string
    running?: boolean
    completion?: CompletionEntities
    onRun: (text: string) => void
  }

  let { sql = $bindable(), running = false, completion, onRun }: Props = $props()

  let editorRef = $state<ReturnType<typeof SqlEditor>>()

  export function setValue(text: string) {
    editorRef?.setValue(text)
  }

  export function getSelectedOrAll(): string {
    return editorRef?.getSelectedOrAll() ?? sql
  }

  function handleFormat() {
    editorRef?.setValue(formatSql(sql))
  }

  function handleRun() {
    onRun(getSelectedOrAll())
  }
</script>

<div class="flex h-full flex-col">
  <!-- Editor Toolbar (compact, icon-only, matching table-view toolbar height) -->
  <div
    class="flex shrink-0 items-center justify-between border-b bg-background px-2 text-xs gap-2 py-0.5"
  >
    <div class="flex items-center gap-1 ps-1">
      <Button
        size="icon"
        variant="ghost"
        class="size-7 text-emerald-600 hover:text-emerald-500 hover:bg-emerald-500/10"
        title="Run query (⌘/Ctrl + Enter)"
        disabled={running}
        onclick={handleRun}
      >
        {#if running}
          <Loader class="size-3.5 animate-spin" />
        {:else}
          <Play class="size-3.5 fill-current" />
        {/if}
      </Button>
      <Button
        size="icon"
        variant="ghost"
        class="size-7 text-muted-foreground hover:text-foreground"
        title="Format SQL"
        onclick={handleFormat}
      >
        <Braces class="size-3.5" />
      </Button>
    </div>

    <span class="text-muted-foreground text-xs pe-1">⌘/Ctrl + Enter</span>
  </div>

  <!-- CodeMirror Editor -->
  <div class="min-h-0 flex-1">
    <SqlEditor
      bind:this={editorRef}
      bind:value={sql}
      uppercase={true}
      {completion}
      onrun={onRun}
      onrunstatement={onRun}
    />
  </div>
</div>
