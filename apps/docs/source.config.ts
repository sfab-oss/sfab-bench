import {
  type DocsCollection,
  defineDocs,
  type frontmatterSchema,
  type metaSchema,
} from "fumadocs-mdx/config";

// Fumadocs content source. MDX lives in content/docs/**; the fumadocs-mdx Vite
// plugin compiles it into the generated `.source/` folder (aliased as
// `collections/*` in tsconfig).
//
// The explicit `DocsCollection<...>` annotation is required: with bare
// inference, `tsc --noEmit` fails with TS2742 because the inferred type names
// zod, which under pnpm only resolves via a non-portable `.pnpm/...` path.
// Spelling the generics with fumadocs' own exported schemas keeps the doc/meta
// frontmatter types intact (a bare `DocsCollection` would degrade them).
export const docs: DocsCollection<typeof frontmatterSchema, typeof metaSchema> =
  defineDocs({
    dir: "content/docs",
    docs: {
      postprocess: {
        includeProcessedMarkdown: true,
      },
    },
  });
