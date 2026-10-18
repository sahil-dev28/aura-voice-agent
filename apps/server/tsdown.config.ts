import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    app: "./src/app.ts",
  },
  format: "esm",
  outDir: "./dist",
  clean: true,
  noExternal: [/@aura\/.*/],
});
