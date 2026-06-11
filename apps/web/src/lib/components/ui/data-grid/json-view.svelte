<script lang="ts">
  // MongoDB-Atlas-style document view: each row rendered as an indented JSON
  // object with syntax highlighting. When `relations` + `relationMap` are given,
  // relation-bearing fields get an expand action that opens the related rows
  // inline (reusing RelationPanel, so nested relations keep the Table/JSON toggle).
  import { ArrowUpRight, Rows3 } from 'lucide-svelte'
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu'
  import RelationPanel from './relation-panel.svelte'
  import type { ExpandedRelation, RelationsConfig } from './data-grid-context'
  import type { RelationDescriptor, RelationTarget } from '$lib/relations'

  let {
    columns,
    rows,
    offset = 0,
    relations = undefined,
    relationMap = undefined,
  }: {
    columns: { name: string }[]
    rows: unknown[][]
    offset?: number
    relations?: RelationsConfig
    relationMap?: (RelationDescriptor | null)[]
  } = $props()

  // One open relation per document (keyed by row index within this page).
  let expanded = $state<Record<number, { col: number; exp: ExpandedRelation } | null>>({})

  // Reset open panels when the underlying rows change (page / sort / refresh),
  // mirroring the table grid's clearExpanded — keeps indices from going stale.
  $effect(() => {
    rows
    expanded = {}
  })

  function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }

  // Wrap JSON tokens in Tailwind-colored spans. Input must be HTML-escaped first
  // so values can never inject markup (only our own <span> tags are added).
  function highlight(json: string): string {
    return json.replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
      (m) => {
        let cls = 'text-amber-600 dark:text-amber-400' // number
        if (/^"/.test(m)) {
          cls = /:$/.test(m.trimEnd())
            ? 'text-sky-700 dark:text-sky-300' // key
            : 'text-emerald-700 dark:text-emerald-400' // string
        } else if (/true|false/.test(m)) {
          cls = 'text-purple-600 dark:text-purple-400' // boolean
        } else if (/null/.test(m)) {
          cls = 'text-muted-foreground' // null
        }
        return `<span class="${cls}">${m}</span>`
      },
    )
  }

  function valueHtml(v: unknown): string {
    return highlight(escapeHtml(JSON.stringify(v ?? null)))
  }

  function relFor(ci: number): RelationDescriptor | null {
    return relations ? (relationMap?.[ci] ?? null) : null
  }

  function toggle(ri: number, ci: number, target: RelationTarget, value: unknown) {
    expanded[ri] = expanded[ri]?.col === ci ? null : { col: ci, exp: { target, value } }
  }
  function open(ri: number, ci: number, target: RelationTarget, value: unknown) {
    expanded[ri] = { col: ci, exp: { target, value } }
  }

  const btnClass =
    'bg-background/80 text-muted-foreground hover:text-foreground hover:bg-accent flex size-5 items-center justify-center rounded border'
</script>

<div class="divide-border divide-y font-mono text-xs">
  {#each rows as row, i (i)}
    <div class="hover:bg-accent/20 flex gap-3 px-3 py-2">
      <span
        class="text-muted-foreground/60 shrink-0 pt-px text-right text-[10px] tabular-nums select-none"
      >
        {offset + i + 1}
      </span>
      <div class="min-w-0 flex-1 leading-relaxed">
        <div class="text-muted-foreground">{'{'}</div>
        {#each columns as col, ci (col.name)}
          {@const rel = relFor(ci)}
          {@const v = row[ci]}
          <div class="group/field flex items-start gap-1 pl-4">
            <span class="min-w-0 flex-1 wrap-break-word">
              <span class="text-sky-700 dark:text-sky-300">"{col.name}"</span><span
                class="text-muted-foreground"
                >:
              </span>{@html valueHtml(v)}{#if ci < columns.length - 1}<span
                  class="text-muted-foreground">,</span
                >{/if}
            </span>
            {#if rel && v != null}
              <span class="shrink-0 opacity-0 transition-opacity group-hover/field:opacity-100">
                {#if rel.dir === 'forward'}
                  <button
                    type="button"
                    class={btnClass}
                    title={`View ${rel.target.table}`}
                    aria-label={`View related ${rel.target.table}`}
                    onclick={() => toggle(i, ci, rel.target, v)}
                  >
                    <ArrowUpRight class="size-3" />
                  </button>
                {:else if rel.targets.length === 1}
                  <button
                    type="button"
                    class={btnClass}
                    title={`View ${rel.targets[0].table}`}
                    aria-label={`View related ${rel.targets[0].table}`}
                    onclick={() => toggle(i, ci, rel.targets[0], v)}
                  >
                    <Rows3 class="size-3" />
                  </button>
                {:else}
                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger>
                      {#snippet child({ props })}
                        <button {...props} type="button" class={btnClass} title="View related rows">
                          <Rows3 class="size-3" />
                        </button>
                      {/snippet}
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Content align="end" class="w-auto">
                      {#each rel.targets as t (`${t.schema}.${t.table}.${t.column}`)}
                        <DropdownMenu.Item onSelect={() => open(i, ci, t, v)}>
                          {t.table}.{t.column}{t.virtual ? ' (inferred)' : ''}
                        </DropdownMenu.Item>
                      {/each}
                    </DropdownMenu.Content>
                  </DropdownMenu.Root>
                {/if}
              </span>
            {/if}
          </div>
          {#if expanded[i]?.col === ci && relations}
            <div class="py-1 pl-4">
              <RelationPanel
                connId={relations.connId}
                expansion={expanded[i]!.exp}
                initialView="json"
                onOpenInTab={() =>
                  relations!.openInTab(expanded[i]!.exp.target, expanded[i]!.exp.value)}
                onCollapse={() => (expanded[i] = null)}
              />
            </div>
          {/if}
        {/each}
        <div class="text-muted-foreground">{'}'}</div>
      </div>
    </div>
  {/each}
</div>
