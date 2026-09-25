/**
 * Link names, joint names, and mesh filenames from URDF XML text.
 *
 * The contract has no DOM and no Node APIs, so this is a scan: comments
 * are dropped, then each `<link>`, `<joint>`, and `<mesh>` tag is read
 * for `name` and `filename`. Attribute values are XML-decoded. Paths are
 * returned as written. `package://` and absolute paths are not resolved
 * here; `resolveUrdfMesh` only joins a mesh filename onto the URDF's
 * directory.
 */

export type UrdfInfo = {
  links: string[];
  joints: string[];
  meshes: string[];
};

export function decodeXml(text: string): string {
  return text
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

export function attr(attrs: string, name: string): string | undefined {
  const match = new RegExp(
    `(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`
  ).exec(attrs);
  if (!match) return undefined;
  return decodeXml(match[1] ?? match[2] ?? "");
}

export function extractUrdfJointsAndMeshes(xml: string): UrdfInfo {
  const stripped = xml.replace(/<!--[\s\S]*?-->/g, "");
  const links: string[] = [];
  const joints: string[] = [];
  const meshes: string[] = [];
  for (const tag of stripped.matchAll(/<([A-Za-z][\w:-]*)\b([^>]*)>/g)) {
    const element = tag[1];
    const attrs = tag[2] ?? "";
    if (element === "link") {
      const name = attr(attrs, "name");
      if (name) links.push(name);
    } else if (element === "joint") {
      const name = attr(attrs, "name");
      if (name) joints.push(name);
    } else if (element === "mesh") {
      const filename = attr(attrs, "filename");
      if (filename !== undefined) meshes.push(filename);
    }
  }
  return { links, joints, meshes };
}

/**
 * A mesh filename joined onto the URDF's directory. Both inputs are
 * relative to the world file. `..` does not resolve; the caller rejects it.
 */
export function resolveUrdfMesh(
  urdfRel: string,
  mesh: string
): string | undefined {
  const slash = urdfRel.lastIndexOf("/");
  const dir = slash === -1 ? "" : urdfRel.slice(0, slash);
  const parts: string[] = [];
  for (const part of `${dir}/${mesh}`.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") return undefined;
    parts.push(part);
  }
  if (parts.length === 0) return undefined;
  return parts.join("/");
}
