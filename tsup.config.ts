import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    format: ["esm"],
    dts: true,
    sourcemap: true,
    clean: true,
    target: "node18",
  },
  {
    // Standalone Babel plugin — referenced by .babelrc in consumer projects
    entry: { "babel-plugin": "src/phase2/babel-plugin.ts" },
    format: ["cjs"],
    sourcemap: true,
    target: "node18",
    external: [
      "@babel/parser",
      "@babel/traverse",
      "@babel/generator",
      "@babel/types",
    ],
  },
  {
    entry: { cli: "src/cli.ts" },
    format: ["esm"],
    sourcemap: true,
    target: "node18",
    // Babel packages use dynamic require() of Node built-ins — must not be bundled
    external: [
      "@babel/parser",
      "@babel/traverse",
      "@babel/generator",
      "@babel/types",
    ],
    banner: {
      js: "#!/usr/bin/env node",
    },
  },
]);
