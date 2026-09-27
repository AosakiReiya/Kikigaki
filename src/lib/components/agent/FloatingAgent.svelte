<script lang="ts">
	/**
	 * Floating Agent (Phase 27 rebuild) — TocFab-style morph:
	 * closed = circular FAB; click → a circular overlay "grows" from the button position into the panel rectangle
	 * (only geometry tweens; content never squashes), panel content fades in after; collapsing shrinks back to the button.
	 * .win stays resident, never unmounted (an extension of runtime/UI separation: folding never loses the view).
	 */
	import { onDestroy } from 'svelte';
	import { agent } from '$lib/agent/client/agent-store.svelte';
	import { ensureGsap } from '$lib/animation/core';
	import { prefersReducedMotion } from '$lib/animation/config';
	import { fabPop } from '$lib/agent/client/motion';
	import AgentPanel from './AgentPanel.svelte';

	let vp = $state({ w: 1024, h: 768 });
	let drag = $state<{
		sx: number;
		sy: number;
		ox: number;
		oy: number;
		moved: boolean;
	} | null>(null);
	let fabEl: HTMLButtonElement | undefined = $state();
	let morphEl: HTMLDivElement | undefined = $state();
	let winEl: HTMLElement | undefined = $state();
	let winShown = $state(false);
	let animating = false;
	let justDragged = false;

	const FAB = 51; // 3.2rem
	const WIN_W = 460;
	const WIN_H_RATIO = 0.78;

	const fabPos = $derived({
		x: Math.min(Math.max(agent.pos.x || vp.w - 76, 8), vp.w - 68),
		y: Math.min(Math.max(agent.pos.y || vp.h - 92, 8), vp.h - 68)
	});
	const winRect = $derived.by(() => {
		if (agent.mobile) return { x: 8, y: 8, w: vp.w - 16, h: vp.h - 16 };
		const w = Math.min(WIN_W, vp.w - 16);
		const h = Math.min(Math.round(vp.h * WIN_H_RATIO), vp.h - 24);
		let y = fabPos.y - h - 8;
		if (y < 8) y = Math.min(fabPos.y + 68, vp.h - h - 8);
		return {
			x: Math.min(Math.max(fabPos.x - w + 60, 8), vp.w - w - 8),
			y,
			w,
			h
		};
	});

	// mount once (must NOT wrap in a $effect reading $state — otherwise toggling kills the open/close timeline via cleanup)
	{
		const measure = () => (vp = { w: innerWidth, h: innerHeight });
		measure();
		addEventListener('resize', measure);
		const mq = matchMedia('(max-width: 640px)');
		const syncMq = () => (agent.mobile = mq.matches);
		mq.addEventListener('change', syncMq);
		syncMq();
		agent.init();
		void agent.refreshSessions();
		if (agent.open) winShown = true; // restore the persisted open state (no animation)
		setTimeout(() => fabEl && fabPop(fabEl), 60);
		onDestroy(() => {
			removeEventListener('resize', measure);
			mq.removeEventListener('change', syncMq);
			const g = ensureGsap();
			if (morphEl) g.killTweensOf(morphEl);
			if (winEl) g.killTweensOf(winEl);
		});
	}

	// external code setting agent.open directly (e.g. the panel's ✕ button) → the view syncs
	$effect(() => {
		const o = agent.open;
		if (animating) return;
		if (!o && winShown) {
			winShown = false;
			if (winEl) ensureGsap().set(winEl, { autoAlpha: 0 });
		} else if (o && !winShown) {
			winShown = true;
			if (winEl) ensureGsap().set(winEl, { autoAlpha: 1 });
		}
	});

	function openPanel(): void {
		if (animating || agent.open) return;
		const r = winRect;
		agent.setOpen(true); // fab gone + LS
		if (prefersReducedMotion()) {
			winShown = true;
			return;
		}
		const g = ensureGsap();
		const f = fabPos;
		animating = true;
		if (!morphEl || !winEl) {
			winShown = true;
			animating = false;
			return;
		}
		const morph = morphEl;
		const win = winEl;
		g.set(morph, {
			x: f.x,
			y: f.y,
			width: FAB,
			height: FAB,
			borderRadius: FAB / 2,
			autoAlpha: 1
		});
		const tl = g.timeline({
			onComplete: () => {
				g.set(morph, { autoAlpha: 0 });
				animating = false;
			}
		});
		tl.to(
			morph,
			{
				x: r.x,
				y: r.y,
				width: r.w,
				height: r.h,
				borderRadius: 14,
				duration: 0.32,
				ease: 'power3.inOut'
			},
			0
		);
		tl.add(() => (winShown = true), 0.24);
		tl.fromTo(
			win,
			{ autoAlpha: 0, y: 10 },
			{ autoAlpha: 1, y: 0, duration: 0.26, ease: 'power2.out' },
			0.26
		);
		tl.to(morph, { autoAlpha: 0, duration: 0.18 }, 0.4);
	}

	function closePanel(): void {
		if (animating || !agent.open) return;
		agent.refreshSessions();
		if (prefersReducedMotion() || !morphEl || !winEl) {
			winShown = false;
			agent.setOpen(false);
			return;
		}
		const g = ensureGsap();
		const r = winRect;
		const f = fabPos;
		animating = true;
		const morph = morphEl as HTMLDivElement;
		const win = winEl as HTMLElement;
		g.set(morph, {
			x: r.x,
			y: r.y,
			width: r.w,
			height: r.h,
			borderRadius: 14,
			autoAlpha: 1
		});
		const tl = g.timeline({
			onComplete: () => {
				winShown = false;
				agent.setOpen(false); // the fab returns to its button circle here (morph already in place; seamless handoff)
				g.set(morph, { autoAlpha: 0 });
				animating = false;
			}
		});
		tl.to(win, { autoAlpha: 0, duration: 0.14, ease: 'power2.in' }, 0);
		tl.to(
			morph,
			{
				x: f.x,
				y: f.y,
				width: FAB,
				height: FAB,
				borderRadius: FAB / 2,
				duration: 0.3,
				ease: 'power3.inOut'
			},
			0.08
		);
	}

	function down(e: PointerEvent): void {
		if ((e.target as HTMLElement).closest('button.no-drag')) return;
		drag = { sx: e.clientX, sy: e.clientY, ox: fabPos.x, oy: fabPos.y, moved: false };
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}
	function move(e: PointerEvent): void {
		if (!drag) return;
		const dx = e.clientX - drag.sx;
		const dy = e.clientY - drag.sy;
		if (Math.abs(dx) + Math.abs(dy) > 6) drag.moved = true;
		if (!drag.moved) return;
		agent.pos = { x: drag.ox + dx, y: drag.oy + dy };
	}
	function up(e: PointerEvent): void {
		if (!drag) return;
		const wasDrag = drag.moved;
		drag = null;
		(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
		if (wasDrag) {
			agent.savePos();
			justDragged = true;
			setTimeout(() => (justDragged = false), 50);
		}
	}
</script>

<svelte:window onpointermove={move} onpointerup={up} onpointercancel={() => (drag = null)} />

<div class="morph" bind:this={morphEl} aria-hidden="true"></div>

<button
	bind:this={fabEl}
	class="fab"
	class:pulse={agent.runStatus === 'running' && !agent.open}
	class:gone={agent.open}
	style="left:{fabPos.x}px; top:{fabPos.y}px"
	aria-label="AI Agent"
	onpointerdown={down}
	onclick={() => {
		if (!animating && !justDragged) openPanel();
	}}
>
	✦
</button>

<section
	bind:this={winEl}
	class="win"
	class:shown={winShown}
	class:mobile={agent.mobile}
	style={agent.mobile
		? ''
		: `left:${winRect.x}px; top:${winRect.y}px; width:${winRect.w}px; height:${winRect.h}px`}
	role="dialog"
	tabindex="-1"
	aria-label="Floating Agent"
>
	<div class="grip" onpointerdown={down} role="presentation">
		<span>✦ Agent</span>
		<span class="dots">⋮⋮</span>
		<button class="no-drag hide" title="收合（Session 不中斷）" onclick={closePanel}>▾</button>
	</div>
	<div class="body">
		<AgentPanel />
	</div>
</section>

<style>
	.morph {
		position: fixed;
		left: 0;
		top: 0;
		z-index: 42;
		background: var(--color-accent);
		pointer-events: none;
		visibility: hidden;
		will-change: transform, width, height, border-radius;
	}

	.fab {
		position: fixed;
		width: 3.2rem;
		height: 3.2rem;
		border-radius: 50%;
		border: 0;
		background: var(--color-accent);
		color: var(--color-accent-ink, #fff);
		font-size: 1.35rem;
		cursor: grab;
		box-shadow: 0 6px 24px rgb(0 0 0 / 28%);
		z-index: 40;
		touch-action: none;
		user-select: none;
		transition:
			opacity 0.12s ease,
			visibility 0.12s;
	}
	.fab.gone {
		opacity: 0;
		visibility: hidden;
		pointer-events: none;
	}
	.fab.pulse {
		animation: pulse 1.4s ease-in-out infinite;
	}
	@keyframes pulse {
		0%,
		100% {
			box-shadow:
				0 6px 24px rgb(0 0 0 / 28%),
				0 0 0 0 color-mix(in srgb, var(--color-accent) 55%, transparent);
		}
		50% {
			box-shadow:
				0 6px 24px rgb(0 0 0 / 28%),
				0 0 0 12px transparent;
		}
	}

	.win {
		position: fixed;
		z-index: 41;
		display: flex;
		flex-direction: column;
		border: 1px solid var(--color-line);
		border-radius: 0.9rem;
		overflow: hidden;
		box-shadow: 0 18px 60px rgb(0 0 0 / 35%);
		background: var(--color-bg);
		min-height: 0;
		visibility: hidden;
	}
	.win.shown {
		visibility: visible;
	}
	.win.mobile {
		inset: 8px;
		width: auto;
		height: auto;
	}
	.grip {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem 0.7rem;
		background: var(--color-bg-elevated);
		border-bottom: 1px solid var(--color-line);
		font-size: 0.8rem;
		font-weight: 700;
		font-family: var(--font-display);
		cursor: grab;
		touch-action: none;
		user-select: none;
	}
	.grip .dots {
		margin-left: auto;
		opacity: 0.35;
		font-weight: 400;
	}
	.hide {
		border: 0;
		background: none;
		color: var(--color-ink-muted);
		cursor: pointer;
		font-size: 0.85rem;
	}
	.body {
		flex: 1;
		min-height: 0;
		display: flex;
	}
</style>
