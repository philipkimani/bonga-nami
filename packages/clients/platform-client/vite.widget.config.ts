/**
 * Vite Configuration for Widget Bundle
 * 
 * Builds the React chat widget into a standalone bundle
 * that can be embedded on any website via a <script> tag.
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { copyFileSync, existsSync, mkdirSync } from 'fs';

// Plugin to copy embed.js to dist after build
const copyEmbedPlugin = {
  name: 'copy-embed',
  closeBundle() {
    const srcPath = resolve(__dirname, 'public/widget/embed.js');
    const destDir = resolve(__dirname, 'dist/widget');
    const destPath = resolve(destDir, 'embed.js');
    
    try {
      if (!existsSync(destDir)) {
        mkdirSync(destDir, { recursive: true });
      }
      if (existsSync(srcPath)) {
        copyFileSync(srcPath, destPath);
        console.log('[vite] Copied embed.js to dist/widget/');
      }
    } catch (e) {
      console.warn('[vite] Could not copy embed.js:', e);
    }
  }
};

export default defineConfig({
  plugins: [react(), copyEmbedPlugin],
  
  build: {
    // Build the widget as a library
    lib: {
      entry: resolve(__dirname, 'src/ui/widget-react/WidgetApp.tsx'),
      name: 'RuskinsWidget',
      fileName: 'widget.bundle',
      formats: ['iife'], // Immediately Invoked Function Expression for script tag
    },
    
    outDir: 'dist/widget',
    
    rollupOptions: {
      // Bundle everything (don't externalize React for script tag usage)
      external: [],
      output: {
        // Ensure all styles are inlined
        assetFileNames: '[name][extname]',
      },
    },
    
    // Inline all assets
    assetsInlineLimit: 100000,
    
    // Minify for production
    minify: 'terser',
    
    // Source maps for debugging
    sourcemap: true,
  },
  
  resolve: {
    alias: {
      '@platform/core': resolve(__dirname, '../../core/src'),
    },
  },
  
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
  },
});
