# AGENTS.md

Notes for whoever (or whatever) maintains this package next.

## Reference documents

The detail lives in `agents/`. Two rules about those documents, and they are not
suggestions:

1. **Read the one that covers what you are about to change, before you change it.** Each
   is the only specification its area has — the behaviour it describes was chosen, not
   derived, so you cannot reconstruct it from the code.
2. **Revise it in the same commit as the change.** A reference that disagrees with the
   code is worse than no reference, because the next reader trusts it. If a change makes
   an entry wrong, rewrite the entry; if it adds a decision, add an entry.

| Read before                                                            | Document                                            |
| ---------------------------------------------------------------------- | --------------------------------------------------- |
| bumping `@grammyjs/types`, adding `@since`, answering "which version?" | [bot-api-versions.md](./agents/bot-api-versions.md) |
| touching `parseHtml`, `parseMarkdownV2`, `parseMarkdown`               | [tdlib-port.md](./agents/tdlib-port.md)             |
| touching `parseRichHtml`, `parseRichMarkdown`, the HTML tokenizer      | [rich-parsers.md](./agents/rich-parsers.md)         |
| touching `weak`, `on`, selectors, handlers, `HtmlTransform`            | [parse-options.md](./agents/parse-options.md)       |

## What this package is

A builder and a parser for Telegram Bot API message content, typed against
`@grammyjs/types`. Three separate worlds:

| Area             | Entry points                                                                                                                                  | Shape                                   |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Classic messages | `EntityBuilder`, `LazyEntityBuilder`, `MessageBuilder`, `formatText`/`f`                                                                      | flat string + `MessageEntity[]` offsets |
| Rich messages    | `RichMessageBuilder`, `RichBlockBuilder`, `RichTextBuilder`, `RichListBuilder`, `formatRichText`/`fr`, `button`                               | tree of `InputRichBlock` / `RichText`   |
| Parsing          | `parseHtml`, `parseMarkdownV2`, `parseMarkdown`, `parseEntities`, `parseRichHtml`, `parseRichMarkdown`, `parseRichText`, `richMarkdownToHtml` | markup → the two shapes above           |

There is deliberately **no** serializer back to HTML or Markdown. The Bot API accepts
`entities` and `rich_message.blocks` directly, so converting to markup only loses
information. `escapeHtml` stays because hand-written HTML still needs it.

## Current target

- `@grammyjs/types` **5.x** → Telegram **Bot API 10.3**.
- `peerDependencies` says `>=5.0.0`; `devDependencies` pins `^5.0.0`.
- `pnpm-workspace.yaml` lists `@grammyjs/types` under `minimumReleaseAgeExclude` so a
  fresh release can be picked up immediately.

```sh
npm view @grammyjs/types version    # what the target should be
```

How that version is chosen, which Bot API version each release covers, and the
per-feature map the `@since` tags come from:
[bot-api-versions.md](./agents/bot-api-versions.md).

## Conventions

- Tabs, single quotes, semicolons, `printWidth` 90 (`.prettierrc`). Run `pnpm run lint`
  (`eslint --fix`) and `prettier --write`; `husky` + `lint-staged` do it on commit.
- `pnpm test` is `tsc && jest`. Everything must typecheck with `strict`.
- Imports use explicit `.ts` extensions (`allowImportingTsExtensions`, NodeNext).
- Every public declaration needs: a one-sentence summary, `@param` per parameter,
  `@returns` and `@category`. Builder methods also get
  `@returns The current builder instance for chaining.` The `@skillit/typedoc` report in
  `pnpm run docs` enforces this.
- `@since Bot API x.y` goes only where a feature needs that version of the server, and
  never in `src/parse` — see [bot-api-versions.md](./agents/bot-api-versions.md).
- Builders never mutate what they return: `build()`, `blocks` and `toSegments()` hand
  back fresh arrays. Rich blocks are shallow-copied on `clone()` because they may hold
  file handles that `structuredClone` cannot copy — treat built blocks as immutable.
- `src/parse` turns `@typescript-eslint/no-unnecessary-condition` off (see
  `eslint.config.js`). `noUncheckedIndexedAccess` is off project-wide, so TypeScript
  types string/array indexing and regular-expression capture groups as always defined
  while at runtime they are not; the rule would flag exactly the guards that keep the
  parsers from crashing. Turning `noUncheckedIndexedAccess` on would be the better fix
  and costs about 50 call sites across the package — worth doing, not yet done.
- `src/parse/internal.ts` and `src/parse/html-tree.ts` are internal. Do not re-export
  their helpers from `src/parse/index.ts`; the typedoc report turns leaked internals into
  fatals.

## Layout

```
src/
  index.ts                 barrel + package documentation
  cjs.cts                  CJS interop shim
  message.ts               classic entity builders, escapeTag, formatText/f
  rich-message/
    text.ts                RichTextBuilder, button factories, formatRichText/fr
    block.ts               RichBlockBuilder, RichListBuilder, cell/caption helpers
    message.ts             RichMessageBuilder
  parse/
    internal.ts            char helpers, character references, tg:// links  (internal)
    html-tree.ts           shared HTML tokenizer                            (internal)
    transform.ts           selectors, HtmlTransform, the weak/on plumbing
    entities.ts            parseHtml / parseMarkdownV2 / parseMarkdown / parseEntities
    rich-html.ts           parseRichHtml / parseRichText
    rich-markdown.ts       parseRichMarkdown / richMarkdownToHtml
    index.ts               public re-exports
  utils/
    formatter.ts           createFormatter, behind f and fr
    html.ts                escapeHtml
agents/                    the reference documents above
tests/                     mirrors src/
```

### One trap in `src/utils/formatter.ts`

`ParamsOf<T>` exists because `Parameters<T & ((...args: unknown[]) => unknown)>` resolves
against the catch-all signature and collapses every parameter list to `unknown[]`, which
silently made `f.url(…)` and `fr.textMention(…)` untypable. Infer the tuple directly;
never reintroduce the intersection.
