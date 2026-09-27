<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import * as m from '$lib/paraglide/messages';
	import type { TocItem } from '$lib/markdown';
	import { ensureGsap } from '$lib/animation/core';
	import { EASE, prefersReducedMotion } from '$lib/animation/config';
	import { getHeaderVisible } from '$lib/stores/header.svelte';

	let { items, inline }: { items: TocItem[]; inline: HTMLElement | undefined } = $props();

	let rootEl = $state<HTMLDivElement>();
	let morph = $state<HTMLDivElement>();
	let icon = $state<HTMLButtonElement>();
	let closeBtn = $state<HTMLButtonElement>();
	let resetBtn = $state<HTMLButtonElement>();
	let content = $state<HTMLDivElement>();

	type TocMode = 'inline' | 'floating' | 'panel';
	let mode = $state<TocMode>('inline');

	/* * vertical anchoring: decided by the final position when the drag ends (top/bottom edge snapping follows the Header and browser bars) */
	type VAnchor = 'top' | 'bottom' | 'free';
	let verticalAnchor: VAnchor = 'free';
	const EDGE_SNAP = 32;
	let pendingReset = false;
	/* * snap requests blocked by drags/animations are parked and run when there's room */
	let pendingAnchorSync = false;

	let reduced = true;
	let morphTl: gsap.core.Timeline | undefined;
	let io: IntersectionObserver | undefined;
	let revertTimer: ReturnType<typeof setTimeout> | undefined;

	// drag state (press and drag directly; displacement past the threshold counts as drag, otherwise click)
	let pointer:
		| {
				id: number;
				moved: boolean;
				sx: number;
				sy: number;
				lastX: number;
				lastY: number;
				lastT: number;
				samples: { x: number; y: number; t: number }[];
		  }
		| undefined;
	/* * displacement past this counts as a drag (click vs drag separation) */
	const DRAG_THRESHOLD = 6;
	let lastDragAt = 0;
	let inflight: gsap.core.Tween | undefined;
	let quickX: ((value: number) => void) | undefined;
	let quickY: ((value: number) => void) | undefined;
	let onDragMove: ((e: PointerEvent) => void) | undefined;
	let onDragUp: ((e: PointerEvent) => void) | undefined;
	let grabDX = 0;
	let grabDY = 0;

	/* ------------------------------------------------------------------ */
	/* position: the button's top-left corner (viewport px). The morph is pinned at left:0 top:0, fully JS-controlled */
	/* ------------------------------------------------------------------ */
	const POS_KEY = 'toc-fab-pos';
	const FAB = 56;
	const MARGIN = 12;
	let btnX = 0;
	let btnY = 0;
	let minX = 0;
	let maxX = 0;
	let minY = 0;
	let maxY = 0;
	let safeBottom = 0;

	function safeBottomPx(): number {
		if (!morph) return 0;
		return parseFloat(getComputedStyle(morph).getPropertyValue('--toc-safe-bottom')) || 0;
	}

	function updateBounds(): void {
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		safeBottom = safeBottomPx();
		// Header awareness: the top bound always sits below the Header; dragging/snapping never pushes into the Header
		minX = MARGIN;
		maxX = vw - MARGIN - FAB;
		minY = (getHeaderVisible() ? headerHeight() : 0) + MARGIN;
		// guard: in extremes like an expanded browser bar, maxY must not fall below minY (otherwise bottom-docking "hits the ceiling")
		maxY = Math.max(vh - MARGIN - safeBottom - FAB, minY);
	}

	function clampXY(): void {
		btnX = Math.min(Math.max(btnX, minX), maxX);
		btnY = Math.min(Math.max(btnY, minY), maxY);
	}

	/* * Header height (used to push the button below the Header while snapping) */
	function headerHeight(): number {
		const el = document.querySelector<HTMLElement>('.site-header');
		return el?.offsetHeight ?? 56;
	}

	/* * after a drag/snap ends: decide the vertical anchor from the final position */
	function updateVerticalAnchor(): void {
		updateBounds();
		if (btnY <= minY + EDGE_SNAP) verticalAnchor = 'top';
		else if (btnY >= maxY - EDGE_SNAP) verticalAnchor = 'bottom';
		else verticalAnchor = 'free';
	}

	/* * correct btnY from the anchor state: top → the height matching Header show/hide; bottom → the bottom edge */
	function syncAnchorPosition(): void {
		updateBounds();
		if (verticalAnchor === 'top') {
			btnY = minY; // updateBounds already includes the Header height
		} else if (verticalAnchor === 'bottom') {
			btnY = maxY;
		}
		btnX = Math.min(Math.max(btnX, minX), maxX);
		btnY = Math.min(Math.max(btnY, minY), maxY);
	}

	/* * snap displacement animation (short; overwrite:'auto' covers only x/y — never kills autoAlpha fades) */
	function anchorTween(): void {
		if (!morph) return;
		const gsap = ensureGsap();
		if (reduced) {
			gsap.set(morph, { x: btnX, y: btnY });
			return;
		}
		gsap.to(morph, { x: btnX, y: btnY, duration: 0.3, ease: 'power2.out', overwrite: 'auto' });
	}

	/* * apply coordinates immediately (for invisible elements or zero-latency needs — avoids any visual jump) */
	function applyPositionNow(): void {
		if (morph) ensureGsap().set(morph, { x: btnX, y: btnY });
	}

	/* * panel rectangle: always fully inside the window, growing from the button position toward the middle */
	function panelRect(): { x: number; y: number; w: number; h: number } {
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const w = Math.min(320, vw - MARGIN * 2);
		const h = Math.min(vh * 0.7, 416, vh - MARGIN * 2);
		return {
			x: Math.min(Math.max(btnX, MARGIN), vw - w - MARGIN),
			y: Math.min(Math.max(btnY, MARGIN), vh - h - MARGIN),
			w,
			h
		};
	}

	onMount(() => {
		reduced = prefersReducedMotion();
		const gsap = ensureGsap();
		if (!morph || !icon || !content || !closeBtn || !resetBtn || !inline || !rootEl) return;
		const el = morph;
		const host = rootEl; // $state narrowing widens inside closures — capture first

		// Portal to body: position: fixed purely against the viewport
		// sweep old orphans first: nodes Svelte couldn't clean after being moved would leave duplicate buttons across page switches
		document.querySelectorAll<HTMLElement>('[data-toc-fab]').forEach((n) => {
			if (n !== rootEl) n.remove();
		});
		if (rootEl.parentElement !== document.body) {
			document.body.appendChild(rootEl);
		}

		// initial position: bottom-right corner (12px + safe-area = the v1 anchor)
		updateBounds();
		btnX = window.innerWidth - MARGIN - FAB;
		btnY = window.innerHeight - MARGIN - safeBottom - FAB;
		let savedAnchor: VAnchor | undefined;
		try {
			const saved = JSON.parse(localStorage.getItem(POS_KEY) ?? 'null') as {
				x: number;
				y: number;
				anchor?: VAnchor;
			} | null;
			if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
				btnX = saved.x;
				btnY = saved.y;
				clampXY();
				if (saved.anchor === 'top' || saved.anchor === 'bottom' || saved.anchor === 'free') {
					savedAnchor = saved.anchor;
				}
			}
		} catch {
			// localStorage unavailable → default position
		}
		// reuse the stored anchor record when present (including the default position's stored anchor); otherwise infer from position
		if (savedAnchor && savedAnchor !== 'free') {
			verticalAnchor = savedAnchor;
		} else {
			updateVerticalAnchor();
		}
		syncAnchorPosition();

		// initially hidden: autoAlpha only
		gsap.set(el, { x: btnX, y: btnY, autoAlpha: 0 });
		gsap.set(content!, { autoAlpha: 0 });
		gsap.set(closeBtn!, { autoAlpha: 0, scale: 0.6 });
		gsap.set(resetBtn!, { autoAlpha: 0, scale: 0.6 });
		window.addEventListener('resize', onResize, { passive: true });
		window.addEventListener('orientationchange', onOrientation);

		// --- inline TOC leaving/returning to viewport → floating button fades in/out ---
		io = new IntersectionObserver(
			(entries) => {
				for (const en of entries) {
					const gone = en.boundingClientRect.bottom <= 0;
					if (gone) {
						if (mode === 'inline') appear();
					} else if (mode === 'floating') {
						armRevert();
					}
				}
			},
			{ threshold: 0 }
		);
		io.observe(inline);

		// dragging: window-level listeners, attached only while armed
		onDragMove = (e: PointerEvent) => handlePointerMove(e);
		onDragUp = (e: PointerEvent) => handlePointerUp(e);

		return () => {
			io?.disconnect();
			clearTimeout(revertTimer);
			clearTimeout(resizeTimer);
			morphTl?.kill();
			inflight?.kill();
			detachDragListeners();
			window.removeEventListener('resize', onResize);
			window.removeEventListener('orientationchange', onOrientation);
			// Svelte may fail to clean the Portal node → remove explicitly, avoiding leftover duplicate buttons after page switches
			gsap.killTweensOf([el, icon, content, closeBtn, resetBtn]);
			host.remove();
		};
	});

	/* * resize trailing debounce: browser toolbar collapse/expand fires continuously — reposition only after the animation converges */
	let resizeTimer: ReturnType<typeof setTimeout> | undefined;
	function onResize(): void {
		clearTimeout(resizeTimer);
		resizeTimer = setTimeout(() => {
			resizeTimer = undefined;
			applyResize();
		}, 120);
	}

	function applyResize(): void {
		if (pointer) return;
		if (mode === 'panel') {
			// panel open: don't touch visuals; book it and resync in one pass when collapse completes
			pendingAnchorSync = true;
			return;
		}
		const prevX = btnX;
		const prevY = btnY;
		// single positional authority: syncAnchorPosition's internal updateBounds (Header-aware + maxY>=minY)
		syncAnchorPosition();
		if (Math.abs(btnX - prevX) > 0.5 || Math.abs(btnY - prevY) > 0.5) {
			if (mode === 'floating') anchorTween(); // inline (invisible) → only update logical coordinates; applied on appear
		}
	}

	function onOrientation(): void {
		setTimeout(onResize, 300);
	}

	// Header show/hide → reposition when there's room: top snapping follows minY; free but covered by the Header → clamp pushes away
	$effect(() => {
		const hv = getHeaderVisible();
		if (mode !== 'floating') return;
		if (pointer || morphTl || inflight) {
			pendingAnchorSync = true;
			return;
		}
		void hv;
		const prevY = btnY;
		syncAnchorPosition(); // internal updateBounds: minY includes the Header height
		if (Math.abs(btnY - prevY) > 0.5) anchorTween();
	});

	/* * when there's room, run the blocked reposition (called after drags/panel animations end) */
	function consumePendingAnchorSync(): void {
		if (!pendingAnchorSync) return;
		pendingAnchorSync = false;
		if (mode !== 'floating') {
			// panel still open → book it; consumed on collapse
			if (mode === 'panel' || morphTl) pendingAnchorSync = true;
			return;
		}
		const prevX = btnX;
		const prevY = btnY;
		syncAnchorPosition();
		if (Math.abs(btnX - prevX) > 0.5 || Math.abs(btnY - prevY) > 0.5) anchorTween();
	}

	// --- state transitions ---
	function appear(): void {
		// resync before fading in: the Header/toolbar may have changed while hidden; fix stale coordinates (the element is invisible, so the set never jumps)
		syncAnchorPosition();
		applyPositionNow();
		mode = 'floating';
		if (!morph) return;
		if (reduced) {
			morph.style.visibility = 'visible';
			morph.style.opacity = '1';
			return;
		}
		ensureGsap().to(morph, { autoAlpha: 1, duration: 0.35, ease: EASE.out });
	}

	function disappear(): void {
		mode = 'inline';
		if (!morph) return;
		if (reduced) {
			morph.style.visibility = 'hidden';
			morph.style.opacity = '';
			return;
		}
		ensureGsap().to(morph, { autoAlpha: 0, duration: 0.3, ease: EASE.out });
	}

	function armRevert(): void {
		if (mode !== 'floating') return;
		clearTimeout(revertTimer);
		revertTimer = setTimeout(() => {
			revertTimer = undefined;
			disappear();
		}, 300);
	}

	function clearRevertPending(): void {
		clearTimeout(revertTimer);
		revertTimer = undefined;
	}

	function inlineVisible(): boolean {
		return inline ? inline.getBoundingClientRect().bottom > 0 : false;
	}

	// --- panel: circle → rectangle morph ---
	function openPanel(): void {
		if (reduced) {
			mode = 'panel';
			const gsap = ensureGsap();
			const { x, y, w, h } = panelRect();
			gsap.set(morph!, { x, y, width: w, height: h, borderRadius: 16, autoAlpha: 1 });
			gsap.set(content!, { autoAlpha: 1 });
			gsap.set(closeBtn!, { autoAlpha: 1, scale: 1 });
			gsap.set(resetBtn!, { autoAlpha: 1, scale: 1 });
			gsap.set(icon!, { autoAlpha: 0 });
			return;
		}
		clearRevertPending();
		const gsap = ensureGsap();
		const { x, y, w, h } = panelRect();
		const elevated =
			getComputedStyle(document.documentElement).getPropertyValue('--color-bg-elevated').trim() ||
			'#ffffff';
		const line =
			getComputedStyle(document.documentElement).getPropertyValue('--color-line').trim() ||
			'#e4e2db';

		// dynamic timeline: start = the button's current state (circle), end = the panel rectangle
		morphTl?.kill();
		morphTl = gsap
			.timeline({
				onReverseComplete: () => {
					// the Header/viewport may have changed while the panel was open → resync before shrinking to the circle
					if (!pendingReset) syncAnchorPosition();
					// shrink back to the circle: restore the initial visual state
					gsap.set(morph!, {
						width: FAB,
						height: FAB,
						borderRadius: FAB / 2,
						x: btnX,
						y: btnY
					});
					gsap.set(content!, { autoAlpha: 0, y: 0 });
					gsap.set(closeBtn!, { autoAlpha: 0, scale: 0.6 });
					gsap.set(resetBtn!, { autoAlpha: 0, scale: 0.6 });
					gsap.set(icon!, { autoAlpha: 1, scale: 1 });
					morphTl = undefined;
					// restore the default position: slide back to the anchor based on the CURRENT viewport's bottom-right
					if (pendingReset) {
						pendingReset = false;
						updateBounds();
						btnX = maxX;
						btnY = maxY;
						updateVerticalAnchor();
						persistPosition();
						if (reduced) {
							gsap.set(morph!, { x: btnX, y: btnY });
						} else {
							gsap.to(morph!, {
								x: btnX,
								y: btnY,
								duration: 0.5,
								ease: 'power3.inOut',
								overwrite: 'auto'
							});
						}
					}
					consumePendingAnchorSync();
				}
			})
			.to(
				morph!,
				{
					x,
					y,
					width: w,
					height: h,
					borderRadius: 16,
					backgroundColor: elevated,
					borderColor: line,
					duration: 0.5,
					ease: 'power3.inOut'
				},
				0
			)
			.to(icon!, { autoAlpha: 0, duration: 0.15 }, 0)
			.fromTo(
				content!,
				{ autoAlpha: 0, y: 10 },
				{ autoAlpha: 1, y: 0, duration: 0.3, ease: EASE.out },
				0.25
			)
			.to(closeBtn!, { autoAlpha: 1, scale: 1, duration: 0.25, ease: EASE.out }, 0.33)
			.to(resetBtn!, { autoAlpha: 1, scale: 1, duration: 0.25, ease: EASE.out }, 0.4);
		mode = 'panel';
		morphTl.play();
	}

	function closePanel(): void {
		mode = 'floating';
		if (!morph) return;
		if (reduced) {
			const gsap = ensureGsap();
			gsap.set(closeBtn!, { autoAlpha: 0, scale: 0.6 });
			gsap.set(resetBtn!, { autoAlpha: 0, scale: 0.6 });
			gsap.set(content!, { autoAlpha: 0 });
			gsap.set(icon!, { autoAlpha: 1 });
			if (pendingReset) {
				pendingReset = false;
				updateBounds();
				btnX = maxX;
				btnY = maxY;
				updateVerticalAnchor();
				persistPosition();
			} else {
				syncAnchorPosition();
			}
			gsap.set(morph!, {
				x: btnX,
				y: btnY,
				width: FAB,
				height: FAB,
				borderRadius: FAB / 2
			});
			return;
		}
		if (morphTl) morphTl.timeScale(1.15).reverse();
		// after closing, facing the TOC area → button fades out, inline TOC restored
		if (inlineVisible()) armRevert();
	}

	/* * restore the default position: after collapsing the panel, slide back to the bottom-right (based on the viewport at collapse time) */
	function onResetClick(): void {
		if (!morph || mode !== 'panel') return;
		pendingReset = true;
		closePanel();
	}

	// close: Esc, clicks outside the button/panel
	$effect(() => {
		if (mode !== 'panel') return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') closePanel();
		};
		const onDown = (e: PointerEvent) => {
			const t = e.target as Node | null;
			if (!t) return;
			if (t instanceof Node && rootEl?.contains(t)) return;
			closePanel();
		};
		document.addEventListener('keydown', onKey);
		document.addEventListener('pointerdown', onDown);
		return () => {
			document.removeEventListener('keydown', onKey);
			document.removeEventListener('pointerdown', onDown);
		};
	});

	// --- dragging (press and drag directly; displacement > DRAG_THRESHOLD counts as drag, otherwise click) ---
	function onFabPointerDown(e: PointerEvent): void {
		if (mode !== 'floating') return;
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		clearRevertPending();
		inflight?.kill(); // take over a button mid-flight
		updateBounds(); // refresh bounds: Header-aware minY so dragging can't enter the Header
		const gsap = ensureGsap();
		quickX = gsap.quickTo(morph!, 'x', { duration: 0.1, ease: 'power2.out' });
		quickY = gsap.quickTo(morph!, 'y', { duration: 0.1, ease: 'power2.out' });
		grabDX = e.clientX - btnX;
		grabDY = e.clientY - btnY;
		pointer = {
			id: e.pointerId,
			moved: false,
			sx: e.clientX,
			sy: e.clientY,
			lastX: e.clientX,
			lastY: e.clientY,
			lastT: performance.now(),
			samples: []
		};
		attachDragListeners();
	}

	function attachDragListeners(): void {
		if (!browser) return;
		window.addEventListener('pointermove', onDragMove!, { passive: false });
		window.addEventListener('pointerup', onDragUp!, { passive: false });
		window.addEventListener('pointercancel', onDragUp!, { passive: false });
	}

	function detachDragListeners(): void {
		if (!browser) return;
		window.removeEventListener('pointermove', onDragMove!);
		window.removeEventListener('pointerup', onDragUp!);
		window.removeEventListener('pointercancel', onDragUp!);
	}

	function handlePointerMove(e: PointerEvent): void {
		const p = pointer;
		if (!p || e.pointerId !== p.id) return;
		if (!p.moved) {
			// before the threshold: don't intercept, don't move — "clicks" and "page scrolling" keep working normally
			if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < DRAG_THRESHOLD) return;
			p.moved = true;
			try {
				navigator.vibrate?.(6);
			} catch {
				// iOS: SecurityError → ignore
			}
			ensureGsap().to(icon!, { scale: 1.06, duration: 0.15, ease: EASE.out });
		}
		e.preventDefault();
		// grab offset: the button follows the finger without jumping to center; quickTo provides interpolated smoothing
		const targetX = Math.min(Math.max(e.clientX - grabDX, minX), maxX);
		const targetY = Math.min(Math.max(e.clientY - grabDY, minY), maxY);
		btnX = targetX;
		btnY = targetY;
		quickX?.(targetX);
		quickY?.(targetY);
		const now = performance.now();
		p.samples.push({ x: targetX, y: targetY, t: now });
		if (p.samples.length > 8) p.samples.shift();
		p.lastX = e.clientX;
		p.lastY = e.clientY;
		p.lastT = now;
	}

	function handlePointerUp(e: PointerEvent): void {
		const p = pointer;
		if (!p || e.pointerId !== p.id) return;
		pointer = undefined;
		detachDragListeners();
		quickX = undefined;
		quickY = undefined;
		if (!p.moved) {
			// below the drag threshold → pure click; let the subsequent click open the panel
			consumePendingAnchorSync();
			return;
		}
		ensureGsap().to(icon!, { scale: 1, duration: 0.2, ease: EASE.out });
		lastDragAt = performance.now();
		fling(p);
	}

	function fling(p: NonNullable<typeof pointer>): void {
		lastDragAt = performance.now();
		const gsap = ensureGsap();
		const recent = p.samples.filter((s) => p.lastT - s.t < 160);
		let vx = 0;
		let vy = 0;
		if (recent.length >= 2) {
			const a = recent[0];
			const b = recent[recent.length - 1];
			const dt = (b.t - a.t) / 1000;
			if (dt > 0) {
				vx = (b.x - a.x) / dt;
				vy = (b.y - a.y) / dt;
			}
		}
		if (Math.hypot(vx, vy) < 60) {
			snapX(0);
			return;
		}
		const speed = Math.hypot(vx, vy);
		const duration = Math.min(Math.max(speed / 1400, 0.35), 1.1);
		const targetX = Math.min(Math.max(btnX + vx * 0.22, minX), maxX);
		const targetY = Math.min(Math.max(btnY + vy * 0.22, minY), maxY);
		inflight?.kill();
		inflight = gsap.to(morph!, {
			x: targetX,
			y: targetY,
			duration,
			ease: EASE.out,
			overwrite: 'auto', // kill leftover quickTo so the button isn't yanked back to the old position right after a drag
			onUpdate: () => {
				btnX = (gsap.getProperty(morph!, 'x') as number) || btnX;
				btnY = (gsap.getProperty(morph!, 'y') as number) || btnY;
			},
			onComplete: () => {
				btnX = targetX;
				btnY = targetY;
				inflight = undefined;
				snapX();
			}
		});
	}

	/* * X-axis snapping: button center in the left half → left edge; right half → right edge */
	function snapX(duration = 0.4): void {
		if (!morph) return;
		const gsap = ensureGsap();
		const snap = btnX + FAB / 2 < window.innerWidth / 2 ? minX : maxX;
		inflight?.kill();
		inflight = gsap.to(morph!, {
			x: snap,
			duration,
			ease: EASE.out,
			overwrite: 'auto',
			onUpdate: () => {
				btnX = (gsap.getProperty(morph!, 'x') as number) || btnX;
				btnY = (gsap.getProperty(morph!, 'y') as number) || btnY;
			},
			onComplete: () => {
				btnX = snap;
				inflight = undefined;
				updateVerticalAnchor();
				// a drag always lands: snap to the anchor, or free-fall back within bounds (bookkeeping sync is superseded by this step)
				pendingAnchorSync = false;
				const prevY = btnY;
				syncAnchorPosition();
				persistPosition();
				if (Math.abs(btnY - prevY) > 0.5) anchorTween();
			}
		});
	}

	function persistPosition(): void {
		try {
			localStorage.setItem(POS_KEY, JSON.stringify({ x: btnX, y: btnY, anchor: verticalAnchor }));
		} catch {
			// unavailable → no persistence
		}
	}

	// --- click handling ---
	function onButtonClick(e: MouseEvent): void {
		// clicks shortly after a drag ends (pointerup dispatches right after) are all swallowed
		if (performance.now() - lastDragAt < 500) {
			e.preventDefault();
			e.stopPropagation();
			return;
		}
		if (mode === 'panel') closePanel();
		else if (mode === 'floating' && !morphTl) openPanel();
	}

	function onCloseClick(): void {
		closePanel();
	}

	function onCloseLinkClick(): void {
		closePanel();
	}
</script>

<div class="toc-fab" bind:this={rootEl} data-toc-fab>
	<div
		class="fab-morph"
		class:open={mode === 'panel'}
		bind:this={morph}
		onpointerdown={onFabPointerDown}
	>
		<button
			class="fab-icon"
			bind:this={icon}
			type="button"
			aria-label={m.post_toc()}
			aria-expanded={mode === 'panel'}
			aria-controls="toc-fab-content"
			onclick={onButtonClick}
		>
			<span class="fab-line"></span>
			<span class="fab-line"></span>
		</button>

		<button
			class="fab-close"
			bind:this={closeBtn}
			type="button"
			aria-label={m.toc_close()}
			onclick={onCloseClick}
		>
			<span class="fab-close-x" aria-hidden="true"></span>
		</button>

		<button
			class="fab-reset"
			bind:this={resetBtn}
			type="button"
			aria-label={m.toc_reset()}
			onclick={onResetClick}
		>
			<span class="fab-reset-icon" aria-hidden="true">⌖</span>
		</button>

		<div
			id="toc-fab-content"
			class="fab-content"
			bind:this={content}
			role="dialog"
			aria-label={m.post_toc()}
		>
			<p class="fab-title">{m.post_toc()}</p>
			<ul>
				{#each items as item (item.id)}
					<li class:depth-3={item.depth === 3}>
						<a href="#{item.id}" onclick={onCloseLinkClick}>{item.text}</a>
					</li>
				{/each}
			</ul>
		</div>
	</div>
</div>

<style>
	.toc-fab {
		display: none;
	}

	/* mobile only: desktop/tablet keep the original TOC */
	@media (max-width: 767px) {
		.toc-fab {
			display: block;
		}

		.fab-morph {
			position: fixed;
			left: 0;
			top: 0;
			width: 3.5rem;
			height: 3.5rem;
			border-radius: 1.75rem;
			background: var(--color-accent);
			border: 1px solid transparent;
			box-shadow: 0 0.5rem 1.5rem rgb(0 0 0 / 0.3);
			--toc-safe-bottom: env(safe-area-inset-bottom, 0px);
			z-index: 80;
			visibility: hidden;
			/* own compositing layer: fixed elements don't repaint-jump during iOS scroll/toolbar animations */
			will-change: transform;
			/* circle state: draggable in all directions (native scrolling stays out); panel state restores overflow auto so lists scroll */
			touch-action: none;
			overflow: hidden;
			cursor: grab;
			-webkit-tap-highlight-color: transparent;
			user-select: none;
			-webkit-user-select: none;
		}

		.fab-morph.open {
			touch-action: auto;
			cursor: default;
		}

		.fab-icon {
			position: absolute;
			inset: 0;
			z-index: 0;
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			gap: 5px;
			border: none;
			background: none;
			cursor: grab;
			padding: 0;
			-webkit-tap-highlight-color: transparent;
		}

		.fab-line {
			display: block;
			width: 1.125rem;
			height: 2px;
			border-radius: 2px;
			background: var(--color-accent-ink);
		}

		.fab-close,
		.fab-reset {
			position: absolute;
			top: 0.625rem;
			z-index: 5;
			width: 1.75rem;
			height: 1.75rem;
			display: flex;
			align-items: center;
			justify-content: center;
			border: none;
			border-radius: 50%;
			background: color-mix(in srgb, var(--color-ink) 8%, transparent);
			color: var(--color-ink);
			cursor: pointer;
			-webkit-tap-highlight-color: transparent;
		}

		.fab-close {
			right: 0.75rem;
		}

		.fab-reset {
			right: 3rem;
			font-size: 0.875rem;
			font-family: var(--font-mono);
		}

		.fab-close-x {
			position: relative;
			width: 0.625rem;
			height: 0.625rem;
		}

		.fab-close-x::before,
		.fab-close-x::after {
			content: '';
			position: absolute;
			left: 50%;
			top: 50%;
			width: 0.75rem;
			border-radius: 2px;
			background: var(--color-ink);
		}

		.fab-close-x::before {
			height: 2px;
			transform: translate(-50%, -50%) rotate(45deg);
		}

		.fab-close-x::after {
			height: 2px;
			transform: translate(-50%, -50%) rotate(-45deg);
		}

		.fab-content {
			position: absolute;
			inset: 0;
			z-index: 1;
			display: flex;
			flex-direction: column;
			padding: 0.75rem 1.25rem 1rem;
		}

		.fab-title {
			font-family: var(--font-mono);
			font-size: 0.75rem;
			font-weight: 500;
			letter-spacing: 0.08em;
			text-transform: uppercase;
			color: var(--color-ink-muted);
			margin: 0 5.25rem 0.75rem 0;
		}

		.fab-content ul {
			list-style: none;
			padding: 0;
			margin: 0;
			display: flex;
			flex-direction: column;
			gap: 0.5rem;
			border-left: 1px solid var(--color-line);
			overflow-y: auto;
			flex: 1;
			min-height: 0;
		}

		.fab-content li {
			padding-left: 0.75rem;
			margin-left: -1px;
		}

		.fab-content li.depth-3 {
			padding-left: 1.5rem;
		}

		.fab-content a {
			display: block;
			padding: 0.125rem 0;
			color: var(--color-ink-muted);
			text-decoration: none;
			font-size: 0.875rem;
			transition: color 0.2s ease;
		}

		.fab-content a:hover {
			color: var(--color-ink);
		}
	}
</style>
