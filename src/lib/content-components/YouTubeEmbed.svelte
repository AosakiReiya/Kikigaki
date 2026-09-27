<script lang="ts">
	/* * :::youtube — 16:9 embed; accepts URLs or bare IDs (no external resources on first load; the iframe mounts on click) */
	import { extractYouTubeId } from '$lib/content/util';

	let {
		src = '',
		id = '',
		title = 'YouTube video'
	}: {
		src?: string;
		id?: string;
		title?: string;
	} = $props();

	const videoId = $derived(extractYouTubeId(String(id || src || '')));
	let active = $state(false);
</script>

{#if videoId}
	<div class="yt" data-active={active}>
		{#if active}
			<iframe
				class="yt-frame"
				src="https://www.youtube-nocookie.com/embed/{videoId}?autoplay=1&rel=0"
				title={String(title)}
				allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
				allowfullscreen
				loading="lazy"
			></iframe>
		{:else}
			<button
				type="button"
				class="yt-facade"
				onclick={() => (active = true)}
				aria-label="播放影片：{String(title)}"
			>
				<img
					class="yt-thumb"
					src="https://i.ytimg.com/vi/{videoId}/hqdefault.jpg"
					alt={String(title)}
					width="480"
					height="360"
					loading="lazy"
				/>
				<span class="yt-play" aria-hidden="true">▶</span>
			</button>
		{/if}
	</div>
{:else}
	<p class="yt-error">YouTube：無法解析影片 ID（src="{String(src || id)}"）</p>
{/if}

<style>
	.yt {
		position: relative;
		width: min(100%, 56rem);
		margin: 2.5rem auto;
		aspect-ratio: 16 / 9;
		border-radius: 1rem;
		overflow: hidden;
		border: 1px solid var(--color-line);
		background: #101014;
	}

	.yt-frame {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		border: none;
	}

	.yt-facade {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		border: none;
		padding: 0;
		cursor: pointer;
		background: none;
	}

	.yt-thumb {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.yt-play {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		font-size: 2rem;
		color: var(--color-accent);
		text-shadow: 0 0 24px rgb(0 0 0 / 60%);
		transition: transform 0.2s ease;
	}

	.yt-facade:hover .yt-play {
		transform: scale(1.12);
	}

	.yt-error {
		margin: 1.5rem 0;
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
	}
</style>
