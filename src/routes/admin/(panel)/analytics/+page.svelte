<script lang="ts">
	import { SvelteMap } from 'svelte/reactivity';
	import { LOCALE_LABELS } from '$lib/i18n';
	import Chart from '$lib/components/admin/Chart.svelte';
	import { chartPalette, PRESETS } from '$lib/stores/chart-palette.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let paletteOpen = $state(false);

	/* * Search Console performance (Phase 65b; unconfigured = the card's empty state) */
	let an = $state<{
		rows: { query: string; clicks: number; impressions: number; position: number }[];
		rowsPages: { page: string; clicks: number; impressions: number; position: number }[];
		from: string;
		to: string;
	} | null>(null);
	let anMsg = $state('');
	$effect(() => {
		void fetch('/api/admin/gsc/analytics?days=28')
			.then(async (r) => {
				const j = await r.json();
				if (j.ok) an = j.data;
				else anMsg = j.error ?? '';
			})
			.catch((e) => (anMsg = String(e)));
	});

	const CHANNEL_LABEL: Record<string, string> = {
		direct: '直接進入',
		search: '搜尋',
		social: '社群',
		referral: '外部連結',
		email: 'Email',
		ads: '廣告',
		campaign: 'Campaign',
		'(舊資料)': '未採集'
	};
	const ch = (c: string) => (c === '' ? '未採集' : (CHANNEL_LABEL[c] ?? c));

	const dailyLabels = $derived(data.daily?.map((d) => d.date.slice(5)) ?? []);
	const dailyPv = $derived(data.daily?.map((d) => d.pv) ?? []);
	const dailyUv = $derived(data.daily?.map((d) => d.uv) ?? []);

	const localeData = $derived(
		(data.byLocale ?? []).slice(0, 6).map((r) => ({
			label: LOCALE_LABELS[r.locale as keyof typeof LOCALE_LABELS] ?? r.locale,
			pv: r.pv
		}))
	);

	const channelData = $derived(
		(data.byChannel ?? []).slice(0, 7).map((r) => ({ label: ch(r.channel), pv: r.pv }))
	);

	const topChartData = $derived(
		(data.topPosts ?? []).slice(0, 5).map((r) => ({ label: r.title, pv: r.pv }))
	);

	/* * crosstab pivot: slug × field → per-column totals, column order (by total), top 8 posts per row */
	function buildCross<T extends { slug: string; pv: number }>(
		rows: T[],
		colOf: (r: T) => string,
		colLabel: (c: string) => string,
		fixedOrder?: string[]
	) {
		const colTotals = new SvelteMap<string, number>();
		const bySlug = new SvelteMap<string, SvelteMap<string, number>>();
		for (const r of rows) {
			const col = colOf(r);
			colTotals.set(col, (colTotals.get(col) ?? 0) + r.pv);
			const row = bySlug.get(r.slug) ?? new SvelteMap<string, number>();
			row.set(col, (row.get(col) ?? 0) + r.pv);
			bySlug.set(r.slug, row);
		}
		const cols = fixedOrder ?? [...colTotals.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
		const ranked = [...bySlug.entries()]
			.map(([slug, cell]) => ({
				slug,
				title: data.titles?.[slug] ?? slug,
				total: [...cell.values()].reduce((a, b) => a + b, 0),
				cells: cols.map((c) => cell.get(c) ?? 0)
			}))
			.sort((a, b) => b.total - a.total)
			.slice(0, 8);
		return { cols, headers: cols.map(colLabel), ranked };
	}

	const crossLocale = $derived(
		buildCross(
			data.postLocale ?? [],
			(r) => r.locale,
			(c) => LOCALE_LABELS[c as keyof typeof LOCALE_LABELS] ?? c ?? '—',
			['zh-tw', 'zh-cn', 'en', 'jp']
		)
	);
	const crossChannel = $derived(buildCross(data.postChannel ?? [], (r) => r.channel, ch));
</script>

<svelte:head>
	<title>Analytics — Admin</title>
</svelte:head>

<div class="head">
	<h1 class="title">Analytics</h1>
	<div class="ranges" role="group" aria-label="時間範圍">
		{#each data.ranges ?? [] as r (r.key)}
			<a href={`/admin/analytics?range=${r.key}`} class="range" class:active={r.key === data.range}
				>{r.label}</a
			>
		{/each}
	</div>
</div>
<p class="note">日期以 UTC 記錄。舊資料沒有語系／來源欄位，會顯示在「未採集」。</p>

{#if !data.dbReady}
	<p class="empty">資料庫未配置。</p>
{:else}
	<div class="stats">
		<div class="stat">
			<span class="stat-label">Pageviews</span>
			<span class="stat-value">{data.totals.pv.toLocaleString()}</span>
		</div>
		<div class="stat">
			<span class="stat-label">訪客（去重）</span>
			<span class="stat-value">{data.totals.uv.toLocaleString()}</span>
		</div>
		<div class="stat">
			<span class="stat-label">Sessions</span>
			<span class="stat-value">{data.totals.sessions.toLocaleString()}</span>
		</div>
	</div>

	{#if an && (an.rows.length > 0 || an.rowsPages.length > 0)}
		<div class="gsc-cards">
			<div class="gsc-card">
				<h3 class="gsc-title">搜尋查詢 · {an.from} → {an.to}（GSC，延遲約 2 天）</h3>
				<table class="gsc-table">
					<thead><tr><th>查詢字</th><th>點擊</th><th>曝光</th><th>排名</th></tr></thead>
					<tbody>
						{#each an.rows as r (r.query)}
							<tr
								><td>{r.query}</td><td>{r.clicks}</td><td>{r.impressions}</td><td>{r.position}</td
								></tr
							>
						{/each}
					</tbody>
				</table>
			</div>
			<div class="gsc-card">
				<h3 class="gsc-title">頁面表現</h3>
				<table class="gsc-table">
					<thead><tr><th>頁面</th><th>點擊</th><th>曝光</th><th>排名</th></tr></thead>
					<tbody>
						{#each an.rowsPages as r (r.page)}
							<tr
								><td class="gsc-page">{r.page.replace(/^https?:\/\/[^/]+/, '') || '/'}</td><td
									>{r.clicks}</td
								><td>{r.impressions}</td><td>{r.position}</td></tr
							>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{:else if anMsg && !anMsg.includes('尚未設定') && !anMsg.includes('尚未配置') && !anMsg.includes('property')}
		<p class="note">Search Console：{anMsg}</p>
	{:else}
		<p class="note">
			尚未接 Search Console API——於 <a href="/admin/settings">設定頁</a> 配置服務帳戶後，這裡會顯示真實的點擊／曝光／排名。
		</p>
	{/if}

	<div class="pal">
		<button
			type="button"
			class="mini pal-toggle"
			class:on={paletteOpen}
			onclick={() => (paletteOpen = !paletteOpen)}
		>
			🎨 配色
		</button>
		{#if paletteOpen}
			<div class="pal-panel">
				<div class="sws">
					{#each chartPalette.colors as c, i (i)}
						<label class="sw" title="色位 {i + 1}">
							<input
								type="color"
								value={c}
								oninput={(e) => chartPalette.set(i, (e.target as HTMLInputElement).value)}
							/>
							<code>{c}</code>
						</label>
					{/each}
				</div>
				<div class="pal-actions">
					{#each PRESETS as pr (pr.name)}
						<button type="button" class="mini" onclick={() => chartPalette.apply(pr.colors)}
							>{pr.name}</button
						>
					{/each}
					<span class="grow"></span>
					<button type="button" class="mini" onclick={() => chartPalette.reset()}>↺ 還原預設</button
					>
				</div>
				<p class="pal-hint">即改即生效；僅保存在本瀏覽器（不上伺服器）。</p>
			</div>
		{/if}
	</div>

	<div class="charts">
		<section class="card">
			<h2 class="card-title">每日趨勢</h2>
			{#if dailyPv.length > 0}
				<Chart
					type="line"
					height={240}
					data={{
						labels: dailyLabels,
						datasets: [
							{ label: 'PV', data: dailyPv, tension: 0.3, fill: false },
							{ label: 'UV', data: dailyUv, tension: 0.3, fill: false, borderDash: [4, 4] }
						]
					}}
					options={{ plugins: { legend: { display: true } } }}
				/>
			{:else}
				<p class="empty">這個範圍還沒有資料。</p>
			{/if}
		</section>

		<section class="card">
			<h2 class="card-title">流量來源（渠道）</h2>
			{#if channelData.length > 0}
				<Chart
					type="doughnut"
					height={240}
					data={{
						labels: channelData.map((c) => c.label),
						datasets: [{ data: channelData.map((c) => c.pv) }]
					}}
					options={{ plugins: { legend: { display: true, position: 'right' } } }}
				/>
			{:else}
				<p class="empty">這個範圍還沒有資料。</p>
			{/if}
		</section>

		<section class="card">
			<h2 class="card-title">語言分布</h2>
			{#if localeData.length > 0}
				<Chart
					type="bar"
					data={{
						labels: localeData.map((l) => l.label),
						datasets: [{ data: localeData.map((l) => l.pv) }]
					}}
				/>
			{:else}
				<p class="empty">這個範圍還沒有資料。</p>
			{/if}
		</section>

		<section class="card">
			<h2 class="card-title">熱門文章</h2>
			{#if topChartData.length > 0}
				<Chart
					type="bar"
					data={{
						labels: topChartData.map((t) => t.label),
						datasets: [{ data: topChartData.map((t) => t.pv) }]
					}}
					options={{
						indexAxis: 'y',
						plugins: { legend: { display: false } },
						scales: { y: { ticks: { autoSkip: false } } }
					}}
				/>
			{:else}
				<p class="empty">這個範圍還沒有資料。</p>
			{/if}
		</section>
	</div>

	<div class="tables">
		<section class="card">
			<h2 class="card-title">來源網域 Top 10</h2>
			{#if data.byReferrer.length > 0}
				<table class="table">
					<tbody>
						{#each data.byReferrer as r (r.domain)}
							<tr>
								<td>{r.domain}</td>
								<td class="num">{r.pv}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{:else}
				<p class="empty">這個範圍沒有外部來源紀錄。</p>
			{/if}
		</section>

		<section class="card">
			<h2 class="card-title">UTM Campaigns</h2>
			{#if data.campaigns.length > 0}
				<table class="table">
					<thead>
						<tr>
							<th>source</th>
							<th>medium</th>
							<th>campaign</th>
							<th class="num">PV</th>
						</tr>
					</thead>
					<tbody>
						{#each data.campaigns as c (`${c.source}|${c.medium}|${c.campaign}`)}
							<tr>
								<td>{c.source || '—'}</td>
								<td>{c.medium || '—'}</td>
								<td>{c.campaign}</td>
								<td class="num">{c.pv}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{:else}
				<p class="empty">這個範圍沒有帶 UTM 的流量。</p>
			{/if}
		</section>

		<section class="card">
			<h2 class="card-title">文章 × 語言</h2>
			<table class="table">
				<thead>
					<tr>
						<th>文章</th>
						{#each crossLocale.headers as h (h)}
							<th class="num">{h}</th>
						{/each}
						<th class="num">計</th>
					</tr>
				</thead>
				<tbody>
					{#each crossLocale.ranked as row (row.slug)}
						<tr>
							<td class="post-cell">{row.title}</td>
							{#each row.cells as v, i (i)}
								<td class="num">{v > 0 ? v : '·'}</td>
							{/each}
							<td class="num total">{row.total}</td>
						</tr>
					{:else}
						<tr>
							<td class="empty" colspan={crossLocale.headers.length + 2}>還沒有資料。</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</section>

		<section class="card">
			<h2 class="card-title">文章 × 來源</h2>
			<table class="table">
				<thead>
					<tr>
						<th>文章</th>
						{#each crossChannel.headers as h (h)}
							<th class="num">{h}</th>
						{/each}
						<th class="num">計</th>
					</tr>
				</thead>
				<tbody>
					{#each crossChannel.ranked as row (row.slug)}
						<tr>
							<td class="post-cell">{row.title}</td>
							{#each row.cells as v, i (i)}
								<td class="num">{v > 0 ? v : '·'}</td>
							{/each}
							<td class="num total">{row.total}</td>
						</tr>
					{:else}
						<tr>
							<td class="empty" colspan={crossChannel.headers.length + 2}>還沒有資料。</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</section>
	</div>
{/if}

<style>
	.gsc-cards {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
		margin: 0 0 1.25rem;
	}
	.gsc-card {
		border: 1px solid var(--color-line);
		border-radius: 0.75rem;
		padding: 0.875rem 1rem;
		background: var(--color-bg-elevated);
	}
	.gsc-title {
		margin: 0 0 0.625rem;
		font-size: 0.8125rem;
	}
	.gsc-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.75rem;
	}
	.gsc-table th {
		text-align: left;
		color: var(--color-ink-muted);
		font-weight: 500;
		padding: 0.25rem 0.5rem 0.25rem 0;
	}
	.gsc-table td {
		padding: 0.25rem 0.5rem 0.25rem 0;
		border-top: 1px solid var(--color-line);
	}
	.gsc-page {
		max-width: 18rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	@media (max-width: 60rem) {
		.gsc-cards {
			grid-template-columns: 1fr;
		}
	}
	.pal {
		display: flex;
		justify-content: flex-end;
		margin: 0 0 0.6rem;
	}
	.pal-toggle.on {
		border-color: var(--color-accent);
		color: var(--color-accent);
	}
	.pal-panel {
		position: absolute;
		right: 1.5rem;
		z-index: 20;
		margin-top: 2.2rem;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		padding: 0.85rem 1rem;
		border: 1px solid var(--color-line);
		border-radius: 0.8rem;
		background: var(--color-bg-elevated);
		box-shadow: 0 8px 28px rgb(0 0 0 / 12%);
		width: min(26rem, 92vw);
	}
	.pal .mini.grow,
	.pal-actions .grow {
		flex: 1;
	}
	.sws {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.5rem;
	}
	.sw {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.7rem;
	}
	.sw input[type='color'] {
		width: 2.1rem;
		height: 2.1rem;
		padding: 0;
		border: 1px solid var(--color-line);
		border-radius: 0.5rem;
		background: none;
		cursor: pointer;
	}
	.sw code {
		font-size: 0.62rem;
		color: var(--color-ink-muted);
	}
	.pal-actions {
		display: flex;
		gap: 0.35rem;
		align-items: center;
	}
	.pal-hint {
		margin: 0;
		font-size: 0.68rem;
		color: var(--color-ink-muted);
	}

	.head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin-bottom: 0.25rem;
	}

	.title {
		font-size: 1.75rem;
		font-weight: 700;
	}

	.ranges {
		display: flex;
		gap: 0.25rem;
	}

	.range {
		padding: 0.375rem 0.75rem;
		border: 1px solid var(--color-line);
		border-radius: 0.5rem;
		color: var(--color-ink-muted);
		font-size: 0.8125rem;
		text-decoration: none;
	}

	.range:hover {
		color: var(--color-ink);
	}

	.range.active {
		color: var(--color-accent);
		border-color: var(--color-accent);
	}

	.note {
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
		margin-bottom: 1.5rem;
	}

	.stats {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
		gap: 1rem;
		margin-bottom: 1.5rem;
	}

	.stat {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		border: 1px solid var(--color-line);
		border-radius: 0.875rem;
		padding: 1rem 1.25rem;
		background: var(--color-bg-elevated);
	}

	.stat-label {
		font-size: 0.75rem;
		color: var(--color-ink-muted);
	}

	.stat-value {
		font-size: 1.625rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}

	.charts {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1rem;
		margin-bottom: 1.5rem;
	}

	.tables {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1rem;
	}

	.card {
		border: 1px solid var(--color-line);
		border-radius: 0.875rem;
		padding: 1.125rem 1.25rem;
		background: var(--color-bg-elevated);
		min-width: 0;
	}

	.card-title {
		font-size: 0.875rem;
		font-weight: 600;
		margin: 0 0 0.875rem;
	}

	.table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.8125rem;
	}

	.table th,
	.table td {
		text-align: left;
		padding: 0.4375rem 0.5rem;
		border-bottom: 1px solid var(--color-line);
	}

	.table th {
		color: var(--color-ink-muted);
		font-weight: 500;
		font-size: 0.75rem;
	}

	.num {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	.total {
		color: var(--color-ink);
		font-weight: 600;
	}

	.post-cell {
		max-width: 14rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.empty {
		color: var(--color-ink-muted);
		font-size: 0.8125rem;
		padding: 0.5rem 0;
	}

	@media (max-width: 1023px) {
		.charts,
		.tables {
			grid-template-columns: 1fr;
		}
	}
</style>
