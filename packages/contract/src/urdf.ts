/**
 * Joint names and mesh filenames from URDF XML text.
 *
 * The contract has no DOM and no Node APIs, so this is a scan: comments
 * are dropped, then each `<joint>` and `<mesh>` tag is read for `name`
 * and `filename`. The server calls it and passes the result into
 * `validateWorld`. Paths are returned as written. `package://` and
 * absolute paths are not resolved here.
 */

export type UrdfInfo = {
  joints: string[];
  meshes: string[];
};

function decodeXml(text: string): string {
  return text
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function attr(attrs: string, name: string): string | undefined {
  const match = new RegExp(
    `(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`
  ).exec(attrs);
  if (!match) return undefined;
  return decodeXml(match[1] ?? match[2] ?? "");
}

export function extractUrdfJointsAndMeshes(xml: string): UrdfInfo {
  const stripped = xml.replace(/<!--[\s\S]*?-->/g, "");
  const joints: string[] = [];
  const meshes: string[] = [];
  for (const tag of stripped.matchAll(/<([A-Za-z][\w:-]*)\b([^>]*)>/g)) {
    const element = tag[1];
    const attrs = tag[2] ?? "";
    if (element === "joint") {
      const name = attr(attrs, "name");
      if (name) joints.push(name);
    } else if (element === "mesh") {
      const filename = attr(attrs, "filename");
      if (filename !== undefined) meshes.push(filename);
    }
  }
  return { joints, meshes };
}
