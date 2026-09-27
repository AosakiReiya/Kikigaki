/**
 * Sandbox bridge — controlled runtime injected into srcdoc (the untrusted component's only outward interface).
 * Maintained as a plain ES string (no module system inside srcdoc); cc/1 protocol matches host contract.ts.
 *
 * window.CC exposed to components:
 *   CC.onInit(cb)            → { name, props, capabilities }
 *   CC.request(cap, params)  → Promise (host default-deny; rejects with Error)
 *   CC.theme()               → Promise<Record<string,string>>
 *   CC.onTheme(cb)
 *   CC.error(msg)
 * Auto-reports: height (ResizeObserver), runtime errors.
 */
export const BRIDGE_JS = `
(function () {
	var CH = window.__CC_CH__;
	var SEQ = 0, REQ = 0;
	var pending = {}, initCb = null, themeCbs = [];
	function post(type, payload, id) {
		try {
			parent.postMessage({ v: 'cc/1', ch: CH, seq: ++SEQ, type: type, id: id, payload: payload }, '*');
		} catch (e) { /* payload 不可序列化：静默丢 */ }
	}
	window.CC = {
		onInit: function (cb) { initCb = cb; },
		onTheme: function (cb) { themeCbs.push(cb); },
		request: function (capability, params) {
			return new Promise(function (resolve, reject) {
				var id = ++REQ;
				pending[id] = { resolve: resolve, reject: reject };
				post('capability-request', { capability: String(capability), params: params === undefined ? null : params }, id);
			});
		},
		error: function (msg) { post('error', { message: String(msg) }); },
		log: function (msg) { post('log', { message: String(msg) }); }
	};
	window.addEventListener('message', function (e) {
		var d = e.data;
		if (!d || d.v !== 'cc/1' || d.ch !== CH) return;
		if (d.type === 'init') {
			if (initCb) { try { initCb(d.payload || {}); } catch (err) { window.CC.error(err && err.message); } }
		} else if (d.type === 'theme') {
			themeCbs.forEach(function (cb) { try { cb(d.payload || {}); } catch (err) {} });
		} else if (d.type === 'capability-result') {
			var p = pending[d.id];
			if (!p) return;
			delete pending[d.id];
			var r = d.payload || {};
			if (r.ok) p.resolve(r.data); else p.reject(new Error(String(r.error || 'denied')));
		} else if (d.type === 'dispose') {
			document.documentElement.innerHTML = '';
		}
	});
	window.addEventListener('error', function (e) { window.CC.error(e.message || 'sandbox error'); });
	function reportHeight() {
		var h = Math.ceil(document.documentElement.getBoundingClientRect().height);
		post('resize', { height: h });
	}
	function watchSize() {
		if (!document.body) return;
		if (window.ResizeObserver) { new ResizeObserver(reportHeight).observe(document.body); }
		reportHeight();
	}
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', watchSize);
	} else {
		watchSize();
	}
	post('ready', { ua: 'cc-sandbox' });
})();
`;
