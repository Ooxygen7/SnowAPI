import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig, loadEnv } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'
import { pluginTailwindcss } from '@rsbuild/plugin-tailwindcss'
import { tanstackRouter } from '@tanstack/router-plugin/rspack'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ envMode }) => {
  const env = loadEnv({ mode: envMode, prefixes: ['VITE_'] })
  const serverUrl =
    process.env.VITE_REACT_APP_SERVER_URL ||
    env.rawPublicVars.VITE_REACT_APP_SERVER_URL ||
    'http://localhost:3000'

  const isProd = envMode === 'production'
  const isDemo =
    (process.env.VITE_SNOWAPI_DEMO || env.rawPublicVars.VITE_SNOWAPI_DEMO) ===
    'true'
  const basePath = `${(
    process.env.VITE_APP_BASE_PATH ||
    env.rawPublicVars.VITE_APP_BASE_PATH ||
    '/'
  ).replace(/\/+$/, '')}/`
  const devProxy = Object.fromEntries(
    (['/api', '/mj', '/pg'] as const).map((key) => [
      key,
      { target: serverUrl, changeOrigin: true },
    ])
  ) as Record<string, { target: string; changeOrigin: boolean }>

  return {
    plugins: [pluginReact(), pluginTailwindcss({ optimize: false })],
    // Rsbuild 2: replaces deprecated `performance.chunkSplit` (RSPack 2 aligned)
    splitChunks: {
      preset: 'default',
      cacheGroups: {
        'vendor-react': {
          test: /node_modules[\\/](react|react-dom)[\\/]/,
          name: 'vendor-react',
          chunks: 'all',
          priority: 0,
          enforce: true,
        },
        'vendor-ui-primitives': {
          test: /node_modules[\\/](@base-ui|@radix-ui)[\\/]/,
          name: 'vendor-ui-primitives',
          chunks: 'all',
          priority: 0,
          enforce: true,
        },
        'vendor-tanstack': {
          test: /node_modules[\\/]@tanstack[\\/]/,
          name: 'vendor-tanstack',
          chunks: 'all',
          priority: 0,
          enforce: true,
        },
      },
    },
    source: {
      define: {
        'import.meta.env.VITE_SNOWAPI_DEMO': JSON.stringify(String(isDemo)),
        'import.meta.env.VITE_APP_BASE_PATH': JSON.stringify(basePath),
      },
      entry: {
        index: './src/main.tsx',
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    html: {
      template: './index.html',
      templateParameters: {
        // The entry shield must remain usable even if a CDN stylesheet request
        // fails. Keep one CSS source for both critical HTML and normal/HMR CSS.
        snowShieldCss: readFileSync(
          path.resolve(__dirname, 'src/features/snow-shield/snow-shield.css'),
          'utf8'
        ),
        faviconUrl: isDemo
          ? `${basePath}snowapi-logo.png`
          : '/snowapi-theme/unsnow-favicon.png?v=20260717-1',
      },
    },
    server: {
      host: '0.0.0.0',
      strictPort: false,
      proxy: isDemo ? {} : devProxy,
      base: basePath,
    },
    output: {
      assetPrefix: basePath,
      copy: [
        {
          from: './src/features/snow-shield/REACT-BITS-LICENSE.txt',
          to: 'snow-shield-react-bits-license.txt',
        },
        ...(isDemo
          ? [
              {
                from: './src/features/subscriptions/animation/assets/snowapi-logo.png',
                to: 'snowapi-logo.png',
              },
            ]
          : []),
      ],
      // Production optimizations
      minify: isProd,
      target: 'web',
      distPath: {
        root: 'dist',
      },
      // Rely on Rsbuild default legalComments ("linked" → per-chunk *.LICENSE.txt) in all modes.
      // Do not set "none" in production: that strips minifier-preserved third-party notices and
      // extracted license files, which some distributions require for open-source compliance.
    },
    performance: {
      // Remove console in production
      removeConsole: isProd ? ['log'] : false,
      buildCache: false,
    },
    tools: {
      rspack: {
        plugins: [
          tanstackRouter({
            target: 'react',
            // Dev: avoid per-route async chunks (reduces white flash on navigation + faster HMR feedback).
            // Prod: keep route-based code splitting.
            autoCodeSplitting: isProd,
          }),
        ],
      },
    },
  }
})
