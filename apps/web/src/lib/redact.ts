/** Strip filesystem identity from UI copy and crash reports. */

export function redactProjectPrefix(text: string, projectPath: string): string {
  const abs = projectPath.trim().replace(/\/+$/, "");
  if (!abs) return text;
  const escaped = abs.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(escaped, "g"), "<project>");
}

export function redactHomePaths(text: string): string {
  return text
    .replace(/file:\/\/\/[A-Za-z]:[/\\]Users[/\\][^/\\]+/gi, "file://~")
    .replace(/file:\/\/\/Users\/[^/]+/g, "file://~")
    .replace(/file:\/\/\/home\/[^/]+/g, "file://~")
    .replace(/[A-Za-z]:[/\\]Users[/\\][^/\\]+/gi, "~")
    .replace(/\/Users\/[^/]+/g, "~")
    .replace(/\/home\/[^/]+/g, "~");
}

/** Home dirs first become `~`; a tab's `?project=` prefix becomes `<project>`. */
export function redact(text: string, projectPath = ""): string {
  const withProject = redactProjectPrefix(text, projectPath);
  return redactHomePaths(withProject);
}
