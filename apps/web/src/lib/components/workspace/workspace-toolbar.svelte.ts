import type { Snippet } from 'svelte'

export class WorkspaceToolbarState {
  activeToolbar = $state<Snippet | null>(null)
}
