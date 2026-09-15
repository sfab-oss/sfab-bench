import { redact } from "./redact";

/** Prefer `{ error }` from the API; never dump an HTML 404 page into a card. */
export function messageFromHttpBody(text: string, fallback = ""): string {
  const raw = text.trim();
  if (!raw) return fallback;
  try {
    const body = JSON.parse(raw) as { error?: unknown };
    if (typeof body.error === "string" && body.error.trim()) return body.error.trim();
  } catch {
    /* not JSON */
  }
  if (/^<!DOCTYPE html/i.test(raw) || /^<html/i.test(raw)) {
    return fallback || "Could not load this file";
  }
  return raw;
}

function unwrap(raw: string): string {
  return messageFromHttpBody(raw, "Could not load this file").trim();
}

/** Catalog / CAD 400 "not a directory: /abs/path" (and a gone folder). */
export function isUnavailableFolder(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const text = unwrap(raw);
  return /^not a directory:/i.test(text) || text === "the project folder is gone";
}

/**
 * Short reasons for the CAD card. Path redaction happens separately so a
 * unit check can see the mapping without a project prefix.
 *
 * OCCT `IFSelect_ReturnStatus`: 2 = RetError (bad input), 3 = RetFail.
 * Garbage files (`printf 'not a step file'`) come back as status 3.
 */
export function friendlyLoadReason(raw: string): string {
  const text = unwrap(raw);
  if (isUnavailableFolder(text)) return "This folder isn't available";
  if (/^not a STEP or GLB/i.test(text)) return "Not a STEP or GLB file";
  const occt = /^STEP could not be read \(status (\d+)\)$/i.exec(text);
  if (occt) {
    const status = Number(occt[1]);
    if (status === 2 || status === 3) return "This file isn't a valid STEP";
    return "STEP could not be read";
  }
  return text;
}

export function displayLoadError(raw: string, projectPath = ""): string {
  return redact(friendlyLoadReason(raw), projectPath);
}

export type LoadCardCopy = {
  title: string;
  detail: string;
  /** Set only when `progress > 0`; never 0. */
  percent: number | null;
};

export function loadCardCopy(input: { title: string; url: string; progress: number }): LoadCardCopy {
  const title = input.title.trim() || "model";
  if (input.progress <= 0) {
    const path = input.url.split("?")[0] ?? "";
    const step = /\.(step|stp)$/i.test(path);
    return {
      title,
      detail: step ? "Meshing on this Mac — large files can take a minute" : `Preparing ${title}…`,
      percent: null,
    };
  }
  return {
    title,
    detail: `Downloading meshes… ${input.progress}%`,
    percent: input.progress,
  };
}
