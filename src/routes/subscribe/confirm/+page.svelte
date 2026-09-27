<script lang="ts">
	let { data } = $props();
</script>

<div class="sub-page">
	{#if data.ok}
		<h1>✅ 訂閱確認完成</h1>
		<p>{data.email} 已加入電子報名單。新文章發布時會寄通知（每封都可一鍵退訂）。</p>
	{:else}
		<h1>連結無效</h1>
		<p>這組確認連結不存在或已使用（{data.error}）。可於文章頁評論框重新勾選訂閱。</p>
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
