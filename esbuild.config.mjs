import esbuild from "esbuild";

const mode = process.argv[2] ?? "production";
const production = mode === "production";

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", "electron", "@codemirror/state", "@codemirror/view", "@lezer/common"],
  format: "cjs",
  target: "es2022",
  platform: "browser",
  outfile: "main.js",
  sourcemap: production ? false : "inline",
  minify: production,
  treeShaking: true,
  define: {
    "process.env.NODE_ENV": JSON.stringify(production ? "production" : "development")
  },
  logLevel: "info"
});

if (production) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
  console.log("Personal Stream is watching for changes.");
}
