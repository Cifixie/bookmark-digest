import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
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
