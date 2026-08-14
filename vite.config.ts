import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const isDev = mode === 'development';

  return {
    plugins: [
      react(),
      tailwindcss(),
    ],
    server: {
      host: true,
      port: 5001,
      proxy: {
        '/api': {
          target: 'http://localhost:5000',
          changeOrigin: true,
          secure: false,
        },
      },
    },
    build: {
      target: 'es2022',
      outDir: 'dist',
      sourcemap: isDev,
      minify: !isDev,
      cssCodeSplit: true,
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            if (id.includes('node_modules')) {
              if (id.includes('react') || id.includes('react-dom')) return 'vendor';
              if (id.includes('lightweight-charts')) return 'charts';
              if (id.includes('lucide-react')) return 'icons';
              if (id.includes('dexie')) return 'db';
              return 'vendor';
            }
          },
        },
      },
    },
    // Configurar base para subpaths si se despliega en subdirectorio
    // base: '/elitos/', // Descomenta si usas GitHub Pages o subpath
    define: {
      // Exponer VITE_API_URL al cliente (vacío = usa proxy /api en dev, URL absoluta en prod)
      'import.meta.env.VITE_API_URL': JSON.stringify(process.env.VITE_API_URL || ''),
    },
  };
});