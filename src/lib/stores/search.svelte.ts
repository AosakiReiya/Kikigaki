/** search overlay toggle (root layout mounts SearchOverlay; any pack's header just needs a trigger button) */
let open = $state(false);

export function openSearch() {
	open = true;
}
export function closeSearch() {
	open = false;
}
export function searchOpen() {
	return open;
}
