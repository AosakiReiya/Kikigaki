# create-extension

Package capabilities as one installable **extension manifest** (P83c). An
extension is a JSON document that lands content types, components, slot
assignments and settings defaults in one shot — the packaging layer over the
three registries (content types 79b, components/workshop, slots P83a).

## When to use

- Bundling a feature that spans layers (e.g. "shop" = products type + buy
  components + slot wiring + settings defaults).
- Shipping a site feature to another Kikigaki install (copy/paste one JSON).
- Letting the AI agent propose a whole feature as one reviewable unit
  (`install_extension` tool, approval card shows the manifest).

## Manifest shape

```json
{
	"id": "my-ext", // ^[a-z][a-z0-9-]{0,39}$ — registry slug
	"name": "My Extension", // ≤80 chars
	"version": "1.0.0", // \d+(\.\d+){0,2}
	"description": "…", // ≤300
	"core": ">=1", // informational (recorded, not enforced in v1)
	"contentTypes": [
		{
			"key": "notes", // ^[a-z][a-z0-9-]{1,30}$, reserved keys rejected
			"label": "Notes",
			"titleField": "title",
			"fields": [{ "key": "title", "kind": "text", "required": true, "max": 80 }]
		}
	],
	"components": [{ "name": "hello-card", "code": "<div class=\"hello-cc\">hi</div>" }],
	"slots": { "post.after": ["hello-card"] },
	"settings": { "greeting": "hi" },
	"capabilities": ["commerce"]
}
```

Rules worth knowing:

- **contentTypes are create-only**: an existing type is skipped, never
  clobbered (site customizations win).
- **components** follow workshop rules: Svelte 5 runes, no external imports,
  ≤100KB source. They land in the component registry (+ `custom_components`)
  and become slot-assignable; public render is client-compiled.
- **slots** merge into `slot_assignments` (append, de-dup, cap 8/slot).
  Slot names: `home.hero`, `post.before`, `post.after`, `about.after`,
  `item.detail.before`, `item.detail.after`, `admin.dashboard`.
- **settings** seed `plugin.<id>` ONCE (never overwrite existing user values).
- AI-source installs (`install_extension` tool) land as review **pending** in
  the registry until approved; admin-UI installs are approved immediately.
- Caps: 12 types, 12 components, 256KB total manifest.

## Install / rollback / uninstall

- Admin UI: `/admin/registry` → 「安裝擴展（manifest JSON）」textarea.
- Agent: `install_extension` (manifest string), `rollback_extension`
  (id + version from `list_registry` history).
- Rollback = registry snapshot restore + re-land old manifest side effects
  (types stay create-only, so rollback never deletes data).
- **Uninstall is data-preserving**: slots/components/settings removed;
  content types + items stay (delete explicitly in `/admin/content`).

## Example: the shop packaging

See `manifest.test.ts` → "shop packaging example" — the 79e commerce surface
expressed as an extension (products type with the price/file contract).

## Verify

```bash
pnpm exec vitest run src/lib/server/extensions   # validator units
node .e2e-archive/p83c.mjs                        # install→render→uninstall chain
```
