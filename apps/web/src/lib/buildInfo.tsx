/**
 * Injects build metadata into a hidden DOM element for DevTools inspection.
 *
 * - `data-build-info` attribute on the `<html>` element — invisible during normal use,
 *   but easily findable via DevTools Elements panel or `document.documentElement.dataset.buildInfo`.
 * - `window.__BUILD_INFO__` global — for script access.
 * - `<script type="application/json" id="build-info">` — for SSR/iframe contexts.
 *
 * This is purely for debugging/verification — the element uses `display:none`
 * via CSS attribute selector and carries no visual footprint.
 */
import { useEffect } from "react";

const buildInfo: { buildTime: string; commitHash: string } | undefined =
  import.meta.env.VITE_BUILD_TIME
    ? { buildTime: import.meta.env.VITE_BUILD_TIME, commitHash: import.meta.env.VITE_COMMIT_HASH }
    : undefined;

if (buildInfo) {
  (window as unknown as Record<string, unknown>).__BUILD_INFO__ = buildInfo;
}

export function BuildInfo() {
  useEffect(() => {
    if (!buildInfo) return;
    document.documentElement.dataset.buildInfo = JSON.stringify(buildInfo);
  }, []);

  // Hidden element — renders nothing visible but persists in the DOM tree
  return (
    <div
      style={{ display: "none" }}
      data-testid="build-info"
    >
      Build: {buildInfo?.commitHash} at {buildInfo?.buildTime}
    </div>
  );
}
