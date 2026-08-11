import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { execSync } from "child_process";
import { resolve } from "path";

/**
 * Injects build metadata (timestamp, git commit hash) as a hidden
 * <script type="application/json"> and a global `window.__BUILD_INFO__`
 * object, plus a hidden DOM element for easy DevTools inspection.
 */
function buildInfoPlugin() {
  let commitHash = "";
  let buildTime = "";

  try {
    commitHash = execSync("git rev-parse --short HEAD", {
      stdio: ["pipe", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    commitHash = "unknown";
  }

  buildTime = new Date().toISOString();

  return {
    name: "build-info",

    config() {
      return {
        define: {
          "import.meta.env.VITE_BUILD_TIME": JSON.stringify(buildTime),
          "import.meta.env.VITE_COMMIT_HASH": JSON.stringify(commitHash),
        },
      };
    },

    transformIndexHtml(html) {
      const meta = JSON.stringify({ buildTime, commitHash });
      return html.replace(
        "</head>",
        `\n    <script type="application/json" id="build-info">${meta}</script>\n  </head>`,
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), buildInfoPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@bookmark-digest/catalog": path.resolve(
        __dirname,
        "../../packages/catalog/src",
      ),
      "@bookmark-digest/schemas": path.resolve(
        __dirname,
        "../../packages/schemas/src",
      ),
      "@bookmark-digest/shared": path.resolve(
        __dirname,
        "../../packages/shared/src",
      ),
    },
  },
});
