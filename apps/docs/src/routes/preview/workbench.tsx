import { createFileRoute } from "@tanstack/react-router";
import { WorkbenchPreview } from "@/components/preview/workbench-preview";

export const Route = createFileRoute("/preview/workbench")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex" }],
  }),
  component: PreviewPage,
});

function PreviewPage() {
  return <WorkbenchPreview />;
}
