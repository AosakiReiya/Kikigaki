/**
 * SSE response utilities (shared by the Agent API).
 * open() pushes events via send; closes automatically at the end. Clients continue with
 * EventSource / fetch-stream; persisted event data carries {id, payload}.
 */

export interface SseHandle {
	/** id feeds EventSource Last-Event-ID auto-resume */
	send(event: string, data: unknown, id?: number): void;
	close(): void;
}

export function sseResponse(open: (h: SseHandle) => Promise<void>): Response {
	const enc = new TextEncoder();
	let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
	let closed = false;
	const stream = new ReadableStream<Uint8Array>({
		start(c) {
			controller = c;
		},
		async cancel() {
			closed = true;
		}
	});
	const h: SseHandle = {
		send(event, data, id) {
			if (closed || !controller) return;
			try {
				const head = id !== undefined ? `id: ${id}\n` : '';
				controller.enqueue(enc.encode(`${head}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
			} catch {
				closed = true;
			}
		},
		close() {
			if (closed) return;
			closed = true;
			try {
				controller?.close();
			} catch {
				/* already closed */
			}
		}
	};
	// not awaited: response sent first, stream pushed in the background
	void open(h).finally(() => h.close());
	return new Response(stream, {
		headers: {
			'content-type': 'text/event-stream; charset=utf-8',
			'cache-control': 'no-cache, no-transform',
			connection: 'keep-alive',
			'x-accel-buffering': 'no'
		}
	});
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
