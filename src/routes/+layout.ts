/**
 * 79a-slim client-side pack fence: SSR loads via +layout.server; before client direct-entry/
 * hydrate this ensures non-default packs land in the registry (shared cache; repeat calls cost zero).
 */
import { ensureThemePack } from '$lib/themes/registry';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ data }) => {
	await ensureThemePack(data.settings?.uiTheme);
	return data;
};
