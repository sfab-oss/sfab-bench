import { jsonApi } from "@/lib/api";

export type ProjectRow = {
  path: string;
  name: string;
  lastFile: string | null;
  openedAt: number;
};

export type ProjectInfo = {
  project: ProjectRow | null;
  recents: ProjectRow[];
  fileRecents?: string[];
  revision: number;
};

export type BrowseInfo = {
  path: string;
  parent: string | null;
  dirs: { name: string; path: string }[];
};

export async function fetchProject(): Promise<ProjectInfo> {
  const res = await jsonApi.project.$get();
  if (!res.ok) throw new Error("Could not load project");
  return (await res.json()) as ProjectInfo;
}

export async function openProjectPath(path: string): Promise<ProjectInfo> {
  const res = await jsonApi.project.$post({ json: { path } });
  const body = (await res.json()) as ProjectInfo & { error?: string };
  if (!res.ok) throw new Error(body.error || "Could not open that folder");
  return body;
}

export async function browsePath(path?: string): Promise<BrowseInfo> {
  const res = await jsonApi.browse.$get(path ? { query: { path } } : {});
  const body = (await res.json()) as BrowseInfo & { error?: string };
  if (!res.ok) throw new Error(body.error || "Could not browse");
  return body;
}
