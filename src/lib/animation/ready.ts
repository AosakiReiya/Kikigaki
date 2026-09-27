type Listener = () => void;

let ready = false;
const listeners = new Set<Listener>();

/* * called when the preloader ends (or is skipped) */
export function markReady(): void {
	ready = true;
	listeners.forEach((fn) => fn());
	listeners.clear();
}

/* * entrance animations all queue through here — on first load they wait for the preloader to end */
export function whenReady(fn: Listener): void {
	if (ready) {
		fn();
	} else {
		listeners.add(fn);
	}
}
