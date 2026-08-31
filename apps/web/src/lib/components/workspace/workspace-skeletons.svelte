<script lang="ts">
  import Skeleton from '$lib/components/ui/skeleton/skeleton.svelte'

  let {
    type,
    cols = 6,
    rows = 10,
    count = 8,
  }: {
    type: 'table' | 'tree' | 'console' | 'dialog-list' | 'structure'
    cols?: number
    rows?: number
    count?: number
  } = $props()
</script>

{#snippet tableSkeleton()}
  <div class="flex flex-col gap-2 p-3 w-full">
    <div class="flex items-center gap-3 border-b pb-2">
      {#each Array(cols) as _, i (i)}
        <Skeleton class="h-4 flex-1 rounded-xs" />
      {/each}
    </div>
    <div class="flex flex-col gap-2 pt-1">
      {#each Array(rows) as _, r (r)}
        <div class="flex items-center gap-3">
          {#each Array(cols) as _, c (c)}
            <Skeleton class="h-3.5 flex-1 rounded-xs opacity-70" />
          {/each}
        </div>
      {/each}
    </div>
  </div>
{/snippet}

{#snippet structureSkeleton()}
  <div class="space-y-6 p-4 w-full">
    <section class="space-y-3">
      <Skeleton class="h-4 w-24 rounded-xs" />
      <div class="space-y-2 border-t pt-2">
        {#each Array(5) as _, i (i)}
          <div class="flex items-center gap-4">
            <Skeleton class="h-4 w-28 rounded-xs" />
            <Skeleton class="h-4 w-20 rounded-xs" />
            <Skeleton class="h-4 w-16 rounded-xs" />
            <Skeleton class="h-4 w-24 rounded-xs" />
          </div>
        {/each}
      </div>
    </section>
    <section class="space-y-3">
      <Skeleton class="h-4 w-20 rounded-xs" />
      <div class="space-y-2 border-t pt-2">
        {#each Array(2) as _, i (i)}
          <Skeleton class="h-4 w-64 rounded-xs" />
        {/each}
      </div>
    </section>
  </div>
{/snippet}

{#snippet treeSkeleton()}
  <div class="space-y-2.5 p-2 w-full">
    {#each Array(count) as _, i (i)}
      <div class="flex items-center gap-1.5" style="padding-left: {(i % 3) * 12}px">
        <Skeleton class="size-3.5 shrink-0 rounded-xs" />
        <Skeleton class="size-3.5 shrink-0 rounded-xs" />
        <Skeleton class="h-3.5 {i % 2 === 0 ? 'w-24' : i % 3 === 0 ? 'w-32' : 'w-20'} rounded-xs" />
      </div>
    {/each}
  </div>
{/snippet}

{#snippet consoleSkeleton()}
  <div class="flex h-full w-full flex-col gap-3 p-3">
    <div class="flex items-center gap-3 border-b pb-2">
      {#each Array(5) as _, i (i)}
        <Skeleton class="h-4 flex-1 rounded-xs" />
      {/each}
    </div>
    <div class="flex flex-col gap-2 pt-1">
      {#each Array(6) as _, r (r)}
        <div class="flex items-center gap-3">
          {#each Array(5) as _, c (c)}
            <Skeleton class="h-3.5 flex-1 rounded-xs opacity-70" />
          {/each}
        </div>
      {/each}
    </div>
  </div>
{/snippet}

{#snippet dialogListSkeleton()}
  <div class="space-y-2 p-1 w-full">
    {#each Array(count) as _, i (i)}
      <div class="flex items-center justify-between border rounded-md p-2.5">
        <div class="flex items-center gap-2.5">
          <Skeleton class="size-4 rounded-xs" />
          <div class="space-y-1.5">
            <Skeleton class="h-3.5 w-28 rounded-xs" />
            <Skeleton class="h-3 w-20 rounded-xs" />
          </div>
        </div>
        <Skeleton class="h-6 w-14 rounded-xs" />
      </div>
    {/each}
  </div>
{/snippet}

{#if type === 'table'}
  {@render tableSkeleton()}
{:else if type === 'structure'}
  {@render structureSkeleton()}
{:else if type === 'tree'}
  {@render treeSkeleton()}
{:else if type === 'console'}
  {@render consoleSkeleton()}
{:else if type === 'dialog-list'}
  {@render dialogListSkeleton()}
{/if}
