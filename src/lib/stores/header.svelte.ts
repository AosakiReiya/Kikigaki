let visible = $state(true);

export function getHeaderVisible(): boolean {
	return visible;
}

export function setHeaderVisible(v: boolean): void {
	if (v !== visible) visible = v;
}
