import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    // Use local proxy to avoid CORS issues
    proxy: {
      '/ratex-api': {
        target: 'https://api.rate-x.io',
        headers: {
          'Origin': 'https://app.rate-x.io',
          'Referer': 'https://app.rate-x.io/',
        },
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/ratex-api/, ''), // Remove the /ratex-api prefix
        configure: (proxy, options) => {
          proxy.on('proxyRes', (proxyRes, req, res) => {
            if (req.url?.includes('ratex-api')) {
              console.log('[RateX Proxy] Response Status:', proxyRes.statusCode);
            }
          });
        },
      },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
