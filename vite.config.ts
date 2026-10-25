import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import createHtmlPlugin from "vite-plugin-simple-html";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    port: 5173,
    host: true,
  },
  plugins: [
    react(),
    tailwindcss(),
    visualizer({
      // Tofu: upstream opened the bundle report in a browser after every build that was not CI's; a hosting build
      // has no browser to open, so the report is only written.
      open: false,
      filename: "./dist/stats.html",
    }),
    createHtmlPlugin({
      minify: true,
      inject: {
        data: {
          mainScript: `src/main.tsx`,
        },
      },
    }),
    VitePWA({
      registerType: "autoUpdate",
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MiB
        // Tofu: the links in Tofu's sign-in emails open <app>/auth/confirm?token_hash=…&type=…. The service worker
        // answers every other address with the app's index.html, whose ./assets/… would then be looked for under
        // /auth/ and never load; this address goes to the network, which serves public/auth/confirm/index.html.
        // Workbox tests the path and the query together.
        navigateFallbackDenylist: [/\/auth\/confirm(\/|\?|$)/],
      },
      manifest: false, // Use existing manifest.json from public/
    }),
  ],
  define:
    process.env.NODE_ENV === "production" && process.env.VITE_SUPABASE_URL
      ? {
          "import.meta.env.VITE_IS_DEMO": JSON.stringify(
            process.env.VITE_IS_DEMO,
          ),
          "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(
            process.env.VITE_SUPABASE_URL,
          ),
          // Tofu: a managed database names the public key VITE_SUPABASE_PUBLISHABLE_KEY (and VITE_SUPABASE_ANON_KEY).
          "import.meta.env.VITE_SB_PUBLISHABLE_KEY": JSON.stringify(
            process.env.VITE_SB_PUBLISHABLE_KEY ||
              process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
              process.env.VITE_SUPABASE_ANON_KEY,
          ),
          "import.meta.env.VITE_INBOUND_EMAIL": JSON.stringify(
            process.env.VITE_INBOUND_EMAIL,
          ),
          "import.meta.env.VITE_ATTACHMENTS_BUCKET": JSON.stringify(
            process.env.VITE_ATTACHMENTS_BUCKET,
          ),
        }
      : undefined,
  base: "./",
  build: {
    rolldownOptions: {
      output: {
        keepNames: true,
      },
    },
    sourcemap: true,
  },
  resolve: {
    preserveSymlinks: true,
    dedupe: ["react-router", "react-router-dom"],
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
