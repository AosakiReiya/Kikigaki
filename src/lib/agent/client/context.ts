/**
 * Public context bus (client-safe pure state) — admin pages inject "the Agent's environment".
 * FloatingAgent snapshots this into the run context on every send();
 * deep pages like Workshop pass component code directly via agent.setContext (too large for this bus).
 */
import type { AgentContext } from '$lib/agent/runtime/types';

export const siteContext: { value: AgentContext } = { value: {} };

export function setAgentEnvContext(ctx: Partial<AgentContext>): void {
	siteContext.value = { ...siteContext.value, ...ctx };
}
