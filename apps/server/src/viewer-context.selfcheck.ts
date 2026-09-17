import { viewerTools } from "./viewer-context";

function expect(cond: boolean, label: string) {
  if (!cond) throw new Error(label);
}

expect(
  typeof viewerTools.get_viewer.execute !== "function",
  "get_viewer has no server execute"
);
expect(
  typeof viewerTools.show_artifact.execute === "function",
  "show_artifact stays on the server"
);

console.log("viewer-context.selfcheck ok");
