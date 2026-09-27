# Skill: Add a Content Type (79b–79d registry)

> Trigger: user wants a new first-class content kind — portfolio, events, book
> reviews, products. Do NOT reach for pages/posts hacks; the registry does this.

## Decision first: DB type or code type?

- **DB dynamic type** (default): created via `/admin/content` or the agent tool
  `create_content_type` (risk: high — one approval card). Gets admin CRUD, public
  list `/key`, detail `/key/slug`, sitemap inclusion — zero code, zero deploy.
- **Code type**: only when it needs dedicated tables/SQL performance or bespoke
  loaders (like posts does). Copy `content-types/index.ts` builtins pattern.

## Manifest shape (the contract is the validator, not the form)

```json
[
	{ "key": "title", "kind": "text", "required": true, "max": 80 },
	{ "key": "body", "kind": "markdown" },
	{ "key": "date", "kind": "date" },
	{ "key": "cover", "kind": "media" },
	{ "key": "stack", "kind": "repeater" }
]
```

kinds: `text | markdown | media | repeater | boolean | date | select` (select needs
`options: []`). Field key: `^[a-zA-Z][a-zA-Z0-9_]*$`. `titleField` (default `title`)
must exist — it names list rows and detail `<h1>`.

## Hard rules (server-enforced, don't fight them)

- Type `key`: `^[a-z][a-z0-9-]{1,30}$`, **reserved**: `posts/pages/series`, every
  top-level route segment (`blog`, `search`, `about`…), locale prefixes (`en`, `jp`,
  `zh-cn`, `zh-tw`…), theme route slugs (`services`, `contact`…), published page
  slugs. Creating `blog` would shadow the blog — rejected on purpose.
- Items carry one base-language JSON payload (`content_items.data`); per-item
  translations are a documented gap, not a missing-feature surprise.
- Only `published` items render publicly or enter the sitemap; markdown fields are
  server-rendered (`renderMarkdown`) — the detail component never `new Function`s.

- Commerce contract (79e): a type behaves as a digital-goods storefront only when a
  `text` field named `price` holds a two-decimal string (`"12.00"`; integer = whole
  unit; JPY/TWD are zero-decimal) **and** a `media` field named `file` points at a
  private `goods/…` R2 key. Detail pages then show a buy bar; checkout/webhook/
  token-gated download are automatic. Providers come from env only:
  `STRIPE_SECRET` + `STRIPE_WEBHOOK_SECRET`, or `PAYMENT_PROVIDER=mock` **and**
  `ALLOW_MOCK_PAYMENTS=1` (never both true in production).

## Verify

```bash
# UI route: /admin/content → new type → manage items → "公開頁 ↗"
# Agent route: ask ✦ AI Agent for the type; approval card must show the manifest.
curl -s localhost:5199/sitemap.xml | grep /yourkey
node .e2e-archive/p79d.mjs   # existing public-render suite
```
