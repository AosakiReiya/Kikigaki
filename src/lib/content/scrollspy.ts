/**
 * Section reading spy (Phase 58.8): single scroll listener returning
 * - id: the h2/h3 section currently at the reading line (28% of viewport height; null if none)
 * - progress: reading progress within that section 0..1 (section end = next section top; last = body end)
 * Shared by the book reader and standard post pages; the TOC underline track visualizes it directly.
 * 58.13 additions: idx/total/overall — whole-document reading depth (vertical progress track fill).
 */
export interface SpyState {
	id: string | null;
	progress: number;
	idx: number;
	total: number;
	overall: number;
}

export function scrollSpy(root: HTMLElement, onChange: (s: SpyState) => void): () => void {
	let raf = 0;
	const measure = () => {
		raf = 0;
		const anchor = window.innerHeight * 0.28;
		const heads = Array.from(root.querySelectorAll<HTMLElement>('h2[id], h3[id]'));
		let idx = -1;
		for (let i = 0; i < heads.length; i++) {
			if (heads[i].getBoundingClientRect().top <= anchor) idx = i;
		}
		if (idx === -1) {
			onChange({ id: null, progress: 0, idx: -1, total: heads.length, overall: 0 });
			return;
		}
		const top = heads[idx].getBoundingClientRect().top;
		const bottom =
			idx + 1 < heads.length
				? heads[idx + 1].getBoundingClientRect().top
				: root.getBoundingClientRect().bottom;
		const span = Math.max(1, bottom - top);
		const progress = Math.min(1, Math.max(0, (anchor - top) / span));
		onChange({
			id: heads[idx].id,
			progress,
			idx,
			total: heads.length,
			overall: heads.length ? Math.min(1, (idx + progress) / heads.length) : 0
		});
	};
	const onEvent = () => {
		if (!raf) raf = requestAnimationFrame(measure);
	};
	measure();
	window.addEventListener('scroll', onEvent, { passive: true });
	window.addEventListener('resize', onEvent, { passive: true });
	return () => {
		window.removeEventListener('scroll', onEvent);
		window.removeEventListener('resize', onEvent);
		if (raf) cancelAnimationFrame(raf);
	};
}
