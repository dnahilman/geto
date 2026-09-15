import { EditorView } from '@codemirror/view'
import { HighlightStyle } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'
import type { Extension } from '@codemirror/state'

const FONT =
  "'JetBrains Mono', 'Cascadia Code', 'Fira Code', Menlo, Monaco, Consolas, 'Courier New', monospace"

export const vscodeDarkTheme = EditorView.theme(
  {
    '&': {
      color: '#d4d4d4',
      backgroundColor: '#1e1e1e',
      fontSize: '13px',
      height: '100%',
    },
    '.cm-scroller': {
      fontFamily: FONT,
      lineHeight: '1.5',
    },
    '.cm-content': {
      caretColor: '#aeafad',
      padding: '8px 0',
    },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#aeafad' },
    '&.cm-focused .cm-cursor': { borderLeftColor: '#aeafad' },
    '.cm-selectionBackground, .cm-content ::selection': { backgroundColor: '#264f78' },
    '&.cm-focused .cm-selectionBackground, &.cm-focused .cm-content ::selection': {
      backgroundColor: '#264f78',
    },
    '.cm-activeLine': { backgroundColor: '#ffffff0a' },
    '.cm-activeLineGutter': { backgroundColor: '#ffffff0a', color: '#c6c6c6' },
    '.cm-gutters': {
      backgroundColor: '#1e1e1e',
      color: '#858585',
      borderRight: '1px solid #2d2d2d',
      borderTop: 'none',
      borderBottom: 'none',
      borderLeft: 'none',
    },
    '.cm-lineNumbers .cm-gutterElement': { padding: '0 4px 0 16px', minWidth: '32px' },
    '.cm-foldPlaceholder': { backgroundColor: 'transparent', border: 'none', color: '#858585' },
    // Run-statement gutter — stroke play icon (Lucide style)
    '.cm-run-gutter': {
      width: '24px',
      flexShrink: '0',
      borderRight: '1px solid #2d2d2d',
    },
    '.cm-run-marker': {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      height: '100%',
      background: 'none',
      border: 'none',
      padding: '0',
      cursor: 'pointer',
      color: '#4ec9b0',
      opacity: '0.4',
      transition: 'opacity 0.12s, color 0.12s',
    },
    '.cm-run-gutter:hover .cm-run-marker': { opacity: '0.75' },
    '.cm-run-marker:hover': { opacity: '1', color: '#5ef0c0' },
    '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
      backgroundColor: '#0d3a58',
      outline: '1px solid #888',
    },
    '.cm-selectionMatch': { backgroundColor: '#3a3d41' },
    // Autocomplete popup — VS Code suggest widget style
    '.cm-tooltip': {
      backgroundColor: '#252526',
      border: '1px solid #454545',
      color: '#d4d4d4',
    },
    '.cm-tooltip.cm-tooltip-autocomplete > ul': {
      fontFamily: FONT,
      maxHeight: '16em',
    },
    '.cm-tooltip-autocomplete > ul > li': { padding: '2px 6px' },
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
      backgroundColor: '#04395e',
      color: '#ffffff',
    },
    '.cm-completionIcon': { paddingRight: '12px', opacity: '0.7' },
    '.cm-completionLabel': { color: '#d4d4d4' },
    '.cm-completionDetail': { color: '#858585', fontStyle: 'normal', marginLeft: '0.5em' },
    '.cm-completionMatchedText': { textDecoration: 'none', color: '#4daafc', fontWeight: 'bold' },
    // Diagnostics / Linting styling
    '.cm-diagnostic': {
      padding: '4px 8px',
      fontFamily: FONT,
      fontSize: '12px',
    },
    '.cm-diagnostic-error': { borderLeft: '3px solid #f44747' },
    '.cm-diagnostic-warning': { borderLeft: '3px solid #cca700' },
    '.cm-diagnostic-info': { borderLeft: '3px solid #75beff' },
  },
  { dark: true },
)

export const vscodeHighlight = HighlightStyle.define([
  { tag: [t.keyword, t.modifier, t.operatorKeyword], color: '#569cd6' },
  { tag: [t.controlKeyword], color: '#c586c0' },
  { tag: [t.string, t.special(t.string)], color: '#ce9178' },
  { tag: [t.number, t.integer, t.float], color: '#b5cea8' },
  { tag: [t.bool, t.null, t.atom], color: '#569cd6' },
  { tag: [t.lineComment, t.blockComment, t.comment], color: '#6a9955', fontStyle: 'italic' },
  {
    tag: [t.function(t.variableName), t.function(t.propertyName), t.standard(t.name)],
    color: '#dcdcaa',
  },
  { tag: [t.typeName, t.className, t.namespace], color: '#4ec9b0' },
  { tag: [t.variableName, t.propertyName, t.name], color: '#9cdcfe' },
  { tag: [t.operator, t.derefOperator], color: '#d4d4d4' },
  {
    tag: [t.punctuation, t.separator, t.paren, t.brace, t.squareBracket, t.bracket],
    color: '#d4d4d4',
  },
  { tag: t.invalid, color: '#f44747' },
])

export const defaultEditorTheme: Extension = [
  vscodeDarkTheme,
]
