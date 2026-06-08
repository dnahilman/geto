<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import type * as Monaco from 'monaco-editor'

  let {
    value = $bindable(''),
    uppercase = true,
    onrun,
  }: { value?: string; uppercase?: boolean; onrun?: (sql: string) => void } = $props()

  let container: HTMLDivElement
  let editor: Monaco.editor.IStandaloneCodeEditor | undefined
  const disposables: Monaco.IDisposable[] = []

  export function getSelectedOrAll(): string {
    if (!editor) return value
    const sel = editor.getSelection()
    const model = editor.getModel()
    if (sel && model && !sel.isEmpty()) return model.getValueInRange(sel)
    return editor.getValue()
  }

  export function setValue(v: string) {
    if (editor && editor.getValue() !== v) editor.setValue(v)
  }

  onMount(async () => {
    const { initMonaco, attachKeywordUppercase } = await import('$lib/editor/monaco')
    const monaco = initMonaco()
    editor = monaco.editor.create(container, {
      value,
      language: 'pgsql',
      // Visual Studio Dark, always (independent of the app's light/dark toggle).
      theme: 'vs-dark',
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 13,
      lineNumbersMinChars: 3,
      scrollBeyondLastLine: false,
      tabSize: 2,
      padding: { top: 8 },
      quickSuggestions: true,
      // snippetsPreventQuickSuggestions:false → keep showing schema completions
      // even while inside a snippet (e.g. after inserting a table with an alias).
      suggest: { showStatusBar: true, snippetsPreventQuickSuggestions: false },
    })
    disposables.push(
      editor.onDidChangeModelContent(() => {
        value = editor!.getValue()
      }),
    )
    disposables.push(attachKeywordUppercase(editor, () => uppercase))
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () =>
      onrun?.(getSelectedOrAll()),
    )
  })

  onDestroy(() => {
    disposables.forEach((d) => d.dispose())
    editor?.dispose()
  })
</script>

<div bind:this={container} class="h-full w-full"></div>
