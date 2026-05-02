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
                        src: '/edtechmataprologomain.png',
                        sizes: '192x192',
                        type: 'image/png',
                        purpose: 'any'
                    },
                    {
                        src: '/edtechmataprologomain.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'any'
                    },
                    {
                        src: '/edtechmataprologomain.png',
                        sizes: '192x192',
                        type: 'image/png',
                        purpose: 'maskable'
                    },
                    {
                        src: '/edtechmataprologomain.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'maskable'
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
        sourcemap: false,
        minify: 'esbuild',
        cssMinify: true,
        chunkSizeWarningLimit: 1000,
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
            },
            output: {
                manualChunks: {
                    'firebase-core': ['firebase/app', 'firebase/auth'],
                    'firebase-db': ['firebase/firestore'],
                    'chart-libs': ['chart.js'],
                    'xlsx-lib': ['xlsx'],
                    'pdf-lib': ['jspdf']
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
    esbuild: {
        drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
    },
});
