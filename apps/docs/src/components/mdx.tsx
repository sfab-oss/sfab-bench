import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";

// Resolves the component set used to render compiled MDX. Lean for now: the
// Fumadocs defaults, wearing the brand via token theming in docs.css. Override
// or extend here when we do the proper docs pass (custom Card, callouts, etc.).
export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    ...components,
  } satisfies MDXComponents;
}

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
