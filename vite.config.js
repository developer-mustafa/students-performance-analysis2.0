import { defineConfig } from 'vite';
import { resolve } from 'path';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
    plugins: [
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['edtechmataprologomain.png'],
            manifest: {
                name: 'EdTech Automata Pro',
                short_name: 'EdTechPro',
                description: 'এডটেক অটোমাটা প্রো - Full Academic Enterprise solutions',
                theme_color: '#2563eb',
                icons: [
                    {
                        src: 'edtechmataprologomain.png',
                        sizes: '192x192',
                        type: 'image/png',
                        purpose: 'any maskable'
                    },
                    {
                        src: 'edtechmataprologomain.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'any maskable'
                    }
                ],
                start_url: './',
                display: 'standalone',
                background_color: '#ffffff'
            },
            workbox: {
                globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}']
            }
        })
    ],
    root: './',
    base: './',
    publicDir: 'public',
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        chunkSizeWarningLimit: 1000,
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
            },
            output: {
                manualChunks: {
                    'firebase-core': ['firebase/app', 'firebase/auth'],
                    'firebase-db': ['firebase/firestore'],
                    'vendor-libs': ['xlsx', 'chart.js', 'jspdf', 'html2canvas'],
                }
            }
        },
    },
    server: {
        port: 5173,
        open: true,
        cors: true,
    },
    preview: {
        port: 4173,
    },
});
