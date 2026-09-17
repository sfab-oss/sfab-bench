import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import mdx from "fumadocs-mdx/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// Async factory so we can pass the resolved source.config to the fumadocs-mdx
// plugin. The plugin compiles content/docs/**/*.mdx into the generated
// `.source/` collection used by the /docs island.
const config = defineConfig(async () => ({
  plugins: [
    mdx(await import("./source.config")),
    devtools({ eventBusConfig: { port: 42_071 } }),
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tsconfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
}));

export default config;
