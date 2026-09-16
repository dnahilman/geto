<script lang="ts">
  import { Trash2 } from 'lucide-svelte'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import {
    SQL_FILTER_OPERATORS,
    operatorRequiresValue,
    type TableFilterGroup,
    type SqlFilterOperator,
  } from '../types/filter.js'

  interface ColumnItem {
    name: string
    typeName?: string
    isPrimaryKey?: boolean
  }

  interface Props {
    columns: ColumnItem[]
    filterGroup: TableFilterGroup
    onApply?: () => void
    onReset?: () => void
  }

  let {
    columns = [],
    filterGroup = $bindable({ conjunction: 'AND', rules: [] }),
    onApply,
    onReset,
  }: Props = $props()

  function removeRule(id: string) {
    filterGroup = {
      ...filterGroup,
      rules: filterGroup.rules.filter((r) => r.id !== id),
    }
    if (filterGroup.rules.length === 0) {
      onReset?.()
    }
  }
</script>

<div
  class="flex flex-col gap-1 border-t bg-muted/20 px-2 py-0.5 text-xs select-none transition-all animate-in fade-in-50 duration-150"
>
  <!-- List of Filter Conditions (only the filter rows) -->
  <div class="flex flex-col gap-1">
    {#each filterGroup.rules as rule, i (rule.id)}
      <div class="flex items-center gap-1.5 ps-1 flex-wrap">
        <!-- Conjunction / WHERE prefix -->
        <div class="w-14 shrink-0 flex items-center justify-start">
          {#if i === 0}
            <span
              class="rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-muted-foreground bg-muted uppercase"
            >
              WHERE
            </span>
          {:else}
            <select
              bind:value={filterGroup.conjunction}
              class="h-6 rounded border border-input bg-background px-1 text-[11px] font-medium text-primary shadow-2xs focus:outline-hidden"
            >
              <option value="AND">AND</option>
              <option value="OR">OR</option>
            </select>
          {/if}
        </div>

        <!-- Column Selector -->
        <select
          bind:value={rule.column}
          class="h-7 min-w-[120px] max-w-[180px] rounded-md border border-input bg-background px-2 text-xs font-mono text-foreground shadow-2xs focus:outline-hidden focus:ring-1 focus:ring-ring"
        >
          {#each columns as col (col.name)}
            <option value={col.name}>
              {col.name}{col.isPrimaryKey ? ' (PK)' : ''}
            </option>
          {/each}
        </select>

        <!-- Operator Selector -->
        <select
          bind:value={rule.operator}
          class="h-7 min-w-[130px] rounded-md border border-input bg-background px-2 text-xs text-foreground shadow-2xs focus:outline-hidden focus:ring-1 focus:ring-ring"
        >
          {#each SQL_FILTER_OPERATORS as op (op.value)}
            <option value={op.value}>
              {op.sql}
              {op.label}
            </option>
          {/each}
        </select>

        <!-- Value Input -->
        {#if operatorRequiresValue(rule.operator as SqlFilterOperator)}
          <div class="flex-1 min-w-[140px] max-w-[260px]">
            <Input
              type="text"
              class="h-7 text-xs font-mono"
              placeholder="Value..."
              bind:value={rule.value}
              onkeydown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  onApply?.()
                }
              }}
            />
          </div>
        {:else}
          <div class="flex-1 min-w-[100px] text-muted-foreground text-[11px] italic px-1">
            (no value needed)
          </div>
        {/if}

        <!-- Delete Condition Button -->
        <Button
          type="button"
          variant="ghost"
          size="icon"
          class="size-7 text-muted-foreground hover:text-destructive"
          title="Remove condition"
          onclick={() => removeRule(rule.id)}
        >
          <Trash2 class="size-3.5" />
        </Button>
      </div>
    {/each}
  </div>

  <!-- Empty actions container as requested -->
  <div></div>
</div>
