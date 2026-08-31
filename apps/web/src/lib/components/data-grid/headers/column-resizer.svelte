<script lang="ts">
  import { useGridHeaderContext } from '../hooks/use-data-grid.js'

  const header = useGridHeaderContext()
</script>

{#if header.column.getCanResize()}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    role="separator"
    aria-orientation="vertical"
    tabindex="-1"
    class="column-resizer {header.column.getIsResizing() ? 'isResizing' : ''}"
    onmousedown={header.getResizeHandler()}
    ontouchstart={header.getResizeHandler()}
    ondblclick={() => header.column.resetSize()}
    onclick={(e) => e.stopPropagation()}
    title="Drag to resize column (Double-click to reset)"
  >
    <div class="resizer-line"></div>
  </div>
{/if}
