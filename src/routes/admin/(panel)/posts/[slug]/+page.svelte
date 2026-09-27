<script lang="ts">
	import { beforeNavigate, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { renderMarkdown } from '$lib/markdown';
	import { formatDate } from '$lib/format';
	import { site } from '$lib/site';
	import { locales } from '$lib/paraglide/runtime';
	import type { Locale } from '$lib/paraglide/runtime';
	import { LOCALE_LABELS } from '$lib/i18n';
	import { swapContent } from '$lib/animation/transition';
	import { validateLdNode } from '$lib/structured';
	import { runSeoChecks, checklistScore, discoveryFlow } from '$lib/seo-checklist';
	import { site as SITE } from '$lib/site';
	import MarkdownEditor from '$lib/components/MarkdownEditor.svelte';
	import MediaPicker from '$lib/components/MediaPicker.svelte';
	import TagPicker from '$lib/components/TagPicker.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type Translation = { title: string; summary: string; body: string };
	type VersionRow = PageData['versionsByLocale'][string][number];
	const EMPTY: Translation = { title: '', summary: '', body: '' };

	function validLocale(v: string | null): v is Locale {
		return !!v && (locales as readonly string[]).includes(v);
	}

	/* * current edit locale: pure front-end switch (URL ?l synced via replaceState; shareable/refreshable) */
	const initialLocale: Locale = validLocale(page.url.searchParams.get('l'))
		? (page.url.searchParams.get('l') as Locale)
		: data.activeLocale;
	let activeLocale = $state<Locale>(initialLocale);

	const post = $derived(data.post);
	const covered = $derived(new Set(data.coveredLocales));
	const translation = $derived<Translation>(data.translations[activeLocale] ?? EMPTY);
	const versions = $derived<VersionRow[]>(data.versionsByLocale[activeLocale] ?? []);
	/* * page title: this locale's saved title → base title → slug */
	const displayTitle = $derived(translation.title || data.baseTitle || post.slug);

	let title = $state(translation.title);
	let summary = $state(translation.summary);
	let date = $state(post.publishedAt ? post.publishedAt.toISOString().slice(0, 10) : '');
	let tagList = $state<string[]>(data.tags);
	let cover = $state(post.cover ?? '');
	let published = $state(post.published);
	// Phase 67 scheduled publishing: unpublished + future time = goes live automatically when due
	let scheduledAt = $state(
		!post.published && post.publishedAt && post.publishedAt > new Date()
			? post.publishedAt.toISOString().slice(0, 16)
			: ''
	);
	let pinned = $state(!!post.pinned);
	let seriesOnly = $state(!!post.seriesOnly);
	let contentType = $state<string>(post.type ?? 'article');
	let body = $state(translation.body);
	let saving = $state(false);
	let message = $state('');

	/* * SEO override form (Phase 61; per-locale, switching locale reloads) */
	let seoTitle = $state('');
	let seoDescription = $state('');
	let canonicalUrl = $state('');
	let robotsIndex = $state(true);
	let robotsFollow = $state(true);
	let maxSnippet = $state('');
	let maxImagePreview = $state('');
	let ogTitleForm = $state('');
	let ogDescForm = $state('');
	let ogImageForm = $state('');
	let ogAltForm = $state('');
	let ogCard = $state('');
	let schemaType = $state('Article');
	let seoAuthor = $state('');
	let ogPicker = $state(false);
	let engTab = $state<'google' | 'fb' | 'x' | 'head' | 'sd'>('google');
	let headTags = $state('');
	let ldNodes = $state<{ text: string; checks: { label: string; ok: boolean; level: string }[] }[]>(
		[]
	);
	let headLoading = $state(false);
	let gscState = $state<{
		indexingState: string;
		coverage: string;
		lastCrawl: string;
		canonical: string;
	} | null>(null);
	let gscMsg = $state('');
	let gscBusy = $state(false);
	async function checkGsc(): Promise<void> {
		gscBusy = true;
		gscMsg = '';
		try {
			const res = await fetch('/api/admin/gsc/inspect', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ url: site.url + '/blog/' + post.slug })
			});
			const j = await res.json();
			if (j.ok) gscState = j.data;
			else gscMsg = j.error ?? '失敗';
		} catch (e) {
			gscMsg = e instanceof Error ? e.message : String(e);
		} finally {
			gscBusy = false;
		}
	}
	let seoSaving = $state(false);
	let seoMessage = $state('');
	let suggesting = $state(false);

	/* * Google SERP live preview (pure front-end; updates per keystroke, incl. unsaved drafts) */
	let serpTab = $state<'desktop' | 'mobile'>('desktop');
	const serpHost = $derived(site.url.replace(/^https?:\/\//, ''));
	const serpTitle = $derived((seoTitle.trim() || title || post.slug) + ' — ' + site.title);
	const serpDesc = $derived(
		seoDescription.trim() ||
			summary.trim() ||
			body
				.replace(/```[\s\S]*?```/g, '〔內容區塊〕')
				.replace(/!\[[^\]]*\]\([^)]*\)/g, '〔圖片〕')
				.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
				.replace(/[#>*_~`|-]/g, ' ')
				.replace(/\s+/g, ' ')
				.trim()
				.slice(0, 240)
	);
	const serpDate = $derived(date ? formatDate(date) : '');
	const seoChecks = $derived(
		runSeoChecks({
			title: seoTitle.trim() || title,
			description: seoDescription.trim() || summary,
			body,
			hasOgImage: !!(ogImageForm || cover || data.settings?.defaultOgImage),
			customCanonical: !!canonicalUrl.trim(),
			published,
			robotsIndex,
			siteUrl: SITE.url
		})
	);
	const seoScore = $derived(checklistScore(seoChecks));
	const seoFlow = $derived(discoveryFlow({ published, robotsIndex, robotsFollow }));

	/** OG/社群預覽解析鏈：og 覆寫 → 表單/文章值 → 站級預設 */
	const ogImageResolved = $derived(ogImageForm || cover || data.settings?.defaultOgImage || '');
	const ogDescResolved = $derived(
		ogDescForm || seoDescription.trim() || summary.trim() || serpDesc
	);
	const ogTitleResolved = $derived(ogTitleForm || seoTitle.trim() || title);
	async function loadHeadTags() {
		headLoading = true;
		try {
			const res = await fetch(`/blog/${post.slug}?headv=${Date.now()}`, { cache: 'reload' });
			const html = await res.text();
			const doc = new DOMParser().parseFromString(html, 'text/html');
			const sel =
				'title, meta[name="description"], meta[name="robots"], meta[name^="twitter"], meta[property^="og:"], meta[property^="article:"], link[rel="canonical"], link[rel="alternate"], script[type="application/ld+json"]';
			ldNodes = [...doc.head.querySelectorAll('script[type="application/ld+json"]')].map((el) => {
				try {
					const obj = JSON.parse(el.textContent ?? '{}');
					return { text: JSON.stringify(obj, null, 2), checks: validateLdNode(obj) };
				} catch {
					return {
						text: el.textContent ?? '',
						checks: [{ label: 'JSON 有效', ok: false, level: 'error' }]
					};
				}
			});
			headTags = [...doc.head.querySelectorAll(sel)]
				.map((el) => {
					el.removeAttribute('class');
					return el.outerHTML
						.replaceAll('&', '&amp;')
						.replaceAll('<', '&lt;')
						.replaceAll('>', '&gt;');
				})
				.join('\n');
		} catch {
			headTags = '（讀取失敗）';
		} finally {
			headLoading = false;
		}
	}

	function loadSeoForm(loc: Locale): void {
		const row = data.seo?.[loc] as Record<string, unknown> | undefined;
		seoTitle = String(row?.seoTitle ?? '');
		seoDescription = String(row?.seoDescription ?? '');
		canonicalUrl = String(row?.canonicalUrl ?? '');
		robotsIndex = row ? row.robotsIndex !== false : true;
		robotsFollow = row ? row.robotsFollow !== false : true;
		maxSnippet = row?.maxSnippet == null ? '' : String(row.maxSnippet);
		maxImagePreview = String(row?.maxImagePreview ?? '');
		ogTitleForm = String(row?.ogTitle ?? '');
		ogDescForm = String(row?.ogDescription ?? '');
		ogImageForm = String(row?.ogImage ?? '');
		ogAltForm = String(row?.ogImageAlt ?? '');
		ogCard = String(row?.twitterCard ?? '');
		schemaType = String(row?.schemaType ?? 'Article');
		seoAuthor = String(row?.seoAuthor ?? '');
		seoMessage = '';
	}
	loadSeoForm(initialLocale);

	let coverOpen = $state(false);
	let contentEl = $state<HTMLElement | undefined>();

	/** 版本歷史 */
	let previewVersion = $state<VersionRow | null>(null);
	let restoring = $state(false);
	let versionMsg = $state('');
	const previewHtml = $derived(
		previewVersion ? renderMarkdown(previewVersion.body, new Set(data.customNames)).html : ''
	);

	/**
	 * 未儲存變更偵測：內容髒度逐語系記錄（切換 tab 後各自比較），共用元數據單份。
	 * 只有「重新掛載編輯器」需要 nonce（版本還原）；存檔不重掛＝不丟內容。
	 */
	let savedTr = $state<Record<string, Translation>>({ ...data.translations });
	let savedMeta = $state({
		date,
		tags: tagList,
		cover,
		published,
		pinned,
		seriesOnly,
		type: contentType
	});
	let restoreNonce = $state(0);
	const remountKey = $derived(`${activeLocale}:${restoreNonce}`);
	const dirty = $derived(
		title !== (savedTr[activeLocale] ?? EMPTY).title ||
			summary !== (savedTr[activeLocale] ?? EMPTY).summary ||
			body !== (savedTr[activeLocale] ?? EMPTY).body ||
			date !== savedMeta.date ||
			tagList.join(',') !== savedMeta.tags.join(',') ||
			cover !== savedMeta.cover ||
			published !== savedMeta.published ||
			pinned !== savedMeta.pinned ||
			seriesOnly !== savedMeta.seriesOnly ||
			contentType !== savedMeta.type
	);

	/* Phase 37⑤：Agent/別 tab 更新 → 髒保護即時同步。
	   Svelte 5 注意：$state setter 不可在讀取自身相依的 effect 內重入，
	   故用結構化 prev 快照在 effect 內顯式比對，不經 dirty derived。 */
	let externalUpdate = $state(false);
	type Snap = {
		title: string;
		summary: string;
		body: string;
		cover: string;
		published: boolean;
		pinned: boolean;
		seriesOnly: boolean;
		tags: string;
		date: string;
	};
	let prevSnap: Snap | null = null;
	function curSnap(): Snap {
		return {
			title: translation.title,
			summary: translation.summary,
			body: translation.body,
			cover: post.cover ?? '',
			published: post.published,
			pinned: !!post.pinned,
			seriesOnly: !!post.seriesOnly,
			tags: data.tags.join(','),
			date: post.publishedAt ? post.publishedAt.toISOString().slice(0, 10) : ''
		};
	}
	function formVals(): Snap {
		return {
			title,
			summary,
			body,
			cover,
			published,
			pinned,
			seriesOnly,
			tags: tagList.join(','),
			date
		};
	}
	function applySnap(sn: Snap): void {
		const touchedEditor = title !== sn.title || summary !== sn.summary || body !== sn.body;
		title = sn.title;
		summary = sn.summary;
		body = sn.body;
		cover = sn.cover;
		published = sn.published;
		pinned = sn.pinned;
		seriesOnly = sn.seriesOnly;
		tagList = data.tags;
		date = sn.date;
		savedTr = { ...savedTr, [activeLocale]: translation };
		savedMeta = { date, tags: tagList, cover, published, pinned, seriesOnly, type: contentType };
		externalUpdate = false;
		if (touchedEditor) restoreNonce++; // MarkdownEditor 內部態重掛吃新內容
	}
	$effect(() => {
		const sn = curSnap();
		const form = formVals();
		const prev = prevSnap;
		prevSnap = sn;
		if (!prev) return;
		const serverChanged =
			sn.title !== prev.title ||
			sn.summary !== prev.summary ||
			sn.body !== prev.body ||
			sn.cover !== prev.cover ||
			sn.published !== prev.published ||
			sn.pinned !== prev.pinned ||
			sn.seriesOnly !== prev.seriesOnly ||
			sn.tags !== prev.tags ||
			sn.date !== prev.date;
		if (!serverChanged) return;
		const touched =
			form.title !== prev.title ||
			form.summary !== prev.summary ||
			form.body !== prev.body ||
			form.cover !== prev.cover ||
			form.published !== prev.published ||
			form.pinned !== prev.pinned ||
			form.seriesOnly !== prev.seriesOnly ||
			form.tags !== prev.tags ||
			form.date !== prev.date;
		if (touched) externalUpdate = true;
		else applySnap(sn);
	});
	function applyServerCopy(): void {
		applySnap(curSnap());
	}
	/** 本地動作（存檔/還原/切語系）後校準快照：避免自己的寫入被當成外部更新 */
	function primeSnap(): void {
		prevSnap = {
			title,
			summary,
			body,
			cover,
			published,
			pinned,
			seriesOnly,
			tags: tagList.join(','),
			date
		};
	}
	$effect(() => {
		const onBeforeUnload = (e: BeforeUnloadEvent) => {
			if (!dirty || saving) return;
			e.preventDefault();
			e.returnValue = '';
		};
		window.addEventListener('beforeunload', onBeforeUnload);
		return () => window.removeEventListener('beforeunload', onBeforeUnload);
	});

	beforeNavigate(() => {
		if (dirty && !saving && !confirm('有未儲存的變更，確定要離開嗎？')) {
			throw new Error('cancel navigation');
		}
	});

	/** modal 開啟時鎖背景捲動 */
	$effect(() => {
		if (!previewVersion) return;
		const prev = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = prev;
		};
	});

	function onKeydown(e: KeyboardEvent) {
		if (previewVersion && e.key === 'Escape') {
			previewVersion = null;
			return;
		}
		if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
			e.preventDefault();
			if (!saving && !restoring) void saveNow();
		}
	}

	function timeLabel(d: Date | string) {
		return new Date(d).toLocaleString('zh-TW', {
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	/** 字數（含標點，CJK 與拉丁混排通用） */
	function charCount(v: VersionRow) {
		return v.body.replace(/\s/g, '').length;
	}

	/** 與較舊一版的字數差（最新→最舊排列，i+1 為前一版） */
	function diffFromPrev(v: VersionRow, i: number, total: number) {
		if (i + 1 >= total) return null;
		return charCount(v) - charCount(versions[i + 1]);
	}

	/** 切換編輯語系：局部刷新（不動 URL 導覽，GSAP 過場換內容） */
	function switchLocale(loc: Locale) {
		if (loc === activeLocale) return;
		if (dirty && !saving && !confirm('有未儲存的變更，切換語系不會保存它們，確定要切換嗎？')) {
			return;
		}
		history.replaceState(history.state, '', `?l=${loc}`);
		if (!contentEl) {
			applyLocale(loc);
			return;
		}
		void swapContent(contentEl, () => applyLocale(loc));
	}

	function applyLocale(loc: Locale) {
		activeLocale = loc;
		loadSeoForm(loc);
		const tr = data.translations[loc] ?? EMPTY;
		title = tr.title;
		summary = tr.summary;
		body = tr.body;
		message = '';
		versionMsg = '';
		previewVersion = null;
		primeSnap();
	}

	async function saveNow() {
		saving = true;
		message = '';
		const fd = new FormData();
		fd.set('locale', activeLocale);
		fd.set('title', title);
		fd.set('summary', summary);
		fd.set('date', date);
		fd.set('tags', tagList.join(','));
		fd.set('cover', cover);
		fd.set('body', body);
		fd.set('published', published ? 'on' : '');
		fd.set('scheduledAt', scheduledAt ? new Date(scheduledAt).toISOString() : '');
		fd.set('pinned', pinned ? 'on' : '');
		fd.set('series_only', seriesOnly ? 'on' : '');
		fd.set('type', contentType);
		try {
			const res = await fetch(`/admin/posts/${post.slug}?/save`, { method: 'POST', body: fd });
			const j = (await res.json().catch(() => null)) as {
				type?: string;
				message?: string;
				data?: { message?: string };
			} | null;
			if (!res.ok || j?.type === 'error' || j?.type === 'failure') {
				message = `儲存失敗：${j?.data?.message ?? j?.message ?? res.status}`;
			} else {
				message = '✓ 已儲存';
				// 編輯器不重掛（內容保留）；僅更新髒度基準並刷新版本歷史
				savedTr[activeLocale] = { title, summary, body };
				savedMeta = {
					date,
					tags: tagList,
					cover,
					published,
					pinned,
					seriesOnly,
					type: contentType
				};
				primeSnap();
				await invalidateAll();
			}
		} catch (err) {
			message = `儲存失敗：${err instanceof Error ? err.message : String(err)}`;
		} finally {
			saving = false;
		}
	}

	async function saveSeoNow() {
		seoSaving = true;
		seoMessage = '';
		const fd = new FormData();
		fd.set('locale', activeLocale);
		fd.set('seo_title', seoTitle);
		fd.set('seo_description', seoDescription);
		fd.set('canonical_url', canonicalUrl);
		fd.set('robots_index', robotsIndex ? 'on' : '');
		fd.set('robots_follow', robotsFollow ? 'on' : '');
		fd.set('max_snippet', maxSnippet);
		fd.set('max_image_preview', maxImagePreview);
		fd.set('og_title', ogTitleForm);
		fd.set('og_description', ogDescForm);
		fd.set('og_image', ogImageForm);
		fd.set('og_image_alt', ogAltForm);
		fd.set('twitter_card', ogCard);
		fd.set('schema_type', schemaType);
		fd.set('seo_author', seoAuthor);
		try {
			const res = await fetch(`/admin/posts/${post.slug}?/seo`, { method: 'POST', body: fd });
			const j = (await res.json().catch(() => null)) as {
				type?: string;
				message?: string;
				data?: { message?: string };
			} | null;
			if (!res.ok || j?.type === 'error' || j?.type === 'failure') {
				seoMessage = `儲存失敗：${j?.data?.message ?? j?.message ?? res.status}`;
			} else {
				seoMessage = '✓ SEO 設定已儲存';
				await invalidateAll();
			}
		} catch (err) {
			seoMessage = `儲存失敗：${err instanceof Error ? err.message : String(err)}`;
		} finally {
			seoSaving = false;
		}
	}

	async function suggestSeo() {
		suggesting = true;
		seoMessage = '';
		try {
			const res = await fetch(`/api/admin/posts/${post.slug}/suggest-seo`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ locale: activeLocale, title, summary, content: body })
			});
			const j = await res.json().catch(() => null);
			if (res.ok && j?.description) seoDescription = String(j.description).slice(0, 320);
			else seoMessage = `AI 生成失敗：${j?.message ?? res.status}`;
		} catch (err) {
			seoMessage = `AI 生成失敗：${err instanceof Error ? err.message : String(err)}`;
		} finally {
			suggesting = false;
		}
	}

	function submitSave(e: SubmitEvent) {
		e.preventDefault();
		void saveNow();
	}

	async function restoreVersion(version: VersionRow) {
		if (
			!confirm(
				`確定還原到 ${timeLabel(version.createdAt)} 的版本？目前內容會先快照保留，還原後存檔會產生新版本。`
			)
		)
			return;
		restoring = true;
		versionMsg = '';
		const fd = new FormData();
		fd.set('versionId', version.id);
		try {
			const res = await fetch(`/admin/posts/${post.slug}?/restore`, { method: 'POST', body: fd });
			const j = (await res.json().catch(() => null)) as {
				type?: string;
				message?: string;
				data?: { message?: string };
			} | null;
			if (!res.ok || j?.type === 'error' || j?.type === 'failure') {
				versionMsg = `還原失敗：${j?.data?.message ?? j?.message ?? res.status}`;
			} else {
				versionMsg = j?.message ?? '✓ 已還原';
				previewVersion = null;
				// 直接把編輯器內容置為還原後的版本（MarkdownEditor 僅掛載時讀 value，需重掛）
				title = version.title;
				summary = version.summary;
				body = version.body;
				savedTr[version.locale] = { title, summary, body };
				restoreNonce++;
				primeSnap();
				await invalidateAll();
			}
		} catch (err) {
			versionMsg = `還原失敗：${err instanceof Error ? err.message : String(err)}`;
		} finally {
			restoring = false;
		}
	}

	async function deleteVersion(version: VersionRow) {
		if (
			!confirm(
				`確定刪除「${timeLabel(version.createdAt)}」這個版本？此操作不可復原（不影響文章本身）。`
			)
		)
			return;
		restoring = true;
		versionMsg = '';
		const fd = new FormData();
		fd.set('versionId', version.id);
		try {
			const res = await fetch(`/admin/posts/${post.slug}?/deleteVersion`, {
				method: 'POST',
				body: fd
			});
			const j = (await res.json().catch(() => null)) as {
				type?: string;
				message?: string;
				data?: { message?: string };
			} | null;
			if (!res.ok || j?.type === 'error' || j?.type === 'failure') {
				versionMsg = `刪除失敗：${j?.data?.message ?? j?.message ?? res.status}`;
			} else {
				versionMsg = j?.message ?? '✓ 版本已刪除';
				previewVersion = null;
				await invalidateAll();
			}
		} catch (err) {
			versionMsg = `刪除失敗：${err instanceof Error ? err.message : String(err)}`;
		} finally {
			restoring = false;
		}
	}

	async function removePost() {
		if (!confirm(`確定刪除「${displayTitle}」？所有語系翻譯一併刪除，此操作不可復原。`)) return;
		try {
			const res = await fetch(`/admin/posts/${post.slug}?/delete`, { method: 'POST' });
			if (!res.ok) {
				message = `刪除失敗：${res.status}`;
				return;
			}
		} catch (err) {
			message = `刪除失敗：${err instanceof Error ? err.message : String(err)}`;
			return;
		}
		window.location.href = '/admin/posts';
	}

	function openCoverPicker() {
		coverOpen = true;
	}
</script>

<svelte:window onkeydown={onKeydown} />

<svelte:head>
	<title>編輯 {displayTitle} — Admin</title>
</svelte:head>

<a class="back" href="/admin/posts">← 回文章列表</a>

<div class="head">
	<h1 class="title">{displayTitle}</h1>
	<span class="slug">/blog/{post.slug}</span>
</div>

<div class="locale-tabs" role="tablist" aria-label="編輯語系">
	{#each locales as loc (loc)}
		<button
			type="button"
			class="locale-tab"
			class:active={loc === activeLocale}
			role="tab"
			aria-selected={loc === activeLocale}
			onclick={() => switchLocale(loc)}
		>
			{LOCALE_LABELS[loc]}
			<span class="state" title={covered.has(loc) ? '已有翻譯' : '尚未翻譯'}
				>{covered.has(loc) ? '●' : '○'}</span
			>
		</button>
	{/each}
</div>

<form class="editor-form" onsubmit={submitSave}>
	{#if externalUpdate}
		<div class="ext-bar" role="status">
			⚡ Agent 或別的地方更新了「{LOCALE_LABELS[activeLocale]}」內容——你的未存修改已保護
			<span class="grow"></span>
			<button type="button" class="mini primary" onclick={applyServerCopy}>載入最新版</button>
			<button type="button" class="mini" onclick={() => (externalUpdate = false)}>忽略</button>
		</div>
	{/if}
	<div class="grid" bind:this={contentEl}>
		<div class="col-main">
			<label class="field">
				<span class="label">標題</span>
				<input type="text" bind:value={title} placeholder="文章標題" />
			</label>

			<label class="field">
				<span class="label">摘要</span>
				<textarea bind:value={summary} rows="2" placeholder="顯示在文章列表的摘要"></textarea>
			</label>

			<div class="row">
				<label class="field">
					<span class="label">封面（poster）</span>
					<div class="cover-row">
						<input type="text" bind:value={cover} placeholder="留空則不顯示封面" />
						<button type="button" class="ghost" onclick={openCoverPicker}>從媒體庫選</button>
					</div>
					{#if cover}
						<img class="cover-preview" src={cover} alt="封面預覽" />
					{/if}
				</label>
			</div>

			<details class="seo-panel">
				<summary
					>🔍 搜尋引擎設定<span class="seo-locale">（{LOCALE_LABELS[activeLocale]}）</span></summary
				>
				<div class="seo-grid">
					<div class="seo-col">
						<label class="field">
							<span class="label">
								SEO Title
								<span class="seo-count" class:over={seoTitle.length > 60}>{seoTitle.length}/60</span
								>
							</span>
							<input type="text" bind:value={seoTitle} placeholder="留空＝使用文章標題" />
						</label>
						<div class="field">
							<span class="label">
								Meta Description
								<span class="seo-count" class:over={seoDescription.length > 160}>
									{seoDescription.length}/160
								</span>
							</span>
							<textarea rows="3" bind:value={seoDescription} placeholder="留空＝使用摘要"
							></textarea>
							<button
								type="button"
								class="ghost seo-suggest"
								onclick={suggestSeo}
								disabled={suggesting}
							>
								{suggesting ? '生成中…' : '✨ AI 生成'}
							</button>
						</div>
					</div>
					<div class="seo-col">
						<label class="field">
							<span class="label">Canonical URL</span>
							<input type="text" bind:value={canonicalUrl} placeholder="留空＝自動（本站網址）" />
						</label>
						<div class="checks">
							<label class="check">
								<input type="checkbox" bind:checked={robotsIndex} /> 允許搜尋引擎收錄
							</label>
							<label class="check">
								<input type="checkbox" bind:checked={robotsFollow} /> 允許跟隨連結
							</label>
						</div>
						<label class="field">
							<span class="label">搜尋結果摘要</span>
							<select bind:value={maxSnippet}>
								<option value="">自動</option>
								<option value="-1">不顯示摘要</option>
								<option value="160">最多 160 字元</option>
							</select>
						</label>
						<label class="field">
							<span class="label">
								搜尋結果大圖
								<span class="seo-tip" tabindex="0" aria-label="說明"
									>ⓘ<span class="seo-tip-pop"
										>控制 Google 在搜尋結果與 Discover 大圖卡片中使用你封面圖的尺寸上限。「允許」為
										Google 默認；影響的是 Google 自動挑圖行為，不是站內顯示。</span
									></span
								>
							</span>
							<select bind:value={maxImagePreview}>
								<option value="">允許（默認）</option>
								<option value="standard">僅縮圖</option>
								<option value="none">不顯示</option>
							</select>
						</label>
						<button type="button" class="ghost seo-save" onclick={saveSeoNow} disabled={seoSaving}>
							{seoSaving ? '儲存中…' : '儲存 SEO 設定（僅此語系）'}
						</button>
						{#if seoMessage}<p class="message">{seoMessage}</p>{/if}
					</div>
				</div>

				<div class="seo-social">
					<span class="seo-sub">社群分享（Facebook / X）——留空＝沿用上方與文章值</span>
					<div class="seo-grid">
						<div class="seo-col">
							<label class="field">
								<span class="label">OG Title</span>
								<input
									type="text"
									bind:value={ogTitleForm}
									placeholder="留空＝SEO Title／文章標題"
								/>
							</label>
							<div class="field">
								<span class="label">OG Description</span>
								<textarea
									rows="2"
									bind:value={ogDescForm}
									placeholder="留空＝Meta Description／摘要"></textarea>
							</div>
							<label class="field">
								<span class="label">X 卡片</span>
								<select bind:value={ogCard}>
									<option value="">自動（有圖＝大圖卡）</option>
									<option value="summary_large_image">大圖卡</option>
									<option value="summary">小圖卡</option>
								</select>
							</label>
						</div>
						<div class="seo-col">
							<div class="field">
								<span class="label">社群圖（OG Image）</span>
								<div class="cover-row">
									<input
										type="text"
										bind:value={ogImageForm}
										placeholder="留空＝封面圖／站級預設圖"
									/>
									<button type="button" class="ghost" onclick={() => (ogPicker = true)}
										>媒體庫</button
									>
								</div>
								{#if ogImageResolved}<img
										class="cover-preview"
										src={ogImageResolved}
										alt="og preview"
									/>{/if}
							</div>
							<label class="field">
								<span class="label">圖片替代文字（alt）</span>
								<input type="text" bind:value={ogAltForm} placeholder="無障礙描述（選填）" />
							</label>
						</div>
					</div>

					<div class="seo-grid seo-jld">
						<div class="seo-col">
							<label class="field">
								<span class="label">
									JSON-LD 型別
									<span class="seo-tip" tabindex="0" aria-label="說明"
										>ⓘ<span class="seo-tip-pop"
											>Article／BlogPosting／NewsArticle 告诉搜索引擎这篇文章属于哪种文体；不保证
											Rich Result 出现。</span
										></span
									>
								</span>
								<select bind:value={schemaType}>
									<option value="Article">Article（通用）</option>
									<option value="BlogPosting">BlogPosting（博客）</option>
									<option value="NewsArticle">NewsArticle（新闻）</option>
								</select>
							</label>
						</div>
						<div class="seo-col">
							<label class="field">
								<span class="label">作者覆寫（JSON-LD author）</span>
								<input type="text" bind:value={seoAuthor} placeholder="留空＝站主" />
							</label>
						</div>
					</div>
				</div>

				<div class="eng-tabs">
					<span class="serp-tabs-label">搜尋引擎視角</span>
					{#each [['google', 'Google'], ['fb', 'Facebook'], ['x', 'X'], ['head', 'HTML Head'], ['sd', 'JSON-LD']] as [id, label] (id)}
						<button
							type="button"
							class="serp-tab"
							class:active={engTab === id}
							onclick={() => {
								engTab = id as 'google' | 'fb' | 'x' | 'head' | 'sd';
								if ((id === 'head' || id === 'sd') && !headTags) void loadHeadTags();
							}}>{label}</button
						>
					{/each}
				</div>

				<div class="seo-audit">
					<div class="audit-head">
						<span class="seo-sub">SEO 技術檢查表（完成度是技術項統計，不是 Google 排名分數）</span>
						<span class="audit-meter">
							<span class="audit-bar"
								><span
									class="audit-fill"
									style="width: {seoScore.total
										? Math.round((seoScore.done / seoScore.total) * 100)
										: 0}%"
								></span></span
							>
							<span class="audit-num">{seoScore.done}/{seoScore.total}</span>
						</span>
					</div>
					<ul class="audit-list">
						{#each seoChecks as c (c.label)}
							<li class={c.level === 'ok' ? 'sd-ok' : c.level === 'warn' ? 'sd-warn' : 'sd-bad'}>
								{c.level === 'ok' ? '✓' : c.level === 'warn' ? '⚠' : '✕'}
								{c.label}
								<span class="audit-detail">{c.detail}</span>
							</li>
						{/each}
					</ul>
					<div class="gsc-check">
						<button type="button" class="ghost" onclick={checkGsc} disabled={gscBusy}>
							{gscBusy
								? '查詢中…'
								: gscState
									? '重新查 Google 實際狀態'
									: '查 Google 實際狀態（URL Inspection）'}
						</button>
						{#if gscState}
							<span
								class="gsc-badge"
								class:gsc-idx={gscState.indexingState.includes('INDEXED') &&
									!gscState.indexingState.includes('NOT')}
								class:gsc-no={!(
									gscState.indexingState.includes('INDEXED') &&
									!gscState.indexingState.includes('NOT')
								)}
							>
								{gscState.indexingState.includes('INDEXED') &&
								!gscState.indexingState.includes('NOT')
									? '✓ 已收錄'
									: '✕ 未收錄'}
								· {gscState.coverage}
								{#if gscState.lastCrawl}· 最後抓取 {gscState.lastCrawl.slice(0, 10)}{/if}
								{#if gscState.canonical && !gscState.canonical.endsWith('/blog/' + post.slug)}· ⚠
									Google 選了別的 canonical{/if}
							</span>
						{:else if gscMsg}
							<span class="gsc-badge gsc-no"
								>{gscMsg.includes('尚未')
									? '未接 Search Console（Settings 頁可配置）'
									: gscMsg}</span
							>
						{/if}
					</div>
					<ol class="flow">
						{#each seoFlow as st (st.label)}
							<li
								title={st.detail}
								class={st.status === 'ok'
									? 'flow-ok'
									: st.status === 'bad'
										? 'flow-bad'
										: 'flow-unk'}
							>
								<span class="flow-dot"
									>{st.status === 'ok' ? '✓' : st.status === 'bad' ? '✕' : '?'}</span
								>
								<span class="flow-label">{st.label}</span>
								<span class="audit-detail">{st.detail}</span>
							</li>
						{/each}
					</ol>
				</div>

				{#if engTab === 'google'}
					<div class="serp" class:serp-mobile={serpTab === 'mobile'}>
						<div class="serp-tabs">
							<button
								type="button"
								class="serp-tab"
								class:active={serpTab === 'desktop'}
								onclick={() => (serpTab = 'desktop')}>Desktop</button
							>
							<button
								type="button"
								class="serp-tab"
								class:active={serpTab === 'mobile'}
								onclick={() => (serpTab = 'mobile')}>Mobile</button
							>
						</div>
						{#if robotsIndex}
							<div class="serp-card">
								<div class="serp-crumb">
									<img src="/favicon.svg" alt="" class="serp-fav" />
									<span class="serp-site">{site.title}</span>
									<span class="serp-url">{serpHost} › blog › {post.slug}</span>
								</div>
								<div class="serp-title">{serpTitle}</div>
								<div class="serp-desc">
									{#if serpDate}<span class="serp-date">{serpDate}</span> —
									{/if}{serpDesc}
								</div>
							</div>
						{:else}
							<div class="serp-blocked">
								🚫 此文章已設 noindex — 不會出現在搜尋結果（仍可直接瀏覽）
							</div>
						{/if}
						<p class="serp-note">⚠️ 實際顯示可能由 Google 依查詢內容調整（這是提示，不是命令）</p>
					</div>
				{/if}

				{#if engTab === 'fb'}
					<div class="fb-card">
						{#if ogImageResolved}<img class="fb-img" src={ogImageResolved} alt="" />{:else}<div
								class="fb-img fb-noimg"
							>
								（無圖：僅文字卡）
							</div>{/if}
						<div class="fb-body">
							<span class="fb-domain">{serpHost}</span>
							<span class="fb-title">{ogTitleResolved}</span>
							<span class="fb-desc">{ogDescResolved}</span>
						</div>
					</div>
				{/if}

				{#if engTab === 'x'}
					{@const bigCard = ogCard !== 'summary' && !!ogImageResolved}
					<div class="x-card">
						<div class="x-hd">
							<img src="/favicon.svg" alt="" class="serp-fav" />
							<span class="x-site">{site.title}</span>
							{#if data.settings?.twitterSite}<span class="x-handle"
									>{data.settings.twitterSite}</span
								>{/if}
						</div>
						{#if bigCard}
							<div class="x-title">{ogTitleResolved}</div>
							<div class="x-desc">{ogDescResolved}</div>
							<img class="x-img" src={ogImageResolved} alt="" />
						{:else if ogImageResolved}
							<div class="x-sum">
								<img class="x-thumb" src={ogImageResolved} alt="" />
								<div class="x-sumtxt">
									<div class="x-title">{ogTitleResolved}</div>
									<div class="x-desc">{ogDescResolved}</div>
								</div>
							</div>
						{:else}
							<div class="x-title">{ogTitleResolved}</div>
							<div class="x-desc">{ogDescResolved}</div>
						{/if}
					</div>
				{/if}

				{#if engTab === 'head'}
					<div class="head-view">
						<div class="head-bar">
							<span>實際 SSR 直出（已儲存版本；草稿未儲存不會出現在這裡）</span>
							<button type="button" class="ghost" onclick={loadHeadTags} disabled={headLoading}
								>{headLoading ? '讀取中…' : '重新整理'}</button
							>
						</div>
						<pre class="head-pre">{headTags || '（點重新整理載入）'}</pre>
					</div>
				{/if}

				{#if engTab === 'sd'}
					<div class="sd-view">
						<p class="sd-note">
							已儲存頁面實際輸出的 JSON-LD（草稿需先儲存）；Rich Result 與否由 Google 決定，不保證。
						</p>
						<button type="button" class="ghost" onclick={loadHeadTags} disabled={headLoading}
							>{headLoading ? '讀取中…' : '重新整理'}</button
						>
						{#each ldNodes as node, i (i)}
							<div class="sd-node">
								<ul class="sd-checks">
									{#each node.checks as c (c.label)}
										<li class={c.ok ? 'sd-ok' : c.level === 'error' ? 'sd-bad' : 'sd-warn'}>
											{c.ok ? '✓' : c.level === 'error' ? '✕' : '⚠'}
											{c.label}
										</li>
									{/each}
								</ul>
								<pre class="head-pre">{node.text}</pre>
							</div>
						{/each}
					</div>
				{/if}
			</details>

			<div class="field">
				<span class="label">正文（Markdown 所見即所得；圖片可拖放／貼上，或從媒體庫插入）</span>
				{#if !covered.has(activeLocale)}
					<p class="new-translation-hint">
						此語系尚未翻譯 — 儲存後即建立「{LOCALE_LABELS[
							activeLocale
						]}」版本（未翻譯前前台顯示原文）。
					</p>
				{/if}
				{#key remountKey}
					<MarkdownEditor
						value={translation.body}
						onChange={(md) => (body = md)}
						customNames={data.customNames}
					/>
				{/key}
			</div>
		</div>

		<div class="col-side">
			<label class="field">
				<span class="label">發布日期</span>
				<input type="date" bind:value={date} />
			</label>

			<label class="field">
				<span class="label">分類</span>
				<select bind:value={contentType}>
					{#each data.categoryOptions as c (c.slug)}
						<option value={c.slug}>{c.name}</option>
					{/each}
				</select>
			</label>

			<!-- div 而非 label：label 会把點擊轉發給第一個 labelable 後代（chip 的 × 按鈕），造成誤刪標籤 -->
			<div class="field">
				<span class="label">標籤</span>
				<TagPicker tags={tagList} allTags={data.allTagNames} onChange={(t) => (tagList = t)} />
			</div>

			<div class="checks">
				<label class="check">
					<input type="checkbox" bind:checked={published} /> 發布
				</label>
				<label class="check">
					<input type="checkbox" bind:checked={pinned} /> 釘選（主頁橫向卡片）
				</label>
				<label class="check">
					<input type="checkbox" bind:checked={seriesOnly} /> 僅在系列中顯示（書專屬；從列表與搜尋退場）
				</label>
			</div>

			{#if !published && scheduledAt}
				<div class="field">
					<span class="label">🕒 排程發文</span>
					<p class="sched-note">
						{new Date(scheduledAt) > new Date()
							? `將於 ${scheduledAt.replace('T', ' ')} 自動發布（保留草稿狀態，到期自動上線）`
							: '⚠️ 時間已過——儲存後不會自動發布，請重設時間或勾選發布'}
					</p>
				</div>
			{/if}
			<label class="field">
				<span class="label">排程發布時間（選填；未勾發布時生效）</span>
				<input type="datetime-local" bind:value={scheduledAt} />
			</label>

			<div class="actions">
				<button type="submit" class="primary" disabled={saving}>
					{saving ? '儲存中…' : '儲存'}
				</button>
				<button type="button" class="danger" onclick={removePost}>刪除文章</button>
			</div>
			{#if message}<p class="message">{message}</p>{/if}

			<dl class="meta">
				<div>
					<dt>瀏覽數</dt>
					<dd>{post.views}</dd>
				</div>
				<div>
					<dt>評論數</dt>
					<dd>{data.commentCount}</dd>
				</div>
				<div>
					<dt>更新於</dt>
					<dd>{formatDate(post.updatedAt.toISOString().slice(0, 10))}</dd>
				</div>
			</dl>

			<div class="versions">
				<h3 class="versions-title">版本歷史（{versions.length}）</h3>
				{#if versions.length === 0}
					<p class="versions-empty">尚未有版本。儲存後每版自動記錄（最多保留 50 版）。</p>
				{:else}
					<ul class="version-list">
						{#each versions as v, i (v.id)}
							{@const diff = diffFromPrev(v, i, versions.length)}
							<li class="version-item">
								<div class="version-head">
									<time class="version-time">{timeLabel(v.createdAt)}</time>
									<span class="version-tag">{i === 0 ? '最新' : `v${versions.length - i}`}</span>
								</div>
								<div class="version-main">
									<span class="version-meta">
										<span class="version-title">{v.title || '(無標題)'}</span>
										<span class="version-nums"
											>{charCount(v)} 字{diff !== null
												? `／${diff >= 0 ? '+' : ''}${diff}`
												: ''}</span
										>
									</span>
									<span class="version-actions">
										<button type="button" class="ghost" onclick={() => (previewVersion = v)}
											>預覽</button
										>
										<button
											type="button"
											class="ghost danger-text"
											disabled={restoring}
											onclick={() => restoreVersion(v)}
										>
											還原
										</button>
										<button
											type="button"
											class="ghost danger-text"
											disabled={restoring}
											title="刪除這個版本"
											onclick={() => deleteVersion(v)}
										>
											刪除
										</button>
									</span>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
				{#if versionMsg}<p class="version-msg">{versionMsg}</p>{/if}
			</div>
		</div>
	</div>
</form>

{#if data.recentComments.length > 0}
	<h2 class="sub-title">最近評論（{data.recentComments.length}）</h2>
	<ul class="comments">
		{#each data.recentComments as c (c.id)}
			<li class="comment">
				<p class="comment-meta">
					<strong>{c.name}</strong>
					<span class="status" data-status={c.status}>{c.status}</span>
					<time>{formatDate(c.createdAt.toISOString().slice(0, 10))}</time>
				</p>
				<p class="comment-body">{c.content}</p>
			</li>
		{/each}
	</ul>
{/if}

{#if previewVersion}
	<div
		class="version-modal"
		role="dialog"
		aria-modal="true"
		onclick={(e) => {
			if (e.target === e.currentTarget) previewVersion = null;
		}}
	>
		<div class="version-modal-inner">
			<div class="version-modal-head">
				<div>
					<h3 class="version-modal-title">
						{previewVersion.title || '(無標題)'} — {timeLabel(previewVersion.createdAt)}
					</h3>
					<p class="version-modal-sub">版本預覽（與正式文章版面一致）</p>
				</div>
				<button type="button" class="ghost" onclick={() => (previewVersion = null)}>關閉</button>
			</div>
			<div class="version-modal-body">
				<!-- eslint-disable-next-line svelte/no-at-html-tags -- 版本內容由同一受控 markdown-it 管線產生 -->
				<div class="prose">{@html previewHtml}</div>
			</div>
		</div>
	</div>
{/if}

<MediaPicker
	open={ogPicker}
	onClose={() => (ogPicker = false)}
	onPick={({ url }) => {
		ogImageForm = url;
		ogPicker = false;
	}}
/>
<MediaPicker
	open={coverOpen}
	onClose={() => (coverOpen = false)}
	onPick={({ url }) => {
		cover = url;
		coverOpen = false;
	}}
/>

<style>
	.ext-bar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0 0 0.75rem;
		padding: 0.45rem 0.7rem;
		border: 1px solid color-mix(in srgb, var(--color-accent) 45%, transparent);
		border-radius: 0.55rem;
		background: color-mix(in srgb, var(--color-accent) 8%, transparent);
		font-size: 0.78rem;
	}
	.ext-bar .grow {
		flex: 1;
	}

	.back {
		display: inline-block;
		font-size: 0.875rem;
		color: var(--color-ink-muted);
		text-decoration: none;
		margin-bottom: 1.25rem;
	}

	.back:hover {
		color: var(--color-ink);
	}

	.head {
		display: flex;
		align-items: baseline;
		gap: 1rem;
		flex-wrap: wrap;
		margin-bottom: 1.5rem;
	}

	.title {
		font-size: 1.75rem;
		font-weight: 700;
	}

	.locale-tabs {
		display: flex;
		gap: 0.375rem;
		flex-wrap: wrap;
		margin: -0.5rem 0 1.5rem;
	}

	.locale-tab {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.75rem;
		border: 1px solid var(--color-line);
		border-radius: 0.5rem 0.5rem 0 0;
		appearance: none;
		background: none;
		color: var(--color-ink-muted);
		font: inherit;
		font-size: 0.8125rem;
		text-decoration: none;
		cursor: pointer;
	}

	.locale-tab:hover {
		color: var(--color-ink);
	}

	.locale-tab.active {
		color: var(--color-accent);
		border-color: var(--color-accent);
		border-bottom-color: transparent;
	}

	.locale-tab .state {
		font-size: 0.625rem;
	}

	.new-translation-hint {
		margin: 0 0 0.75rem;
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
	}

	.slug {
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
	}

	.editor-form {
		display: flex;
		flex-direction: column;
	}

	.grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 18rem;
		gap: 1.5rem;
		align-items: start;
	}

	.col-main {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		min-width: 0;
	}

	.col-side {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		border: 1px solid var(--color-line);
		border-radius: 0.875rem;
		padding: 1.25rem;
		background: var(--color-bg-elevated);
		position: sticky;
		top: 1rem;
		min-width: 0;
	}

	.sched-note {
		margin: 0;
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
		line-height: 1.6;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.label {
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
	}

	input[type='text'],
	input[type='date'],
	input[type='datetime-local'],
	textarea {
		background: var(--color-bg);
		border: 1px solid var(--color-line);
		border-radius: 0.625rem;
		padding: 0.625rem 0.875rem;
		color: var(--color-ink);
		font: inherit;
		font-size: 0.9375rem;
		width: 100%;
		box-sizing: border-box;
	}

	input:focus,
	textarea:focus {
		outline: 2px solid var(--color-accent);
		outline-offset: 1px;
		border-color: transparent;
	}

	.row {
		display: flex;
		gap: 1rem;
	}

	.cover-row {
		display: flex;
		gap: 0.5rem;
	}

	.cover-row input {
		flex: 1;
	}

	.cover-preview {
		margin-top: 0.5rem;
		max-height: 8rem;
		border-radius: 0.625rem;
		border: 1px solid var(--color-line);
	}

	.ghost {
		align-self: flex-start;
		appearance: none;
		border: 1px solid var(--color-line);
		background: none;
		color: var(--color-ink);
		padding: 0.5rem 0.875rem;
		border-radius: 0.625rem;
		font-size: 0.875rem;
		cursor: pointer;
	}

	.ghost:hover {
		border-color: var(--color-accent);
	}

	.checks {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.check {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.9375rem;
		cursor: pointer;
	}

	.check input {
		accent-color: var(--color-accent);
		width: 1rem;
		height: 1rem;
	}

	.seo-panel {
		border: 1px solid var(--color-line);
		border-radius: 0.5rem;
		padding: 0.625rem 0.75rem;
		background: var(--color-bg-elevated);
	}
	.seo-panel > summary {
		cursor: pointer;
		font-weight: 600;
		font-size: 0.8125rem;
		color: var(--color-ink);
		list-style: none;
	}
	.seo-panel > summary::-webkit-details-marker {
		display: none;
	}
	.seo-locale {
		font-weight: 400;
		color: var(--color-ink-muted);
		font-size: 0.75rem;
	}
	.seo-panel[open] > summary {
		margin-bottom: 0.75rem;
	}
	.seo-count {
		float: right;
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		color: var(--color-ink-muted);
	}
	.seo-count.over {
		color: #c0392b;
	}
	.seo-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0 1.25rem;
	}
	.seo-suggest,
	.seo-save {
		margin-top: 0.5rem;
	}
	.seo-tip {
		position: relative;
		margin-left: 0.25rem;
		color: var(--color-ink-muted);
		cursor: help;
		font-size: 0.75rem;
	}
	.seo-tip-pop {
		display: none;
		position: absolute;
		bottom: 1.25rem;
		left: 50%;
		transform: translateX(-50%);
		width: 16rem;
		padding: 0.5rem 0.625rem;
		border: 1px solid var(--color-line);
		border-radius: 0.5rem;
		background: var(--color-bg-elevated);
		color: var(--color-ink);
		font-size: 0.75rem;
		font-weight: 400;
		line-height: 1.5;
		z-index: 30;
		box-shadow: 0 4px 16px rgb(0 0 0 / 0.12);
	}
	.seo-tip:hover .seo-tip-pop,
	.seo-tip:focus .seo-tip-pop {
		display: block;
	}
	/* Google SERP 模擬卡：固定白底（忠於 Google 外觀，不隨 admin 主題） */
	.seo-social {
		margin-top: 1.25rem;
		padding-top: 1rem;
		border-top: 1px dashed var(--color-line);
	}
	.seo-sub {
		display: block;
		font-size: 0.75rem;
		color: var(--color-ink-muted);
		margin-bottom: 0.75rem;
	}
	.eng-tabs {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 1.25rem;
	}
	.fb-card,
	.x-card {
		background: #fff;
		border: 1px solid #dadce0;
		border-radius: 0.75rem;
		max-width: 26rem;
		overflow: hidden;
	}
	.fb-img {
		width: 100%;
		aspect-ratio: 1.91 / 1;
		object-fit: cover;
		display: block;
		background: #f0f2f5;
	}
	.fb-noimg,
	.x-noimg {
		display: flex;
		align-items: center;
		justify-content: center;
		color: #8a8d91;
		font-size: 0.75rem;
		background: #f0f2f5;
	}
	.fb-body {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		padding: 0.5rem 0.75rem 0.75rem;
		background: #f0f2f5;
	}
	.fb-domain {
		font-size: 0.75rem;
		color: #65676b;
		text-transform: uppercase;
	}
	.fb-title {
		font-size: 0.9375rem;
		font-weight: 600;
		color: #050505;
	}
	.fb-desc {
		font-size: 0.8125rem;
		color: #65676b;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.x-card {
		max-width: 28rem;
		border-color: #2f3336;
		background: #15202b00;
		border: 1px solid var(--color-line);
		color: var(--color-ink);
		padding: 0.75rem;
	}
	.x-hd {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.8125rem;
		margin-bottom: 0.375rem;
	}
	.x-site {
		font-weight: 600;
	}
	.x-handle {
		color: var(--color-ink-muted);
	}
	.x-title {
		font-size: 0.9375rem;
		font-weight: 600;
	}
	.x-desc {
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.x-img {
		margin-top: 0.5rem;
		width: 100%;
		aspect-ratio: 16 / 9;
		object-fit: cover;
		border-radius: 0.5rem;
		border: 1px solid var(--color-line);
	}
	.x-sum {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.25rem;
	}
	.x-thumb {
		width: 7rem;
		height: 4.7rem;
		object-fit: cover;
		border-radius: 0.5rem;
		border: 1px solid var(--color-line);
		flex: none;
	}
	.head-view {
		margin-top: 0.25rem;
	}
	.sd-view {
		margin-top: 0.25rem;
	}
	.seo-audit {
		margin-top: 1rem;
		padding-top: 0.875rem;
		border-top: 1px dashed var(--color-line);
	}
	.audit-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}
	.audit-meter {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.audit-bar {
		width: 8rem;
		height: 0.375rem;
		border-radius: 999px;
		background: var(--color-line);
		overflow: hidden;
	}
	.audit-fill {
		display: block;
		height: 100%;
		background: var(--color-strong);
		transition: width 0.25s ease;
	}
	.audit-num {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		color: var(--color-ink-muted);
	}
	.audit-list {
		list-style: none;
		margin: 0.625rem 0 0;
		padding: 0;
		columns: 2;
		font-size: 0.75rem;
		line-height: 1.9;
	}
	.audit-detail {
		color: var(--color-ink-muted);
		font-size: 0.6875rem;
		margin-left: 0.375rem;
	}
	.flow {
		list-style: none;
		margin: 0.875rem 0 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem 0.25rem;
		align-items: center;
		font-size: 0.6875rem;
	}
	.gsc-check {
		margin-top: 0.75rem;
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}
	.gsc-badge {
		font-size: 0.75rem;
		border: 1px solid var(--color-line);
		border-radius: 999px;
		padding: 0.1875rem 0.625rem;
	}
	.gsc-idx {
		color: #1a7f37;
		border-color: #1a7f3744;
	}
	.gsc-no {
		color: #9a6700;
		border-color: #9a670044;
	}
	.flow li {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		border: 1px solid var(--color-line);
		border-radius: 999px;
		padding: 0.125rem 0.5rem;
	}
	.flow li + li {
		position: relative;
		margin-left: 0.5rem;
	}
	.flow-ok {
		color: #1a7f37;
	}
	.flow-bad {
		color: #c0392b;
	}
	.flow-unk {
		color: var(--color-ink-muted);
	}
	.flow-dot {
		font-weight: 700;
	}
	.flow-label {
		font-weight: 600;
	}
	.flow .audit-detail {
		display: none;
	}
	.flow li:hover .audit-detail {
		display: inline;
	}
	.sd-node {
		margin-bottom: 1rem;
	}
	.sd-note {
		font-size: 0.75rem;
		color: var(--color-ink-muted);
		margin: 0 0 0.5rem;
	}
	.sd-checks {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 1rem;
		list-style: none;
		font-size: 0.6875rem;
		margin: 0 0 0.375rem;
		padding: 0;
	}
	.sd-ok {
		color: #1a7f37;
	}
	.sd-warn {
		color: #9a6700;
	}
	.sd-bad {
		color: #c0392b;
	}
	.head-bar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		font-size: 0.75rem;
		color: var(--color-ink-muted);
		margin-bottom: 0.5rem;
	}
	.head-pre {
		max-height: 22rem;
		overflow: auto;
		background: var(--color-bg-elevated);
		border: 1px solid var(--color-line);
		border-radius: 0.5rem;
		padding: 0.625rem 0.75rem;
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		line-height: 1.7;
		white-space: pre-wrap;
		word-break: break-all;
	}
	.serp {
		margin-top: 1rem;
		border-top: 1px solid var(--color-line);
		padding-top: 0.875rem;
	}
	.serp-tabs {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.625rem;
	}
	.serp-tabs-label {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-ink);
		margin-right: auto;
	}
	.serp-tab {
		border: 1px solid var(--color-line);
		border-radius: 999px;
		background: transparent;
		color: var(--color-ink-muted);
		font-size: 0.6875rem;
		padding: 0.1875rem 0.625rem;
		cursor: pointer;
	}
	.serp-tab.active {
		border-color: var(--color-strong);
		color: var(--color-ink);
		background: var(--color-bg-elevated);
	}
	.serp-card {
		background: #fff;
		border: 1px solid #dadce0;
		border-radius: 0.75rem;
		padding: 0.875rem 1rem;
		max-width: 38rem;
		transition: max-width 0.2s ease;
	}
	.serp-mobile .serp-card {
		max-width: 21.5rem;
	}
	.serp-crumb {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.75rem;
		color: #202124;
	}
	.serp-fav {
		width: 1rem;
		height: 1rem;
		border-radius: 999px;
		border: 1px solid #dadce0;
		background: #f1f3f4;
	}
	.serp-site {
		font-weight: 500;
	}
	.serp-url {
		color: #5f6368;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.serp-title {
		margin-top: 0.25rem;
		font-size: 1.125rem;
		line-height: 1.3;
		color: #1a0dab;
		display: -webkit-box;
		-webkit-line-clamp: 1;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.serp-mobile .serp-title {
		font-size: 1rem;
		-webkit-line-clamp: 2;
	}
	.serp-desc {
		margin-top: 0.25rem;
		font-size: 0.8125rem;
		line-height: 1.58;
		color: #4d5156;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.serp-date {
		color: #70757a;
	}
	.serp-blocked {
		max-width: 38rem;
		border: 1px dashed #b06a00;
		border-radius: 0.75rem;
		background: #fff8ec;
		color: #6b4400;
		font-size: 0.8125rem;
		padding: 1rem;
	}
	.serp-note {
		margin-top: 0.5rem;
		font-size: 0.6875rem;
		color: var(--color-ink-muted);
	}
	@media (max-width: 52rem) {
		.seo-grid {
			grid-template-columns: 1fr;
		}
	}

	.actions {
		display: flex;
		gap: 0.75rem;
		margin-top: 0.5rem;
		flex-wrap: wrap;
	}

	.primary {
		appearance: none;
		border: 1px solid var(--color-accent);
		border-radius: 0.625rem;
		background: var(--color-accent);
		color: var(--color-accent-ink);
		font: inherit;
		font-size: 0.9375rem;
		padding: 0.625rem 1.5rem;
		cursor: pointer;
		font-weight: 600;
	}

	.primary:disabled {
		opacity: 0.6;
	}

	.danger {
		appearance: none;
		border: 1px solid #ef4444;
		border-radius: 0.625rem;
		background: none;
		color: #ef4444;
		font: inherit;
		font-size: 0.9375rem;
		padding: 0.625rem 1rem;
		cursor: pointer;
	}

	.danger:hover {
		background: rgb(239 68 68 / 0.1);
	}

	.message {
		font-size: 0.875rem;
		color: #22c55e;
		margin: 0;
	}

	.meta {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin: 1rem 0 0;
		font-size: 0.8125rem;
	}

	.meta div {
		display: flex;
		justify-content: space-between;
	}

	.meta dt {
		color: var(--color-ink-muted);
	}

	.sub-title {
		font-size: 1.125rem;
		font-weight: 700;
		margin: 2.5rem 0 1rem;
	}

	.comments {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.comment {
		border: 1px solid var(--color-line);
		border-radius: 0.75rem;
		padding: 0.75rem 1rem;
	}

	.comment-meta {
		display: flex;
		gap: 0.75rem;
		align-items: center;
		font-size: 0.8125rem;
		margin-bottom: 0.375rem;
	}

	.status {
		padding: 0.0625rem 0.5rem;
		border-radius: 9999px;
		font-size: 0.75rem;
		border: 1px solid var(--color-line);
		color: var(--color-ink-muted);
	}

	.status[data-status='approved'] {
		border-color: #22c55e;
		color: #22c55e;
	}

	.comment-body {
		font-size: 0.875rem;
		color: var(--color-ink);
		white-space: pre-wrap;
		margin: 0;
	}

	/* --- 版本歷史 --- */
	.versions {
		margin-top: 1rem;
		border-top: 1px solid var(--color-line);
		padding-top: 1rem;
	}

	.versions-title {
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--color-ink);
		margin: 0 0 0.625rem;
	}

	.versions-empty {
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
		margin: 0;
		line-height: 1.6;
	}

	.version-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		max-height: 18rem;
		overflow-y: auto;
	}

	.version-item {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		font-size: 0.8125rem;
		border: 1px solid var(--color-line);
		border-radius: 0.625rem;
		padding: 0.5rem 0.625rem;
		min-width: 0;
	}

	.version-head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.version-main {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.version-meta {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		min-width: 0;
		flex: 1;
	}

	.version-title {
		font-weight: 500;
		color: var(--color-ink);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.version-nums {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		color: var(--color-ink-muted);
		white-space: nowrap;
	}

	.version-time {
		color: var(--color-ink-muted);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.version-tag {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		color: var(--color-accent-ink);
		background: var(--color-accent);
		border-radius: 9999px;
		padding: 0.0625rem 0.4375rem;
	}

	.version-actions {
		display: flex;
		gap: 0.375rem;
	}

	.version-actions .ghost {
		padding: 0.25rem 0.5rem;
		font-size: 0.75rem;
		border-radius: 0.5rem;
	}

	.danger-text {
		color: #ef4444;
	}

	.version-msg {
		font-size: 0.8125rem;
		color: #22c55e;
		margin: 0.5rem 0 0;
	}

	/* 版本預覽 modal：全螢幕頁面式（與正式文章版面一致） */
	.version-modal {
		position: fixed;
		inset: 0;
		z-index: 100;
		background: rgb(0 0 0 / 0.6);
		display: flex;
		animation: version-modal-in 0.2s ease;
	}

	@keyframes version-modal-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	.version-modal-inner {
		background: var(--color-bg);
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.version-modal-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.875rem 1.25rem;
		border-bottom: 1px solid var(--color-line);
		background: var(--color-bg-elevated);
	}

	.version-modal-title {
		font-size: 1rem;
		font-weight: 700;
		margin: 0;
	}

	.version-modal-sub {
		font-size: 0.75rem;
		color: var(--color-ink-muted);
		margin: 0.125rem 0 0;
	}

	.version-modal-body {
		flex: 1;
		overflow-y: auto;
		padding: clamp(1.5rem, 4vw, 3rem) clamp(1rem, 5vw, 4rem) 4rem;
		background: var(--color-bg);
	}

	/* 文章主欄與前台一致（65ch），不撐滿螢幕 */
	.version-modal-body :global(.prose) {
		max-width: 65ch;
		margin: 0 auto;
	}

	@media (max-width: 1023px) {
		.grid {
			grid-template-columns: 1fr;
		}

		.col-side {
			position: static;
		}
	}
</style>
