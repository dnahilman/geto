import { EditorView } from '@codemirror/view'
import { HighlightStyle } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'
import type { Extension } from '@codemirror/state'

const FONT =
  "'JetBrains Mono', 'Cascadia Code', 'Fira Code', Menlo, Monaco, Consolas, 'Courier New', monospace"

// Lucide Icon vector data URIs for lint gutter markers
const LUCIDE_ERROR_SVG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23ef4444' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3Cpath d='m15 9-6 6'/%3E%3Cpath d='m9 9 6 6'/%3E%3C/svg%3E")`

const LUCIDE_WARNING_SVG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23f59e0b' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z'/%3E%3Cpath d='M12 9v4'/%3E%3Cpath d='M12 17h.01'/%3E%3C/svg%3E")`

const LUCIDE_INFO_SVG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2338bdf8' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3Cpath d='M12 16v-4'/%3E%3Cpath d='M12 8h.01'/%3E%3C/svg%3E")`

const LUCIDE_HINT_SVG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23c084fc' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5'/%3E%3Cpath d='M9 18h6'/%3E%3Cpath d='M10 22h4'/%3E%3C/svg%3E")`

export const vscodeDarkTheme = EditorView.theme(
  {
    '&': {
      color: 'var(--color-foreground, #f8fafc)',
      backgroundColor: 'transparent',
      fontSize: '13px',
      height: '100%',
    },
    '.cm-scroller': {
      fontFamily: FONT,
      lineHeight: '1.6',
    },
    '.cm-content': {
      caretColor: '#38bdf8',
      padding: '0',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: '#38bdf8',
      borderLeftWidth: '2px',
    },
    '&.cm-focused .cm-cursor': {
      borderLeftColor: '#38bdf8',
      borderLeftWidth: '2px',
    },
    '.cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: 'rgba(56, 189, 248, 0.22)',
    },
    '&.cm-focused .cm-selectionBackground, &.cm-focused .cm-content ::selection': {
      backgroundColor: 'rgba(56, 189, 248, 0.25)',
    },
    '.cm-activeLine': {
      backgroundColor: 'rgba(255, 255, 255, 0.035)',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'rgba(255, 255, 255, 0.035)',
      color: '#f8fafc',
      fontWeight: '600',
    },
    '.cm-gutters': {
      backgroundColor: 'rgba(0, 0, 0, 0.18)',
      color: '#64748b',
      borderRight: '1px solid var(--color-border, rgba(255, 255, 255, 0.08))',
      borderTop: 'none',
      borderBottom: 'none',
      borderLeft: 'none',
    },
    '.cm-gutterElement': {
      display: 'flex',
      alignItems: 'center',
      boxSizing: 'border-box',
    },
    '.cm-lineNumbers': {
      borderRight: 'none',
    },
    '.cm-lineNumbers .cm-gutterElement': {
      padding: '0 4px 0 6px',
      minWidth: '28px',
      justifyContent: 'flex-end',
      fontVariantNumeric: 'tabular-nums',
    },
    '.cm-placeholder': {
      color: '#64748b',
      fontStyle: 'italic',
      paddingLeft: '4px',
    },
    '.cm-foldPlaceholder': {
      backgroundColor: 'transparent',
      border: 'none',
      color: '#858585',
    },
    // Run-statement gutter — glowing interactive micro-button
    '.cm-run-gutter': {
      width: '24px',
      flexShrink: '0',
      borderRight: 'none',
    },
    '.cm-run-gutter .cm-gutterElement': {
      padding: '0',
      justifyContent: 'center',
      alignItems: 'center',
    },
    '.cm-run-marker': {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '16px',
      height: '16px',
      margin: '0',
      padding: '0',
      borderRadius: '3px',
      background: 'rgba(16, 185, 129, 0.12)',
      border: '1px solid rgba(16, 185, 129, 0.25)',
      cursor: 'pointer',
      color: '#34d399',
      opacity: '0.65',
      transition: 'all 0.15s ease-in-out',
    },
    '.cm-run-gutter:hover .cm-run-marker': {
      opacity: '0.85',
    },
    '.cm-run-marker:hover': {
      opacity: '1',
      background: '#10b981',
      borderColor: '#059669',
      color: '#ffffff',
      boxShadow: '0 2px 8px rgba(16, 185, 129, 0.4)',
    },
    // Lint gutter — elegant Lucide icon indicators
    '.cm-gutter-lint': {
      width: '20px',
      flexShrink: '0',
    },
    '.cm-gutter-lint .cm-gutterElement': {
      padding: '0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    },
    '.cm-lint-marker': {
      width: '14px',
      height: '14px',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      opacity: '0.85',
      transition: 'opacity 0.15s ease-in-out',
      '&:hover': {
        opacity: '1',
      },
    },
    '.cm-lint-marker-error': {
      content: LUCIDE_ERROR_SVG,
    },
    '.cm-lint-marker-warning': {
      content: LUCIDE_WARNING_SVG,
    },
    '.cm-lint-marker-info': {
      content: LUCIDE_INFO_SVG,
    },
    '.cm-lint-marker-hint': {
      content: LUCIDE_HINT_SVG,
    },
    '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
      backgroundColor: 'rgba(56, 189, 248, 0.18)',
      outline: '1px solid rgba(56, 189, 248, 0.45)',
      borderRadius: '2px',
    },
    '.cm-selectionMatch': {
      backgroundColor: 'rgba(255, 255, 255, 0.1)',
      borderRadius: '2px',
    },
    // Autocomplete popup — modern command palette style with colored badges
    '.cm-tooltip': {
      backgroundColor: 'var(--color-popover, #18181b)',
      border: '1px solid var(--color-border, rgba(255, 255, 255, 0.12))',
      color: 'var(--color-popover-foreground, #f4f4f5)',
      borderRadius: '8px',
      boxShadow: '0 10px 30px -5px rgba(0, 0, 0, 0.5), 0 4px 12px rgba(0, 0, 0, 0.3)',
      overflow: 'hidden',
    },
    '.cm-tooltip.cm-tooltip-autocomplete > ul': {
      fontFamily: FONT,
      maxHeight: '18em',
      padding: '4px',
    },
    '.cm-tooltip-autocomplete > ul > li': {
      padding: '4px 8px',
      borderRadius: '6px',
      margin: '1px 0',
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      fontSize: '12px',
      cursor: 'pointer',
      lineHeight: '1.4',
    },
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
      backgroundColor: 'var(--color-accent, rgba(255, 255, 255, 0.12))',
      color: 'var(--color-foreground, #ffffff)',
    },
    '.cm-completionIcon': {
      width: '18px',
      height: '18px',
      borderRadius: '3px',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '10px',
      fontWeight: 'bold',
      fontFamily: FONT,
      marginRight: '6px',
      flexShrink: '0',
    },
    '.cm-completionIcon-keyword': {
      backgroundColor: 'rgba(192, 132, 252, 0.2)',
      color: '#c084fc',
      '&::after': { content: '"K"' },
    },
    '.cm-completionIcon-type': {
      backgroundColor: 'rgba(56, 189, 248, 0.2)',
      color: '#38bdf8',
      '&::after': { content: '"T"' },
    },
    '.cm-completionIcon-property': {
      backgroundColor: 'rgba(74, 222, 128, 0.2)',
      color: '#4ade80',
      '&::after': { content: '"C"' },
    },
    '.cm-completionIcon-function': {
      backgroundColor: 'rgba(250, 204, 21, 0.2)',
      color: '#facc15',
      '&::after': { content: '"F"' },
    },
    '.cm-completionLabel': {
      color: 'inherit',
      fontWeight: '500',
    },
    '.cm-completionDetail': {
      color: '#94a3b8',
      fontStyle: 'normal',
      marginLeft: 'auto',
      fontSize: '11px',
      opacity: '0.85',
    },
    '.cm-completionMatchedText': {
      textDecoration: 'none',
      color: '#38bdf8',
      fontWeight: '700',
    },
    // Diagnostics / Linting styling
    '.cm-diagnostic': {
      padding: '6px 10px',
      fontFamily: FONT,
      fontSize: '12px',
      borderRadius: '4px',
    },
    '.cm-diagnostic-error': {
      borderLeft: '3px solid #ef4444',
      backgroundColor: 'rgba(239, 68, 68, 0.08)',
    },
    '.cm-diagnostic-warning': {
      borderLeft: '3px solid #f59e0b',
      backgroundColor: 'rgba(245, 158, 11, 0.08)',
    },
    '.cm-diagnostic-info': {
      borderLeft: '3px solid #38bdf8',
      backgroundColor: 'rgba(56, 189, 248, 0.08)',
    },
    '.cm-diagnostic-hint': {
      borderLeft: '3px solid #c084fc',
      backgroundColor: 'rgba(192, 132, 252, 0.08)',
    },
    // Wavy underline decorations
    '.cm-lintRange-error': {
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='6' height='3'%3E%3Cpath d='M0 2.5 Q 1.5 0.5 3 2.5 T 6 2.5' fill='none' stroke='%23ef4444' stroke-width='1.2'/%3E%3C/svg%3E")`,
      backgroundPosition: 'left bottom',
      backgroundRepeat: 'repeat-x',
      paddingBottom: '1px',
    },
    '.cm-lintRange-warning': {
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='6' height='3'%3E%3Cpath d='M0 2.5 Q 1.5 0.5 3 2.5 T 6 2.5' fill='none' stroke='%23f59e0b' stroke-width='1.2'/%3E%3C/svg%3E")`,
      backgroundPosition: 'left bottom',
      backgroundRepeat: 'repeat-x',
      paddingBottom: '1px',
    },
    '.cm-lintRange-info': {
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='6' height='3'%3E%3Cpath d='M0 2.5 Q 1.5 0.5 3 2.5 T 6 2.5' fill='none' stroke='%2338bdf8' stroke-width='1.2'/%3E%3C/svg%3E")`,
      backgroundPosition: 'left bottom',
      backgroundRepeat: 'repeat-x',
      paddingBottom: '1px',
    },
    '.cm-lintRange-hint': {
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='6' height='3'%3E%3Cpath d='M0 2.5 Q 1.5 0.5 3 2.5 T 6 2.5' fill='none' stroke='%23c084fc' stroke-width='1.2'/%3E%3C/svg%3E")`,
      backgroundPosition: 'left bottom',
      backgroundRepeat: 'repeat-x',
      paddingBottom: '1px',
    },
  },
  { dark: true },
)

export const vscodeHighlight = HighlightStyle.define([
  { tag: [t.keyword, t.modifier, t.operatorKeyword], color: '#c084fc', fontWeight: 'bold' },
  { tag: [t.controlKeyword], color: '#f472b6', fontWeight: 'bold' },
  { tag: [t.string, t.special(t.string)], color: '#4ade80' },
  { tag: [t.number, t.integer, t.float], color: '#fb923c' },
  { tag: [t.bool, t.null, t.atom], color: '#38bdf8' },
  { tag: [t.lineComment, t.blockComment, t.comment], color: '#64748b', fontStyle: 'italic' },
  {
    tag: [t.function(t.variableName), t.function(t.propertyName), t.standard(t.name)],
    color: '#facc15',
  },
  { tag: [t.typeName, t.className, t.namespace], color: '#2dd4bf' },
  { tag: [t.variableName, t.propertyName, t.name], color: '#f1f5f9' },
  { tag: [t.operator, t.derefOperator], color: '#cbd5e1' },
  {
    tag: [t.punctuation, t.separator, t.paren, t.brace, t.squareBracket, t.bracket],
    color: '#94a3b8',
  },
  { tag: t.invalid, color: '#ef4444' },
])

export const defaultEditorTheme: Extension = [vscodeDarkTheme]
