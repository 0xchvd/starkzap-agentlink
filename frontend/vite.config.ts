import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  root: ".",
  build: { outDir: "dist" },
  resolve: {
    alias: {
      "@fatsolutions/tongo-sdk": path.resolve(__dirname, "src/stubs/empty.ts"),
    },
  },
});
