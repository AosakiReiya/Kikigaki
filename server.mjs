/**
 * Phase 77a — self-host entry: install the platform shim before starting SvelteKit (adapter-node build).
 * Usage: ADAPTER=node pnpm build && node node-shim/migrate.mjs && node server.mjs
 */
// adapter-node assumes https when ORIGIN is unset → local http deployments would trip
// SvelteKit's CSRF 403. A safe default is set here; reverse-proxy (https) deployments should set ORIGIN
// or PROTOCOL_HEADER/HOST_HEADER explicitly.
process.env.SELF_HOST = '1'; // relaxation switch for CF-specific guards like Turnstile
process.env.ORIGIN ??= `http://localhost:${process.env.PORT ?? 3000}`;
process.env.SELF_HOST_DB ??= './data/kikigaki.sqlite';
process.env.SELF_HOST_MEDIA ??= './data/media';

import { installPlatformShim } from './node-shim/install.mjs';
installPlatformShim();
await import('./build/index.js');
