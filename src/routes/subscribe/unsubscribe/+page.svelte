<script lang="ts">
	let { data } = $props();
</script>

<div class="sub-page">
	{#if data.ok}
		<h1>已退訂</h1>
		<p>{data.email} 已從電子報名單移除，不會再收到通知。感謝曾經的關注。</p>
	{:else}
		<h1>連結無效</h1>
		<p>這組退訂連結不存在（{data.error}）。</p>
	{/if}
	<p><a href="/">← 回首頁</a></p>
</div>

<style>
	.sub-page {
		max-width: 34rem;
		margin: clamp(4rem, 18vh, 8rem) auto;
		padding: 0 1.5rem;
		text-align: center;
	}
	h1 {
		font-size: 1.5rem;
		margin: 0 0 0.75rem;
	}
	p {
		color: var(--color-ink-muted);
		font-size: 0.9375rem;
		line-height: 1.7;
	}
	a {
		color: var(--color-ink);
	}
</style>
