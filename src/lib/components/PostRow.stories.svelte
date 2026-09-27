<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import PostRow from './PostRow.svelte';
	import type { PostSummary } from '$lib/server/content';

	const mockPost: PostSummary = {
		slug: 'gsap-page-transition',
		title: '用 GSAP 打造 SvelteKit 頁面轉場',
		date: '2026-08-18',
		tags: [
			{ name: 'GSAP', display: 'GSAP' },
			{ name: '動畫', display: '動畫' },
			{ name: 'SvelteKit', display: 'SvelteKit' }
		],
		summary: '利用 SvelteKit 官方的 onNavigate 掛載點與 GSAP timeline，做出不閃爍的頁面轉場。',
		type: 'devlog',
		categoryDisplay: '開發紀錄',
		pinned: false,
		views: 42,
		translated: true,
		availableLocales: ['zh-tw']
	};

	const { Story } = defineMeta({
		title: 'Components/PostRow',
		component: PostRow,
		args: {
			post: mockPost,
			index: 0
		}
	});
</script>

<Story name="Default" />
