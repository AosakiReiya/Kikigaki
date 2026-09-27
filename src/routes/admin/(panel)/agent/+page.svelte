<script lang="ts">
	import AgentPanel from '$lib/components/agent/AgentPanel.svelte';
</script>

<svelte:head>
	<title>AI Agent — Admin</title>
</svelte:head>

<div class="wrap">
	<div class="head">
		<h1>✦ AI Agent</h1>
		<p>
			與右下角 Floating Agent 為同一
			runtime（Session／Run／Plan／審批全共用）。拖曳右下角按鈕可移到不擋路的位置。
		</p>
	</div>
	<div class="stage">
		<AgentPanel embedded />
	</div>
</div>

<style>
	.wrap {
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
		height: calc(100dvh - 3rem);
		min-height: 30rem;
	}
	.head h1 {
		margin: 0;
		font-size: 1.3rem;
	}
	.head p {
		margin: 0.3rem 0 0;
		font-size: 0.8rem;
		color: var(--color-ink-muted);
	}
	.stage {
		flex: 1;
		min-height: 0;
	}
</style>
