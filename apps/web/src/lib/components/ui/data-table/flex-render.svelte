<script lang="ts">
  import { RenderComponentConfig, RenderSnippetConfig } from './render-helpers.js'

  // `content` is a TanStack `columnDef.header`/`columnDef.cell` value: a string,
  // a function returning a renderable, or a Render*Config. Typed loosely because
  // TanStack's template types don't line up with Svelte's strict function variance.
  let { content, context }: { content: unknown; context: unknown } = $props()
</script>

{#if typeof content === 'string' || typeof content === 'number'}
  {content}
{:else if typeof content === 'function'}
  {@const result = (content as (ctx: unknown) => unknown)(context)}
  {#if result instanceof RenderComponentConfig}
    {@const { component: Component, props } = result}
    <Component {...props} />
  {:else if result instanceof RenderSnippetConfig}
    {@const { snippet, params } = result}
    {@render snippet(params)}
  {:else if result != null}
    {result}
  {/if}
{:else if content instanceof RenderComponentConfig}
  {@const { component: Component, props } = content}
  <Component {...props} />
{:else if content instanceof RenderSnippetConfig}
  {@const { snippet, params } = content}
  {@render snippet(params)}
{/if}
