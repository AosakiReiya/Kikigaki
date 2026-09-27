<script lang="ts">
	/**
	 * /dev/lists (58.11): synthetic data × real components — a preview and feel-testing ground for
	 * pagination / auto load-more / swap loader / TOC progress underline; touches no D1 data.
	 */
	import PostRow from '$lib/components/PostRow.svelte';
	import BookCard from '$lib/components/BookCard.svelte';
	import type { PostSummary, SeriesCard } from '$lib/server/content';

	const POSTS = 46;
	const PAGE = 12;

	function mkPost(i: number): PostSummary {
		return {
			slug: `mock-post-${String(i).padStart(2, '0')}`,
			title: `模擬文章 ${i}`,
			summary: '這是用於列表／load-more／進度軌道測試的合成資料，不會寫入資料庫。',
			type: i % 5 === 0 ? 'devlog' : 'article',
			categoryDisplay: i % 5 === 0 ? '開發紀錄' : '文章',
			date: '2026-08-01',
			tags: [{ name: 'mock', display: 'mock' }],
			pinned: false,
			views: (POSTS - i) * 7,
			translated: true,
			availableLocales: ['zh-tw', 'en']
		};
	}
	const all = Array.from({ length: POSTS }, (_, i) => mkPost(i + 1));

	/* —— auto load-more (same vocabulary as /blog: sentinel IO + button + EOF) —— */
	let shown = $state(PAGE);
	let sentinel = $state<HTMLElement>();
	const canMore = $derived(shown < all.length);
	$effect(() => {
		const el = sentinel;
		if (!el || !canMore) return;
		const io = new IntersectionObserver(
			(es) => {
				if (es.some((e) => e.isIntersecting)) shown = Math.min(all.length, shown + PAGE);
			},
			{ rootMargin: '400px' }
		);
		io.observe(el);
		return () => io.disconnect();
	});

	/* —— bookshelf pagination —— */
	const books: SeriesCard[] = Array.from({ length: 15 }, (_, i) => ({
		slug: `mock-book-${i + 1}`,
		title: `_mock 書 ${i + 1}`,
		summary: '無封面書卡：固定比例書框＋書腰帶，不再塌陷。',
		count: ((i * 5) % 9) + 2
	}));
	let shelfPage = $state(1);
	const shelfTotal = Math.ceil(books.length / 6);
	const shelf = $derived(books.slice((shelfPage - 1) * 6, shelfPage * 6));

	/* —— swap loader simulation (58.9 behavior visualization) —— */
	let swapping = $state(false);
	let loaderOn = $state(false);
	let timer1: ReturnType<typeof setTimeout>;
	let timer2: ReturnType<typeof setTimeout>;
	function fakeSwap() {
		clearTimeout(timer1);
		clearTimeout(timer2);
		swapping = true;
		loaderOn = false;
		timer1 = setTimeout(() => (loaderOn = true), 350);
		timer2 = setTimeout(() => {
			swapping = false;
			loaderOn = false;
		}, 1600);
	}

	/* —— TOC progress underline demo —— */
	let demoSpy = $state(0.4);
</script>

<svelte:head>
	<title>lists lab — dev</title>
</svelte:head>

<main class="lab">
	<h1 class="lab-h">Lists Lab（合成測試場・零資料庫觸碰）</h1>

	<section class="sec">
		<h2>1. 自動 load-more（捲到底追加・同 /blog 元件與邏輯）</h2>
		<ul class="post-list">
			{#each all.slice(0, shown) as p, i (p.slug)}
				<PostRow post={p} index={i} />
			{/each}
		</ul>
		<p class="zone" bind:this={sentinel}>
			{#if canMore}
				<button type="button" class="btn" onclick={() => (shown += PAGE)}>
					載入更多（{shown}/{all.length}）
				</button>
			{:else}
				— 已全部載入（EOF）—
			{/if}
		</p>
	</section>

	<section class="sec">
		<h2>2. 書架分頁（同 /series 卡片牆）</h2>
		<ul class="shelf">
			{#each shelf as s (s.slug)}
				<li>
					<BookCard
						href={`/dev/lists#${s.slug}`}
						title={s.title}
						cover={s.cover ?? ''}
						count={s.count}
					/>
				</li>
			{/each}
		</ul>
		<p class="zone">
			<button type="button" class="btn" disabled={shelfPage === 1} onclick={() => (shelfPage -= 1)}
				>← prev</button
			>
			<span class="pg">page {shelfPage}/{shelfTotal}</span>
			<button
				type="button"
				class="btn"
				disabled={shelfPage === shelfTotal}
				onclick={() => (shelfPage += 1)}>next →</button
			>
		</p>
	</section>

	<section class="sec">
		<h2>3. swap loader（350ms 後區内置中浮現）＋ 4. 目錄進度底線</h2>
		<div class="duo">
			<div class="mock-book" class:fading={swapping}>
				<div class="mk-side">
					<button type="button" class="btn" onclick={fakeSwap}>模擬慢換章</button>
					<a
						class="ts"
						class:now={demoSpy < 0.5}
						href="#d1"
						onclick={(e) => {
							e.preventDefault();
							demoSpy = 0.25;
						}}>第一步：初始化</a
					>
					<a
						class="ts"
						class:now={demoSpy >= 0.5 && demoSpy < 0.9}
						href="#d2"
						onclick={(e) => {
							e.preventDefault();
							demoSpy = 0.7;
						}}
						>第二步：綁定
						{#if demoSpy >= 0.5 && demoSpy < 0.9}
							<span class="sub-track"><i style={`--p:${demoSpy - 0.5}`}></i></span>
						{/if}</a
					>
					<a
						class="ts"
						class:now={demoSpy >= 0.9}
						href="#d3"
						onclick={(e) => {
							e.preventDefault();
							demoSpy = 1;
						}}
						>第三步：部署
						{#if demoSpy >= 0.9}
							<span class="sub-track"><i style={`--p:${(demoSpy - 0.9) * 10}`}></i></span>
						{/if}</a
					>
					<label class="rng">
						進度
						<input type="range" min="0" max="1" step="0.05" bind:value={demoSpy} />
					</label>
				</div>
				<div class="mk-main">
					{#if loaderOn}<span class="ldr">LOADING▌</span>{/if}
					<h3>模擬章節正文</h3>
					<p>
						點「模擬慢換章」：正文淡出 → 350ms 後本區中央出現 LOADING → 1.25s
						後完成。右側為目錄內進度底線（拖動滑桿看軌道填充）。
					</p>
				</div>
			</div>
		</div>
	</section>
</main>

<style>
	.lab {
		max-width: 76rem;
		margin: 0 auto;
		padding: 2.5rem 1.25rem 6rem;
	}

	.lab-h {
		font-size: 1.75rem;
		font-weight: 800;
	}

	.sec {
		margin-top: 3rem;
	}

	.sec h2 {
		font-size: 1.05rem;
		margin-bottom: 1rem;
		font-family: var(--font-mono);
	}

	.post-list {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.zone {
		display: flex;
		gap: 1rem;
		align-items: center;
		justify-content: center;
		margin-top: 1.25rem;
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
	}

	.btn {
		padding: 0.45rem 1.1rem;
		border: 1px solid var(--color-line);
		border-radius: 999px;
		background: var(--color-bg-elevated);
		color: var(--color-strong);
		font-size: 0.8125rem;
		cursor: pointer;
	}

	.btn:disabled {
		opacity: 0.4;
	}

	.pg {
		font-family: var(--font-mono);
	}

	/* 59F: faithful mirror of the production /series bookshelf (46rem capped-centered + same gap) —
	   if the lab drifts from production styles it loses its preview value */
	.shelf {
		list-style: none;
		padding: 0;
		margin: 0 auto;
		max-width: 58rem;
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 3.5rem 2.5rem;
	}

	@media (max-width: 639px) {
		.shelf {
			max-width: none;
			gap: 1.75rem 0.875rem;
		}

		.shelf :global(.bc-band) {
			padding: 1.6rem 0.5rem 0.5rem;
		}

		.shelf :global(.bc-title) {
			font-size: 0.75rem;
			-webkit-line-clamp: 1;
			line-clamp: 1;
		}

		.shelf :global(.bc-meta) {
			font-size: 0.5625rem;
		}
	}

	.mock-book {
		display: grid;
		grid-template-columns: 15rem minmax(0, 1fr);
		gap: 1.5rem;
		border: 1px solid var(--color-line);
		border-radius: 0.75rem;
		padding: 1.25rem;
		position: relative;
	}

	.mk-side {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		border-right: 1px solid var(--color-line);
		padding-right: 1rem;
	}

	.ts {
		position: relative;
		font-size: 0.8125rem;
		padding: 0.4rem 0.35rem;
		border-radius: 0.35rem;
		color: var(--color-ink-muted);
		text-decoration: none;
	}

	.ts.now {
		color: var(--color-strong);
		font-weight: 600;
	}

	.sub-track {
		position: absolute;
		left: 0.35rem;
		right: 0.35rem;
		bottom: 0.1rem;
		height: 2px;
		border-radius: 2px;
		background: color-mix(in oklab, var(--color-strong) 16%, var(--color-line));
		overflow: hidden;
	}

	.sub-track i {
		display: block;
		height: 100%;
		width: calc(var(--p, 0) * 100%);
		background: var(--color-strong);
		transition: width 0.15s linear;
	}

	.rng {
		margin-top: 0.75rem;
		font-size: 0.75rem;
		color: var(--color-ink-muted);
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.mk-main {
		position: relative;
		min-height: 12rem;
		transition:
			opacity 0.22s ease,
			transform 0.22s ease;
	}

	.fading .mk-main {
		opacity: 0;
		transform: translateY(12px);
	}

	.ldr {
		position: absolute;
		inset: 0;
		display: grid;
		place-content: center;
		font-family: var(--font-mono);
		letter-spacing: 0.3em;
		color: var(--color-strong);
	}

	.mk-main h3 {
		font-size: 1.3rem;
		margin-bottom: 0.75rem;
	}

	.mk-main p {
		font-size: 0.875rem;
		line-height: 1.8;
		color: var(--color-ink-muted);
	}
</style>
