import { keymap, type KeyBinding } from '@codemirror/view'
import type { Extension } from '@codemirror/state'

export interface ShortcutHandlers {
  /** Callback to run the query (Mod-Enter). */
  onRun?: () => boolean | void
  /** Callback to explicitly format the query (Shift-Alt-F or Ctrl-Alt-L). */
  onFormat?: () => boolean | void
  /** Additional custom keybindings. */
  extraBindings?: KeyBinding[]
}

/**
 * Create shortcut keybindings for the query editor.
 * Includes DataGrip & VS Code standards:
 *  - `Mod-Enter`: Run query / statement
 *  - `Shift-Alt-F` (VS Code) and `Ctrl-Alt-l` / `Mod-Alt-l` (DataGrip): Format code
 */
export function createShortcutsKeymap(handlers: ShortcutHandlers): Extension {
  const bindings: KeyBinding[] = []

  if (handlers.onRun) {
    bindings.push({
      key: 'Mod-Enter',
      preventDefault: true,
      run: () => {
        handlers.onRun?.()
        return true
      },
    })
  }

  if (handlers.onFormat) {
    bindings.push(
      // VS Code standard
      {
        key: 'Shift-Alt-f',
        preventDefault: true,
        run: () => {
          handlers.onFormat?.()
          return true
        },
      },
      // DataGrip / IntelliJ standard
      {
        key: 'Ctrl-Alt-l',
        preventDefault: true,
        run: () => {
          handlers.onFormat?.()
          return true
        },
      },
      {
        key: 'Mod-Alt-l',
        preventDefault: true,
        run: () => {
          handlers.onFormat?.()
          return true
        },
      },
    )
  }

  if (handlers.extraBindings?.length) {
    bindings.push(...handlers.extraBindings)
  }

  return keymap.of(bindings)
}
