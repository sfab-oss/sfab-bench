import { createFileRoute } from "@tanstack/react-router";
import { useFumadocsLoader } from "fumadocs-core/source/client";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { RootProvider } from "fumadocs-ui/provider/tanstack";
import { Suspense } from "react";
import docsCss from "@/docs.css?url";
import { docsClientLoader, docsServerLoader } from "@/lib/docs-loaders";
import { baseOptions } from "@/lib/layout.shared";

export const Route = createFileRoute("/docs/$")({
  component: Page,
  loader: async ({ params }) => {
    const slugs = params._splat?.split("/") ?? [];
    const data = await docsServerLoader({ data: slugs });
    await docsClientLoader.preload(data.path);
    return data;
  },
  head: () => ({
    links: [{ rel: "stylesheet", href: docsCss }],
  }),
});

function Page() {
  const data = useFumadocsLoader(Route.useLoaderData());
  const content = docsClientLoader.useContent(data?.path ?? "");
  if (!data) {
    return null;
  }

  return (
    <RootProvider theme={{ enabled: false }}>
      <DocsLayout {...baseOptions()} tree={data.pageTree}>
        <Suspense>{content}</Suspense>
      </DocsLayout>
    </RootProvider>
  );
}
