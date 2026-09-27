/**
 * Built-in plugin registry (Phase 21).
 * Core call sites simply `import '../plugins'` (side-effect registration) or use the re-exported
 * emit/applyFilter directly — registration happens once at module load (idempotent, see hooks.ts).
 * Future DB/community plugins (Phase 22) switch this to async directory loading; the interface stays.
 */
import { registerPlugin, emit, applyFilter, hookRegistry } from './hooks';
import { searchPlugin } from './builtin/search';
import { activityPlugin } from './builtin/activity';
import { thankYouPlugin } from './builtin/thank-you';

export const BUILTIN_PLUGINS = [searchPlugin, activityPlugin, thankYouPlugin];

registerPlugin(searchPlugin);
registerPlugin(activityPlugin);
registerPlugin(thankYouPlugin);

export { emit, applyFilter, hookRegistry };
export type { HookContext } from './types';
