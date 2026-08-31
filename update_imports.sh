sed -i 's/createAppGridColumnHelper,//' apps/web/src/lib/components/workspace/data-grid.svelte
sed -i 's/createAppGridTable,//' apps/web/src/lib/components/workspace/data-grid.svelte
sed -i 's/PageSizeSelect,//' apps/web/src/lib/components/workspace/data-grid.svelte
sed -i '/import {/a \  createAppGridColumnHelper,\n  createAppGridTable,\n} from '\''$lib/components/data-grid/hooks/use-data-grid'\''' apps/web/src/lib/components/workspace/data-grid.svelte
sed -i '/import {/a \  PageSizeSelect,\n  PaginationControls,\n} from '\''$lib/components/data-grid/pagination'\''' apps/web/src/lib/components/workspace/data-grid.svelte
