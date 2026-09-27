/** Agent shared types (pure type file: safe to import from UI and server) */
export type AgentPermission = 'read' | 'write' | 'publish';

export interface Msg {
	role: 'system' | 'user' | 'assistant' | 'tool';
	content: string;
	/** assistant: tool calls initiated by the model this round */
	toolCalls?: { id: string; name: string; args: Record<string, unknown> }[];
	/** tool: the corresponding call id */
	toolCallId?: string;
}

export interface PendingCall {
	id: string;
	name: string;
	args: Record<string, unknown>;
	permission: AgentPermission;
	summary: string;
	/** arg-validation failure reasons (shown when present)*/
	invalid?: string;
}

export type TurnResult =
	| { kind: 'text'; content: string }
	| { kind: 'proposal'; calls: PendingCall[] }
	| { kind: 'error'; error: string };
