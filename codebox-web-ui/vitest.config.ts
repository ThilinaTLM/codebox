import { defineConfig } from "vitest/config"
import viteTsConfigPaths from "vite-tsconfig-paths"
import viteReact from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [
    viteTsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    viteReact(),
  ],
  test: {
    environment: "jsdom",
    globals: false,
    include: ["src/**/*.{test,spec}.?(c|m)[jt]s?(x)"],
  },
})
