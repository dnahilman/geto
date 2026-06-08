import type { Component, ComponentProps, Snippet } from 'svelte'

/**
 * Identifies a Svelte component to render inside a `columnDef.cell`/`columnDef.header`.
 * The Svelte 5 analogue of TanStack React's `flexRender(SomeComponent, ctx)`.
 */
export class RenderComponentConfig<TComponent extends Component<any>> {
  constructor(
    public component: TComponent,
    public props: ComponentProps<TComponent> | Record<string, never> = {},
  ) {}
}

export function renderComponent<
  TComponent extends Component<any>,
  Props extends ComponentProps<TComponent>,
>(component: TComponent, props: Props | Record<string, never> = {}) {
  return new RenderComponentConfig(component, props)
}

/** Identifies a Svelte snippet to render inside a `columnDef.cell`/`columnDef.header`. */
export class RenderSnippetConfig<TProps> {
  constructor(
    public snippet: Snippet<[TProps]>,
    public params: TProps,
  ) {}
}

export function renderSnippet<TProps>(snippet: Snippet<[TProps]>, params: TProps) {
  return new RenderSnippetConfig(snippet, params)
}
