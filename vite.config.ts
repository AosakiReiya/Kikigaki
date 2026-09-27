import { paraglideVitePlugin } from '@inlang/paraglide-js';

import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import adapterCloudflare from '@sveltejs/adapter-cloudflare';
import adapterNode from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import path from 'node:path';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';

const dirname = import.meta.dirname;

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// dual adapter (Phase 77): Cloudflare Pages by default; ADAPTER=node for self-host
			// (Docker: build/ output + the node/ directory's D1/R2 platform shim)
			adapter:
				process.env.ADAPTER === 'node'
					? adapterNode({ out: 'build', precompress: false })
					: adapterCloudflare({
							config: 'wrangler.toml',
							platformProxy: {
								configPath: 'wrangler.toml',
								persist: true
							}
						}),
			// post bodies are rendered at runtime by markdown-it since v1.5 (see src/lib/server/markdown.ts);
			// mdsvex build-time compilation is no longer needed
			typescript: {
				config: (config) => {
					config.include.push('../drizzle.config.ts');
				}
			}
		}),

		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide',
			emitTsDeclarations: true,
			// URL is the authoritative locale source (/en/... prefix; zh-tw is base with no prefix);
			// cookie persists the setLocale preference (no longer read for prefix-less URLs)
			strategy: ['url', 'cookie', 'globalVariable', 'baseLocale'],
			// localized URLs uniformly carry no trailing slash (/en not /en/, consistent with SvelteKit routing)
			trailingSlash: 'never',
			// admin is owner-only: stays Chinese, outside locale routing
			routeStrategies: [{ match: '/admin/:path(.*)?', exclude: true }]
		})
	],
	define: {
		// Carta: don't load shiki server-side — shrinks the workerd bundle (syntax highlighting happens browser-only)
		__ENABLE_CARTA_SSR_HIGHLIGHTER__: false
	},
	test: {
		expect: { requireAssertions: true },
		// Scaffold tests were removed in Phase 0; real tests land in Phase 1.
		passWithNoTests: true,
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			},

			{
				extends: true,
				plugins: [storybookTest({ configDir: path.join(dirname, '.storybook') })],
				test: {
					name: 'storybook',
					browser: {
						enabled: true,
						headless: true,
						provider: playwright({}),
						instances: [{ browser: 'chromium' }]
					}
				}
			}
		]
	}
});
