import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

/**
 * Vite config for building the Voice Widget bundle
 * 
 * This creates a standalone JS file that can be embedded in any website.
 * 
 * BUILD:
 * ```bash
 * pnpm run build:widget
 * ```
 * 
 * OUTPUT:
 * - dist/widget/voice-widget.js - UMD bundle (works everywhere)
 * - dist/widget/voice-widget.es.js - ES module bundle
 */
export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/react/widget-entry.tsx'),
      name: 'VoiceWidget',
      formats: ['umd', 'es'],
      fileName: (format) => `voice-widget.${format === 'es' ? 'es.' : ''}js`,
    },
    outDir: 'dist/widget',
    rollupOptions: {
      // Don't externalize React - bundle it for standalone use
      external: [],
      output: {
        // Global variables for UMD build
        globals: {},
        // Ensure CSS is inlined
        assetFileNames: 'voice-widget.[ext]',
      },
    },
    // Inline all dependencies for standalone bundle
    commonjsOptions: {
      include: [/node_modules/],
    },
    // Enable minification for production
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false, // Keep console logs for debugging
      },
    },
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
});
