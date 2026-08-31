import type { Cell_CellSelection } from '@tanstack/svelte-table'

export function getCellClassName(cell: Cell_CellSelection): string {
  if (!cell.getIsSelected()) {
    return cell.getIsFocused() ? 'cell-selectable cell-focused' : 'cell-selectable'
  }

  const edges = cell.getSelectionEdges()

  return [
    'cell-selectable',
    'cell-selected',
    cell.getIsFocused() && 'cell-focused',
    edges.top && 'cell-edge-top',
    edges.right && 'cell-edge-right',
    edges.bottom && 'cell-edge-bottom',
    edges.left && 'cell-edge-left',
  ]
    .filter(Boolean)
    .join(' ')
}
