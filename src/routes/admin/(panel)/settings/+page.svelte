<script lang="ts">
	import { enhance } from '$app/forms';
	import MediaPicker from '$lib/components/MediaPicker.svelte';
	import { SITE_DEFAULTS } from '$lib/site';
	import { SLOT_NAMES, SLOT_LABELS } from '$lib/slots/catalog';

	const STATIC_TITLE = SITE_DEFAULTS.title;
	const STATIC_AUTHOR = SITE_DEFAULTS.authorName;
	const STATIC_DESC = SITE_DEFAULTS.description;
	const STATIC_URL = SITE_DEFAULTS.url;
	import AiSettings from './AiSettings.svelte';
	import SiteMdSettings from './SiteMdSettings.svelte';
	import McpSettings from './McpSettings.svelte';
	import ThemeSettings from './ThemeSettings.svelte';
	import type { PageData } from './$types';

	let { data, form }: { data: PageData; form: { message?: string } | null } = $props();

	let logo = $state(data.settings?.logo ?? '');
	let heroBg = $state(data.settings?.heroBg ?? '');
	let defaultOgImage = $state(data.settings?.defaultOgImage ?? '');
	let name = $state(data.settings?.name ?? '');
	let shortName = $state(data.settings?.shortName ?? '');
	let siteDescription = $state(data.settings?.siteDescription ?? '');
	/* * Phase 77: social link overrides (clearing a url hides that item on the front end) */
	type SocialDisplay = 'icon' | 'icon+label' | 'label' | 'hidden';
	const SOCIAL_IDS = ['github', 'youtube', 'facebook', 'x'] as const;
	const initialSocials = (() => {
		try {
			return JSON.parse(data.settings?.socialsConfig || '{}') as Record<
				string,
				{ url?: string; display?: SocialDisplay }
			>;
		} catch {
			return {} as Record<string, { url?: string; display?: SocialDisplay }>;
		}
	})();
	let socials = $state<Record<string, { url: string; display: SocialDisplay }>>(
		Object.fromEntries(
			SOCIAL_IDS.map((id) => [
				id,
				{
					url: initialSocials[id]?.url ?? '',
					display: (initialSocials[id]?.display ?? 'icon+label') as SocialDisplay
				}
			])
		)
	);
	let authorName = $state(data.settings?.authorName ?? '');
	let authorHandle = $state(data.settings?.authorHandle ?? '');
	let siteUrl = $state(data.settings?.siteUrl ?? '');
	let footerText = $state(data.settings?.footerText ?? '');
	let copyrightText = $state(data.settings?.copyright ?? '');
	let timezone = $state(data.settings?.timezone ?? '');
	let twitterSite = $state(data.settings?.twitterSite ?? '');
	// locale keys derive from server settings (config/locales.json additions/removals follow automatically)
	// locale keys derive from server settings (config/locales.json additions/removals follow automatically)
	const localeKeys = Object.keys(data.settings?.slogans ?? { 'zh-tw': '' });
	const surf = $derived((data.settings?.supportSurfaces ?? '').split(','));
	let currency = $state(data.settings?.commerceCurrency ?? '');
	let supportIntro = $state(data.settings?.supportIntro ?? '');

	/* P83a slot assignments (v1 built-ins: support-zone only; DB components arrive in P83c) */
	const SLOT_BUILTINS = [{ id: 'support-zone', label: '贊助卡 ☕' }];
	let slotOn = $state<Record<string, boolean>>(
		Object.fromEntries(
			SLOT_NAMES.flatMap((s) =>
				SLOT_BUILTINS.map((b) => [
					`${s}::${b.id}`,
					(data.settings?.slotAssignments?.[s] ?? []).includes(b.id)
				])
			)
		)
	);
	const slotsJson = $derived(
		JSON.stringify(
			Object.fromEntries(
				SLOT_NAMES.map((s) => [
					s,
					SLOT_BUILTINS.filter((b) => slotOn[`${s}::${b.id}`]).map((b) => b.id)
				]).filter(([, ids]) => (ids as string[]).length > 0)
			)
		)
	);
	const bagInit = (bag: Record<string, string> | undefined) =>
		Object.fromEntries(localeKeys.map((l) => [l, bag?.[l] ?? '']));
	let slogans = $state<Record<string, string>>(bagInit(data.settings?.slogans));
	let descriptions = $state<Record<string, string>>(bagInit(data.settings?.descriptions));
	let footers = $state<Record<string, string>>(bagInit(data.settings?.footers));
	let copyrights = $state<Record<string, string>>(bagInit(data.settings?.copyrights));
	let aboutBodies = $state<Record<string, string>>(bagInit(data.settings?.aboutBodies));
	let worksJson = $state(
		Object.fromEntries(
			localeKeys.map((l) => [
				l,
				(data.settings?.worksByLocale?.[l] ?? []).length
					? JSON.stringify(data.settings?.worksByLocale?.[l])
					: ''
			])
		)
	) as Record<string, string>;
	let aboutBody = $state(data.settings?.aboutBody ?? '');
	type WorkDraft = {
		title: string;
		href: string;
		description: string;
		badge: string;
		date: string;
		cover: string;
	};
	let works = $state<WorkDraft[]>(
		(data.settings?.works ?? []).map((w) => ({
			title: w.title,
			href: w.href,
			description: w.description ?? '',
			badge: w.badge ?? '',
			date: w.date ?? '',
			cover: w.cover ?? ''
		}))
	);
	function addWork() {
		works = [...works, { title: '', href: '', description: '', badge: '', date: '', cover: '' }];
	}
	function dropWork(i: number) {
		works = works.filter((_, k) => k !== i);
	}
	function moveWork(i: number, d: -1 | 1) {
		const j = i + d;
		if (j < 0 || j >= works.length) return;
		const next = [...works];
		[next[i], next[j]] = [next[j], next[i]];
		works = next;
	}
	function pickPost(i: number, slug: string) {
		const post = (data.posts ?? []).find((x) => x.slug === slug);
		if (!post) return;
		works = works.map((w, k) =>
			k === i
				? {
						...w,
						title: post.title,
						href: `/blog/${post.slug}`,
						description: post.summary,
						date: post.date,
						cover: post.cover ?? w.cover
					}
				: w
		);
	}
	let worksFill = $state(data.settings?.worksBackfill ?? false);
	let logoPicker = $state(false);
	let ogPicker = $state(false);

	/* * Search Console (Phase 65b) */
	/* * comment moderation console (Phase 74) */
	type ModStrength = 'off' | 'lenient' | 'normal' | 'strict' | 'custom';
	let modStrength = $state<ModStrength>('normal');
	let modCustom = $state({
		approvedBelow: 30,
		spamByRule: 90,
		moderationSafeBelow: 70,
		bannedWordScore: 45
	});
	let modBannedText = $state('');
	const BANNED_PLACEHOLDER = '例如：\n賭博\n加LINE\n限時優惠';
	let modMsg = $state('');
	let modBusy = $state(false);
	const MOD_STRENGTHS: { id: ModStrength; label: string; desc: string }[] = [
		{
			id: 'off',
			label: '關閉',
			desc: '全部直接公開（禁詞名單仍生效）。僅建議測試或完全信任的站使用'
		},
		{ id: 'lenient', label: '寬鬆', desc: '放行線 50 分——多數含連結的留言也自動通過，少量進人工' },
		{
			id: 'normal',
			label: '標準',
			desc: '放行線 30 分（現行預設）：低風險秒過、中風險 AI 輔助、高風險攔截'
		},
		{
			id: 'strict',
			label: '嚴格',
			desc: '放行線 10 分、spam 線 70——多數留言進人工队列，適合高流量或被盯上的站'
		},
		{ id: 'custom', label: '自訂', desc: '手動調三條閾值與禁詞分數' }
	];
	const modDesc = $derived(MOD_STRENGTHS.find((x) => x.id === modStrength)?.desc ?? '');
	$effect(() => {
		void fetch('/api/admin/moderation')
			.then((r) => r.json())
			.then((j) => {
				modStrength = j.strength ?? 'normal';
				if (j.custom) modCustom = { ...modCustom, ...j.custom };
				modBannedText = (j.bannedWords ?? []).join('\n');
			})
			.catch(() => {});
	});
	async function saveModeration(): Promise<void> {
		modBusy = true;
		modMsg = '';
		try {
			const res = await fetch('/api/admin/moderation', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					strength: modStrength,
					custom: modCustom,
					bannedWords: modBannedText.split('\n')
				})
			});
			const j = await res.json();
			if (!res.ok) modMsg = `❌ ${j.error ?? '保存失敗'}`;
			else modMsg = `✅ 已儲存（強度：${MOD_STRENGTHS.find((x) => x.id === modStrength)?.label}）`;
		} catch (e) {
			modMsg = `❌ ${String(e).slice(0, 120)}`;
		} finally {
			modBusy = false;
		}
	}

	/* * Email (Phase 67a) */
	let emProvider = $state('resend');
	let emApiKey = $state('');
	let emFrom = $state('');
	let emFromName = $state('');
	let emDomain = $state('');
	let emRegion = $state('');
	let emSesSecret = $state('');
	let emHasKey = $state(false);
	let emKeyTail = $state('');
	let emDisabled = $state(false);
	let emAdminNotify = $state('');
	let emMsg = $state('');
	let emBusy = $state(false);
	const EM_PROVIDERS: { id: string; label: string; note: string; paid?: boolean }[] = [
		{ id: 'resend', label: 'Resend', note: 'API Key；免費 3,000 封/月（100/天）——推薦' },
		{ id: 'smtp2go', label: 'SMTP2GO', note: 'API Key；免費 1,000 封/月' },
		{ id: 'postmark', label: 'Postmark', note: 'Server Token；免費 100 封/月試用' },
		{ id: 'mailgun', label: 'Mailgun', note: 'API Key＋Domain' },
		{ id: 'ses', label: 'Amazon SES', note: 'Access Key＋Secret＋Region；按量計費' },
		{ id: 'cloudflare', label: 'Cloudflare Email', note: '免憑證；需 Workers Paid', paid: true }
	];
	const emNote = $derived(EM_PROVIDERS.find((x) => x.id === emProvider)?.note ?? '');
	$effect(() => {
		void fetch('/api/admin/email/config')
			.then((r) => r.json())
			.then((j) => {
				emProvider = j.provider ?? 'resend';
				emFrom = j.from ?? '';
				emFromName = j.fromName ?? '';
				emDomain = j.domain ?? '';
				emRegion = j.region ?? '';
				emHasKey = !!j.hasKey;
				emKeyTail = j.keyTail ?? '';
				emDisabled = !!j.disabled;
				emAdminNotify = j.adminNotify ?? '';
			})
			.catch(() => {});
	});
	async function saveEmail(extra?: Record<string, string | boolean>): Promise<boolean> {
		emBusy = true;
		emMsg = '';
		try {
			const res = await fetch('/api/admin/email/config', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					provider: emProvider,
					from: emFrom,
					fromName: emFromName,
					domain: emDomain,
					region: emRegion,
					adminNotify: emAdminNotify,
					...(emApiKey ? { apiKey: emApiKey } : {}),
					...(emSesSecret ? { sesSecret: emSesSecret } : {}),
					...extra
				})
			});
			const j = await res.json();
			if (!res.ok) {
				emMsg = `❌ ${j.error ?? '保存失敗'}`;
				return false;
			}
			emHasKey = !!j.hasKey;
			emKeyTail = j.keyTail ?? '';
			emApiKey = '';
			emSesSecret = '';
			return true;
		} catch (e) {
			emMsg = `❌ ${String(e).slice(0, 120)}`;
			return false;
		} finally {
			emBusy = false;
		}
	}
	async function testEmailConnection(): Promise<void> {
		if (!(await saveEmail())) return;
		emMsg = '測試中…';
		const r = await fetch('/api/admin/email/test', { method: 'POST' }).then((x) => x.json());
		emMsg = r.ok ? '✅ 連線正常' : `❌ ${r.error}`;
	}
	async function sendEmailTest(): Promise<void> {
		const to = prompt('發送測試信到哪個地址？', emFrom);
		if (!to) return;
		if (!(await saveEmail())) return;
		emMsg = '寄送中…';
		const r = await fetch('/api/admin/email/send', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ to })
		}).then((x) => x.json());
		emMsg = r.ok ? `✅ 已寄往 ${to}（查看發送紀錄）` : `❌ ${r.error}`;
	}

	let gscProperty = $state('');
	let gscSaJson = $state('');
	let gscConfigured = $state(false);
	let gscEmail = $state('');
	let gscMsg = $state('');
	let gscBusy = $state(false);
	$effect(() => {
		void fetch('/api/admin/gsc/config')
			.then((r) => r.json())
			.then((j) => {
				gscProperty = j.property ?? '';
				gscConfigured = !!j.configured;
				gscEmail = j.clientEmail ?? '';
			})
			.catch(() => {});
	});
	async function saveGsc(): Promise<void> {
		gscBusy = true;
		gscMsg = '';
		try {
			const res = await fetch('/api/admin/gsc/config', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ property: gscProperty, saJson: gscSaJson || undefined })
			});
			const j = await res.json();
			if (j.error) gscMsg = `✕ ${j.error}`;
			else {
				gscConfigured = !!j.configured;
				gscEmail = j.clientEmail ?? '';
				gscSaJson = '';
				gscMsg = '✓ 已儲存（金鑰已加密）';
			}
		} catch (e) {
			gscMsg = `✕ ${e instanceof Error ? e.message : String(e)}`;
		} finally {
			gscBusy = false;
		}
	}
	async function testGscConn(): Promise<void> {
		gscBusy = true;
		gscMsg = '';
		try {
			const res = await fetch('/api/admin/gsc/inspect', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ test: true })
			});
			const j = await res.json();
			gscMsg = j.ok
				? `✓ 連線成功（可見 ${j.data.sites} 個資源${j.data.matched ? '，含本 property' : '；⚠ 找不到本 property——確認已加服務帳戶為擁有者'}）`
				: `✕ ${j.error}`;
		} catch (e) {
			gscMsg = `✕ ${e instanceof Error ? e.message : String(e)}`;
		} finally {
			gscBusy = false;
		}
	}
	let heroPicker = $state(false);
	let saving = $state(false);
	let message = $state('');

	async function submitSave(e: SubmitEvent) {
		e.preventDefault();
		saving = true;
		message = '';
		const fd = new FormData();
		fd.set('logo', logo);
		fd.set('heroBg', heroBg);
		fd.set('defaultOgImage', defaultOgImage);
		fd.set('name', name);
		fd.set('shortName', shortName);
		fd.set('siteDescription', siteDescription);
		fd.set('authorName', authorName);
		fd.set('authorHandle', authorHandle);
		fd.set('siteUrl', siteUrl);
		fd.set('footerText', footerText);
		fd.set('copyrightText', copyrightText);
		fd.set('timezone', timezone);
		for (const id of SOCIAL_IDS) {
			fd.set(`social_${id}_url`, socials[id].url);
			fd.set(`social_${id}_display`, socials[id].display);
		}
		fd.set('twitterSite', twitterSite);
		for (const [loc, val] of Object.entries(slogans)) fd.set(`slogan_${loc}`, val);
		for (const [loc, val] of Object.entries(descriptions)) fd.set(`desc_${loc}`, val);
		for (const [loc, val] of Object.entries(footers)) fd.set(`foot_${loc}`, val);
		for (const [loc, val] of Object.entries(copyrights)) fd.set(`copy_${loc}`, val);
		for (const [loc, val] of Object.entries(aboutBodies)) fd.set(`about_${loc}`, val);
		for (const [loc, val] of Object.entries(worksJson)) fd.set(`works_${loc}`, val);
		fd.set('about', aboutBody);
		fd.set('works', JSON.stringify(works));
		fd.set('worksFill', worksFill ? 'on' : '');
		try {
			const res = await fetch('/admin/settings?/save', { method: 'POST', body: fd });
			const j = (await res.json().catch(() => null)) as { type?: string; message?: string } | null;
			message =
				!res.ok || j?.type === 'error'
					? `儲存失敗：${j?.message ?? res.status}`
					: '✓ 已儲存（全站立即生效）';
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head>
	<title>設定 — Admin</title>
</svelte:head>

<h1 class="title">全站設定</h1>
{#if form?.message}<p class="form-msg">{form.message}</p>{/if}
<p class="note">改完即時生效（SSR 直接讀 D1），不需重新部署。留空 = 使用預設值。</p>

<form class="form" onsubmit={submitSave}>
	<fieldset class="slogans">
		<legend class="label">網站識別（留空＝使用部署預設；改完儲存全站即時生效）</legend>
		<div class="identity-grid">
			<label class="field">
				<span class="label">站名</span>
				<input type="text" bind:value={name} placeholder={STATIC_TITLE} />
			</label>
			<label class="field">
				<span class="label">短名（導航／Logo 文字；留空＝站名）</span>
				<input type="text" bind:value={shortName} placeholder={name || STATIC_TITLE} />
			</label>
			<label class="field">
				<span class="label">作者名（JSON-LD／文章署名）</span>
				<input type="text" bind:value={authorName} placeholder={STATIC_AUTHOR} />
			</label>
			<label class="field">
				<span class="label">作者 handle（@名，前台署名旁；出廠＝owner）</span>
				<input type="text" bind:value={authorHandle} placeholder="owner" />
			</label>
			<label class="field span2">
				<span class="label">站網址（canonical／OG／sitemap 用；SEO 敏感，留空＝出廠佔位）</span>
				<input type="url" bind:value={siteUrl} placeholder="https://yourdomain.com" />
			</label>
			<label class="field">
				<span class="label">時區（統計與日期顯示）</span>
				<input type="text" bind:value={timezone} placeholder="Asia/Taipei" />
			</label>
			<div class="field span2">
				<span class="label">站描述（SEO 首頁／meta 兜底）</span>
				<textarea rows="2" bind:value={siteDescription} placeholder={STATIC_DESC.slice(0, 80) + '…'}
				></textarea>
			</div>
			<label class="field">
				<span class="label">頁尾文字（選填）</span>
				<input type="text" bind:value={footerText} placeholder="如：用 Markdown 慢慢寫完的世界觀" />
			</label>
			<label class="field">
				<span class="label">版權行（留空＝© 年份 站名）</span>
				<input
					type="text"
					bind:value={copyrightText}
					placeholder="© {new Date().getFullYear()} {name || STATIC_TITLE}"
				/>
			</label>
		</div>
		<div class="serp-card" class:serp-live={true}>
			<div class="serp-crumb">
				<img src="/favicon.svg" alt="" class="serp-fav" />
				<span class="serp-site">{name || STATIC_TITLE}</span>
				<span class="serp-url">{STATIC_URL.replace(/^https?:\/\//, '')}</span>
			</div>
			<div class="serp-title">{name || STATIC_TITLE}</div>
			<div class="serp-desc">
				{siteDescription ||
					slogans['zh-tw'] ||
					'（站描述或中文 slogan 會顯示在這裡——Google 結果下那兩行字）'}
			</div>
			<p class="serp-note">
				此卡與首頁 &lt;head&gt; 同源（title＝站名；描述＝站描述→slogan→標語）。Google
				實際顯示可能依查詢調整。
			</p>
		</div>
	</fieldset>

	<label class="field">
		<span class="label">Logo 圖片（URL；留空用文字品牌）</span>
		<div class="row">
			<input type="text" bind:value={logo} placeholder="/media/…" />
			<button type="button" class="ghost" onclick={() => (logoPicker = true)}>從媒體庫選</button>
		</div>
		{#if logo}<img class="preview" src={logo} alt="logo" />{/if}
	</label>

	<label class="field">
		<span class="label">主頁 Hero 背景圖（URL）</span>
		<div class="row">
			<input type="text" bind:value={heroBg} placeholder="/media/…" />
			<button type="button" class="ghost" onclick={() => (heroPicker = true)}>從媒體庫選</button>
		</div>
		{#if heroBg}<img class="preview" src={heroBg} alt="hero" />{/if}

		<!-- SEO site-level defaults (Phase 62) -->
		<div class="field">
			<span class="label">預設分享圖（OG）</span>
			<div class="row">
				<input
					type="text"
					bind:value={defaultOgImage}
					placeholder="/media… 文章無封面時社群分享用"
				/>
				<button type="button" class="ghost" onclick={() => (ogPicker = true)}>從媒體庫選</button>
			</div>
			{#if defaultOgImage}<img class="preview" src={defaultOgImage} alt="default og" />{/if}
			<p class="note">1200×630 以上效果最佳；未設定且文章無封面時，分享僅顯示文字卡。</p>
		</div>
		<div class="field">
			<span class="label">X / Twitter 帳號</span>
			<input type="text" bind:value={twitterSite} placeholder="@handle（留空不發 twitter:site）" />
		</div>
	</label>

	<fieldset class="slogans">
		<legend class="label">Slogan（四語）</legend>
		{#each Object.entries(slogans) as [loc] (loc)}
			<label class="field">
				<span class="label">{loc}</span>
				<input type="text" bind:value={slogans[loc]} />
			</label>
		{/each}
	</fieldset>

	<fieldset class="slogans">
		<legend class="label">站身份多語（選填；留空＝回落上方單語值）</legend>
		{#each localeKeys as loc (loc)}
			<div class="row" style="gap:0.5rem;align-items:end;margin-top:0.5rem">
				<span class="label" style="min-width:4rem">{loc}</span>
				<label class="field" style="flex:1">
					<span class="label">站描述</span>
					<input type="text" bind:value={descriptions[loc]} />
				</label>
				<label class="field" style="flex:1">
					<span class="label">頁尾文字</span>
					<input type="text" bind:value={footers[loc]} />
				</label>
				<label class="field" style="flex:1">
					<span class="label">版權行</span>
					<input type="text" bind:value={copyrights[loc]} />
				</label>
			</div>
		{/each}
	</fieldset>

	<fieldset class="slogans">
		<legend class="label">關於頁 per-locale（內文 Markdown／作品 JSON 陣列；空＝回落）</legend>
		{#each localeKeys as loc (loc)}
			<label class="field">
				<span class="label">{loc} 內文</span>
				<textarea class="about-input" rows="3" bind:value={aboutBodies[loc]}></textarea>
			</label>
			<label class="field">
				<span class="label">{loc} 精選作品（JSON 陣列：title/href/description）</span>
				<textarea rows="2" bind:value={worksJson[loc]} placeholder="留空＝回落；填 [] 亦回落"
				></textarea>
			</label>
		{/each}
	</fieldset>

	<fieldset class="slogans">
		<legend class="label">關於頁內文（Markdown）</legend>
		<textarea class="about-input" bind:value={aboutBody} rows="8" placeholder="留空 = 使用預設內文"
		></textarea>
	</fieldset>

	<fieldset class="slogans">
		<legend class="label">關於頁精選作品（留空＝自動用釘選＋近期文章補位）</legend>
		{#each works as w, i (i)}
			<div class="work-row">
				<div class="row">
					<input type="text" bind:value={w.title} placeholder="標題 *（顯示在卡上）" />
					<input type="text" bind:value={w.href} placeholder="連結 *（/blog/slug 或 https://…）" />
				</div>
				<div class="row">
					<input type="text" bind:value={w.cover} placeholder="封面 URL（留空＝漸層 fallback）" />
					<input type="text" bind:value={w.date} placeholder="日期 YYYY-MM-DD（選填）" />
					<input type="text" bind:value={w.badge} placeholder="badge（選填）" />
				</div>
				<div class="row">
					<select onchange={(e) => pickPost(i, e.currentTarget.value)}>
						<option value="">從已發布文章帶入…</option>
						{#each data.posts ?? [] as post (post.slug)}
							<option value={post.slug}>{post.title}</option>
						{/each}
					</select>
					<button type="button" class="ghost" onclick={() => moveWork(i, -1)} disabled={i === 0}
						>↑</button
					>
					<button
						type="button"
						class="ghost"
						onclick={() => moveWork(i, 1)}
						disabled={i === works.length - 1}>↓</button
					>
					<button type="button" class="ghost" onclick={() => dropWork(i)}>✕</button>
				</div>
			</div>
		{/each}
		<button type="button" class="ghost" onclick={addWork}>＋ 新增作品</button>
		<label class="fill-label">
			<input type="checkbox" bind:checked={worksFill} />
			不足 6 卡時自動以釘選＋近期文章補位（取消勾選＝只顯示上方配置）
		</label>
	</fieldset>

	<fieldset class="slogans">
		<legend class="label">社群連結（config：src/lib/site.ts 修改後重新部署）</legend>
	</fieldset>

	<fieldset class="slogans">
		<legend class="label"
			>社交連結（前台 Hero／Footer／關於頁；顯示模式選「隱藏」＝該項不出現）</legend
		>
		<div class="social-grid">
			{#each SOCIAL_IDS as id (id)}
				<div class="social-row">
					<span class="social-name">{id.toUpperCase()}</span>
					<input type="text" bind:value={socials[id].url} placeholder="留空＝使用出廠預設 URL" />
					<select bind:value={socials[id].display}>
						<option value="icon">僅圖示</option>
						<option value="icon+label">圖示＋文字</option>
						<option value="label">僅文字</option>
						<option value="hidden">隱藏</option>
					</select>
				</div>
			{/each}
		</div>
		<p class="note">隨「網站識別」卡的儲存按鈕一起保存。</p>
	</fieldset>

	<fieldset class="slogans">
		<legend class="label">
			Google Search Console（選配——接上後文章面板可查看實際收錄狀態）
			<span class="seo-tip" tabindex="0" aria-label="說明"
				>ⓘ<span class="seo-tip-pop">
					GCP → 啟用 Search Console API → 建立服務帳戶 → 下載 JSON 金鑰貼於此； 再到 Search Console
					→ 設定 → 擁有者權限，加入金鑰裡的 client_email。 金鑰以 AES-GCM 加密儲存（金鑰金鑰在伺服器
					secret），永不回傳瀏覽器。 URL Inspection 僅支援「網址前置字元」資源。
				</span></span
			>
		</legend>
		<label class="field">
			<span class="label">Property 網址</span>
			<input type="text" bind:value={gscProperty} placeholder="https://example.com/" />
		</label>
		<div class="field">
			<span class="label"
				>服務帳戶金鑰 JSON{gscConfigured ? `（已配置：${gscEmail}；貼上內容可替換）` : ''}</span
			>
			<textarea
				rows="3"
				bind:value={gscSaJson}
				placeholder="貼上 GCP 下載的 JSON 全文（含 client_email 與 private_key）"></textarea>
		</div>
		<div class="row">
			<button type="button" class="ghost" onclick={saveGsc} disabled={gscBusy}
				>儲存金鑰／Property</button
			>
			<button type="button" class="ghost" onclick={testGscConn} disabled={gscBusy || !gscConfigured}
				>測試連線</button
			>
		</div>
		{#if gscMsg}<p class="message">{gscMsg}</p>{/if}
	</fieldset>

	<fieldset class="slogans">
		<legend class="label" id="moderation">評論審核（風險引擎＋AI 分流的控制台）</legend>
		<p class="note">
			留言經「規則風險分 → 中風險帶 AI 輔助 → 決策」分流：低風險自動公開、可疑的進後台人工队列。
			這裡調的是分流的鬆緊與站長禁詞。
		</p>
		<div class="mod-strengths" role="radiogroup" aria-label="審核強度">
			{#each MOD_STRENGTHS as ms (ms.id)}
				<button
					type="button"
					class="mod-pill"
					class:on={modStrength === ms.id}
					role="radio"
					aria-checked={modStrength === ms.id}
					onclick={() => (modStrength = ms.id)}>{ms.label}</button
				>
			{/each}
		</div>
		<p class="note">{modDesc}</p>
		{#if modStrength === 'custom'}
			<div class="mod-custom">
				<label class="field">
					<span class="label"
						>自動放行線（風險分 &lt; 此值 → 直接公開）：{modCustom.approvedBelow}</span
					>
					<input type="range" min="0" max="100" bind:value={modCustom.approvedBelow} />
				</label>
				<label class="field">
					<span class="label">直接 Spam 線（風險分 ≥ 此值 → 攔截）：{modCustom.spamByRule}</span>
					<input type="range" min="1" max="100" bind:value={modCustom.spamByRule} />
				</label>
				<label class="field">
					<span class="label">AI 判安全時的放行上限：{modCustom.moderationSafeBelow}</span>
					<input type="range" min="0" max="100" bind:value={modCustom.moderationSafeBelow} />
				</label>
				<label class="field">
					<span class="label">每個禁詞命中加分：{modCustom.bannedWordScore}</span>
					<input type="range" min="5" max="100" bind:value={modCustom.bannedWordScore} />
				</label>
			</div>
		{/if}
		<label class="field">
			<span class="label">站長禁詞表（一行一個；命中者永不自動公開，累計分數可直接攔截）</span>
			<textarea rows="4" bind:value={modBannedText} placeholder={BANNED_PLACEHOLDER}></textarea>
		</label>
		<div class="row">
			<button
				class="primary"
				type="button"
				disabled={modBusy}
				onclick={() => void saveModeration()}
			>
				儲存審核設定
			</button>
			{#if modMsg}<span class="note" role="status">{modMsg}</span>{/if}
		</div>
	</fieldset>

	<fieldset class="slogans">
		<legend class="label">Email 發送（Provider Adapter）</legend>
		<p class="note">
			Workers 免費方案走第三方 HTTPS API（憑證 AES-GCM 加密存庫、只進不出）；原生 SMTP
			物理上不可行。Cloudflare Email Sending 需 Workers Paid。
		</p>
		<div class="identity-grid">
			<label class="field">
				<span class="label">Provider</span>
				<select bind:value={emProvider}>
					{#each EM_PROVIDERS as pp (pp.id)}
						<option value={pp.id}>{pp.label}{pp.paid ? '（需 Paid）' : ''}</option>
					{/each}
				</select>
			</label>
			<label class="field">
				<span class="label">寄件地址（需已在 provider 驗證域名/信箱）</span>
				<input type="email" bind:value={emFrom} placeholder="hello@yourdomain.com" />
			</label>
			<label class="field">
				<span class="label">寄件顯示名稱</span>
				<input type="text" bind:value={emFromName} placeholder="站名" />
			</label>
			<label class="field">
				<span class="label">站長通知地址（新評論核准時寄 new_comment 範本；留空＝停用）</span>
				<input type="email" bind:value={emAdminNotify} placeholder="you@example.com" />
			</label>
			{#if emProvider === 'mailgun'}
				<label class="field">
					<span class="label">Mailgun Domain</span>
					<input type="text" bind:value={emDomain} placeholder="sandboxxyz.mailgun.org" />
				</label>
			{/if}
			{#if emProvider === 'ses'}
				<label class="field">
					<span class="label">SES Region</span>
					<input type="text" bind:value={emRegion} placeholder="us-east-1" />
				</label>
				<label class="field">
					<span class="label">SES Secret Key（另欄；Access Key 貼下方）</span>
					<input type="password" bind:value={emSesSecret} autocomplete="off" />
				</label>
			{/if}
			{#if emProvider !== 'cloudflare'}
				<label class="field">
					<span class="label"
						>API {emProvider === 'ses'
							? 'Access Key'
							: emProvider === 'postmark'
								? 'Token'
								: 'Key'}{emHasKey ? `（已設定 ••••${emKeyTail}；留空＝不動）` : ''}</span
					>
					<input
						type="password"
						bind:value={emApiKey}
						autocomplete="off"
						placeholder={emHasKey ? '（不更新請留空）' : '貼上金鑰'}
					/>
				</label>
			{/if}
		</div>
		<p class="note">{emNote}</p>
		<div class="row em-row">
			<button
				class="ghost"
				type="button"
				disabled={emBusy}
				onclick={() => void saveEmail().then((o) => o && (emMsg = '✅ 已儲存'))}>儲存</button
			>
			<button class="ghost" type="button" disabled={emBusy} onclick={testEmailConnection}
				>驗證設定</button
			>
			<button class="ghost" type="button" disabled={emBusy} onclick={sendEmailTest}
				>發送測試信</button
			>
			<a class="ghost" href="/admin/email-templates">範本編輯器 →</a>
			<a class="ghost" href="/admin/subscribers">電子報訂閱者 →</a>
			<a class="ghost" href="/admin/email-logs">發送紀錄 →</a>
			<label class="check">
				<input
					type="checkbox"
					bind:checked={emDisabled}
					onchange={() => void saveEmail({ disabled: emDisabled })}
				/>
				暫停發送
			</label>
		</div>
		{#if emMsg}<p class="note" role="status">{emMsg}</p>{/if}
	</fieldset>

	<button type="submit" class="primary" disabled={saving}>{saving ? '儲存中…' : '儲存'}</button>
	{#if message}<p class="message">{message}</p>{/if}
</form>

<MediaPicker
	open={logoPicker}
	onClose={() => (logoPicker = false)}
	onPick={({ url }) => {
		logo = url;
		logoPicker = false;
	}}
/>
<MediaPicker
	open={heroPicker}
	onClose={() => (heroPicker = false)}
	onPick={({ url }) => {
		heroBg = url;
		heroPicker = false;
	}}
/>
<MediaPicker
	open={ogPicker}
	onClose={() => (ogPicker = false)}
	onPick={({ url }) => {
		defaultOgImage = url;
		ogPicker = false;
	}}
/>

{#if data.settings}
	<ThemeSettings current={data.settings.uiTheme} />
{/if}

{#if data.ai}
	<AiSettings ai={data.ai} />
{/if}

{#if data.settings}
	<form
		class="panel shop"
		method="POST"
		action="?/shop"
		use:enhance={() =>
			({ update }) =>
				update()}
	>
		<div class="title">商店與贊助設定</div>
		<label class="field">
			<span class="label">結帳幣別</span>
			<select name="currency" bind:value={currency}>
				<option value="">自動（env → USD）</option>
				{#each ['usd', 'twd', 'jpy', 'hkd', 'cny', 'eur', 'gbp', 'sgd'] as c (c)}
					<option value={c}>{c.toUpperCase()}</option>
				{/each}
			</select>
		</label>
		<label class="field">
			<span class="label">贊助卡文案（留空＝內建語彙）</span>
			<textarea name="supportIntro" rows="2" maxlength="300" bind:value={supportIntro}></textarea>
		</label>
		<p class="note">
			商品價格欄的「12.00」為元；零小數幣別（JPY/TWD）直接寫整數金額。金鑰與 webhook 仍走環境變數。
		</p>
		<button class="mini" type="submit">儲存</button>
	</form>

	<form
		class="panel support"
		method="POST"
		action="?/support"
		use:enhance={() =>
			({ update }) =>
				update()}
	>
		<div class="title">贊助（☕ Buy Me a Coffee 風）</div>
		<label class="check">
			<input type="checkbox" name="post" checked={surf.includes('post')} />
			文章末
		</label>
		<label class="check">
			<input type="checkbox" name="support" checked={surf.includes('support')} />
			/support 頁
		</label>
		<label class="check">
			<input type="checkbox" name="about" checked={surf.includes('about')} />
			About 尾
		</label>
		<p class="note">
			全未勾＝關閉。贊助走既有金流（一家直付；多家於下單時選擇）。金額契約同商品：兩碼小數。
		</p>
		<button class="mini" type="submit">儲存</button>
	</form>

	{#if data.settings}
		<form
			class="panel slots"
			method="POST"
			action="?/slots"
			use:enhance={() =>
				({ update }) =>
					update()}
		>
			<div class="title">擴展槽位（Slots）</div>
			<p class="note">
				把內建擴展元件指派到佈景槽位——加減功能不需改主題原始碼。贊助卡開關與「贊助」區塊連動。
			</p>
			<table class="slot-table">
				<thead>
					<tr>
						<th>槽位</th>
						{#each SLOT_BUILTINS as b (b.id)}
							<th>{b.label}</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each SLOT_NAMES as s (s)}
						<tr>
							<td>{SLOT_LABELS[s]} <code class="mut">{s}</code></td>
							{#each SLOT_BUILTINS as b (b.id)}
								<td>
									<input
										type="checkbox"
										bind:checked={slotOn[`${s}::${b.id}`]}
										aria-label={`${SLOT_LABELS[s]} ${b.label}`}
									/>
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
			<input type="hidden" name="assignments" value={slotsJson} />
			<button class="mini" type="submit">儲存指派</button>
		</form>
	{/if}

	<SiteMdSettings value={data.settings.agentInstructions} />
{/if}

{#if data.mcp}
	<McpSettings mcp={data.mcp} />
{/if}

<style>
	.form-msg {
		font-size: 0.82rem;
		color: var(--color-strong);
		margin: 0.3rem 0 0.8rem;
	}
	.support .check {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		font-size: 0.875rem;
		padding: 0.25rem 0;
	}
	.support .mini {
		margin-top: 0.5rem;
	}
	.slot-table {
		border-collapse: collapse;
		font-size: 0.8125rem;
		margin: 0.5rem 0;
	}
	.slot-table th,
	.slot-table td {
		text-align: left;
		padding: 0.3rem 0.7rem;
		border-bottom: 1px solid var(--color-line);
	}
	.slot-table .mut {
		color: var(--color-ink-muted);
		font-size: 0.6875rem;
		margin-left: 0.4rem;
	}
	.slots .mini {
		margin-top: 0.4rem;
	}
	.identity-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0 1rem;
	}
	.identity-grid .span2 {
		grid-column: 1 / -1;
	}
	.serp-card {
		margin-top: 0.875rem;
		background: #fff;
		border: 1px solid #dadce0;
		border-radius: 0.75rem;
		padding: 0.875rem 1rem;
		max-width: 38rem;
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
	.serp-note {
		margin: 0.5rem 0 0;
		font-size: 0.6875rem;
		color: #70757a;
	}

	.title {
		font-size: 1.75rem;
		font-weight: 700;
		margin-bottom: 0.5rem;
	}

	.note {
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
		margin-bottom: 1.5rem;
	}

	.form {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		max-width: 40rem;
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

	fieldset.slogans {
		border: 1px solid var(--color-line);
		border-radius: 0.75rem;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.slogans legend {
		padding: 0 0.25rem;
	}

	.social-grid {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.social-row {
		display: grid;
		grid-template-columns: 5.5rem 1fr 9rem;
		gap: 0.5rem;
		align-items: center;
	}
	.social-name {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		color: var(--color-ink-muted);
	}
	@media (max-width: 767px) {
		.social-row {
			grid-template-columns: 1fr;
		}
	}
	.mod-strengths {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}
	.mod-pill {
		padding: 0.3125rem 0.875rem;
		border: 1px solid var(--color-line);
		border-radius: 9999px;
		background: transparent;
		color: var(--color-ink-muted);
		font-size: 0.8125rem;
		cursor: pointer;
		transition:
			color 0.2s ease,
			border-color 0.2s ease,
			background 0.2s ease;
	}
	.mod-pill:hover {
		color: var(--color-ink);
		border-color: var(--color-ink);
	}
	.mod-pill.on {
		color: var(--color-accent-ink);
		background: var(--color-accent);
		border-color: var(--color-accent);
		font-weight: 700;
	}
	.mod-custom {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem 1.5rem;
		padding: 0.75rem;
		border: 1px solid var(--color-line);
		border-radius: 0.75rem;
	}
	@media (max-width: 767px) {
		.mod-custom {
			grid-template-columns: 1fr;
		}
	}
	.mod-custom input[type='range'] {
		width: 100%;
		accent-color: var(--color-accent);
	}
	.em-row {
		flex-wrap: wrap;
	}
	.em-row input[type='checkbox'] {
		flex: none;
		width: auto;
	}
	.em-row .check {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
	}
	.row {
		display: flex;
		gap: 0.5rem;
	}

	.row input {
		flex: 1;
	}

	input[type='text'],
	input[type='email'],
	input[type='password'],
	textarea {
		background: var(--color-bg);
		border: 1px solid var(--color-line);
		border-radius: 0.625rem;
		padding: 0.5rem 0.75rem;
		color: var(--color-ink);
		font: inherit;
		/* admin form-control standard size (Phase 70.6) */
		font-size: 0.875rem;
		box-sizing: border-box;
		width: 100%;
	}

	/* 43: form controls aligned to the design vocabulary (select previously inherited the UA default size and looked oversized) */
	select {
		background: var(--color-bg);
		border: 1px solid var(--color-line);
		border-radius: 0.625rem;
		padding: 0.5rem 0.75rem;
		color: var(--color-ink);
		font: inherit;
		font-size: 0.8125rem;
		box-sizing: border-box;
	}

	.fill-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.5rem;
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
	}

	.about-input {
		background: var(--color-bg);
		border: 1px solid var(--color-line);
		border-radius: 0.625rem;
		padding: 0.625rem 0.875rem;
		color: var(--color-ink);
		font: inherit;
		font-family: var(--font-mono);
		font-size: 0.875rem;
		line-height: 1.6;
		box-sizing: border-box;
		width: 100%;
		resize: vertical;
	}

	input:focus {
		outline: 2px solid var(--color-accent);
		outline-offset: 1px;
		border-color: transparent;
	}

	.preview {
		max-height: 6rem;
		border-radius: 0.625rem;
		border: 1px solid var(--color-line);
		width: fit-content;
	}

	.ghost {
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

	.primary {
		align-self: flex-start;
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

	.message {
		font-size: 0.875rem;
		color: #22c55e;
		margin: 0;
	}
	.work-row {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.75rem;
		margin-bottom: 0.75rem;
		border: 1px dashed var(--color-line);
		border-radius: 0.5rem;
	}
</style>
