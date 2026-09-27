<script lang="ts">
	/**
	 * 79b dynamic form field renderer: kind → control. Values always travel as string/boolean/string-array
	 * (JSON serialization is upsertItem's data contract; this only manages editing state).
	 * A select missing options = degrades to text (manifests can catch up incrementally).
	 */
	import type { ContentTypeField } from '$lib/server/content-types/types';

	let {
		field,
		value = $bindable<string | boolean | string[]>(undefined)
	}: {
		field: ContentTypeField;
		value?: string | boolean | string[];
	} = $props();

	function asText(v: unknown): string {
		return typeof v === 'string' ? v : '';
	}

	function addItem() {
		value = [...asArray(), ''];
	}
	function asArray(): string[] {
		return Array.isArray(value) ? value : [];
	}
	function setItem(i: number, next: string) {
		const arr = [...asArray()];
		arr[i] = next;
		value = arr;
	}
	function removeItem(i: number) {
		value = asArray().filter((_, x) => x !== i);
	}
</script>

<div class="df">
	<label class="label" for={`df-${field.key}`}>
		{field.key}{#if field.required}<span class="req">*</span>{/if}
		{#if field.max && (field.kind === 'text' || field.kind === 'markdown')}<span class="max-note"
				>≤{field.max}</span
			>{/if}
	</label>

	{#if field.kind === 'markdown'}
		<textarea
			name={`f_${field.key}`}
			id={`df-${field.key}`}
			rows="7"
			bind:value
			placeholder={field.key}
			class="grow-input"></textarea>
	{:else if field.kind === 'boolean'}
		<label class="check">
			<input
				type="checkbox"
				name={`f_${field.key}`}
				value="1"
				id={`df-${field.key}`}
				checked={value === true}
				onchange={(e) => (value = (e.target as HTMLInputElement).checked)}
			/>
			<span>{field.key}</span>
		</label>
	{:else if field.kind === 'date'}
		<input
			type="date"
			name={`f_${field.key}`}
			id={`df-${field.key}`}
			value={asText(value)}
			onchange={(e) => (value = (e.target as HTMLInputElement).value)}
		/>
	{:else if field.kind === 'select' && field.options?.length}
		<select name={`f_${field.key}`} id={`df-${field.key}`} bind:value>
			<option value="">—</option>
			{#each field.options as opt (opt)}
				<option value={opt}>{opt}</option>
			{/each}
		</select>
	{:else if field.kind === 'repeater'}
		<div class="rep">
			{#each asArray() as item, i (i)}
				<div class="rep-row">
					<input
						type="text"
						name={`f_${field.key}`}
						value={item}
						oninput={(e) => setItem(i, (e.target as HTMLInputElement).value)}
					/>
					<button type="button" class="mini" onclick={() => removeItem(i)} aria-label="移除"
						>✕</button
					>
				</div>
			{/each}
			<button type="button" class="mini" onclick={addItem}>+ 新增項</button>
		</div>
	{:else}
		<input
			type="text"
			name={`f_${field.key}`}
			id={`df-${field.key}`}
			placeholder={field.kind === 'media' ? 'https://… 或 /media 路徑' : field.key}
			bind:value
			class="grow-input"
		/>
	{/if}
</div>

<style>
	.df {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.req {
		color: var(--color-accent);
		margin-left: 0.15rem;
	}
	.max-note {
		color: var(--color-ink-muted);
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		margin-left: 0.4rem;
	}
	.check {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
	}
	.grow-input {
		width: 100%;
	}
	.rep {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.rep-row {
		display: flex;
		gap: 0.4rem;
	}
	.rep-row input {
		flex: 1;
	}
</style>
