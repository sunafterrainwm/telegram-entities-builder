# Changelog

This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html). While
the major version is `0`, a minor bump may still break the API.

Bot API versions named below are the versions a feature needs from the server; they are
taken from the `@grammyjs/types` release the package is built against, never from the Bot
API documentation's current state.

## 0.5.0 — 2026-10-26

Still targets `@grammyjs/types` 5.x (**Bot API 10.3**). The rich block builders are
rewritten around block references, and the bound format helpers are gone. The classic
entity builders and the parsers are unchanged apart from one added overload.

### Breaking

- **Every rich block method returns a reference instead of `this`, and no longer takes
  the block's content.** A block method fixes the block's position immediately; the
  content is written through the reference afterwards and resolved by `build()`. This is
  what makes it possible to position a block before its content is known, which plain
  resolution at call time cannot express.

  | 0.4.x                               | 0.5.0                                         |
  | ----------------------------------- | --------------------------------------------- |
  | `b.paragraph('x')`                  | `b.add(fr`x`)` or `` b.add`x` ``              |
  | `b.heading('x', 2)`                 | `b.heading(2).add('x')`                       |
  | `b.footer(fr`…`)`                   | `b.footer().add(fr`…`)`                       |
  | `b.preformatted('x', 'ts')`         | `b.preformatted({ language: 'ts' }).add('x')` |
  | `b.list(items)` / `b.list(cb)`      | `b.list()`, then `.text(…)` / `.item(…)`      |
  | `b.blockquote(blocks, { credit })`  | `b.blockquote({ credit }).add(blocks)`        |
  | `b.details(s, blocks, { is_open })` | `b.details(s, { is_open }).add(blocks)`       |
  | `b.collage(blocks, opts)`           | `b.collage(opts).add(blocks)`                 |
  | `b.thinking('x')`                   | `b.thinking().add('x')`                       |

  A reference **is** the builder for its own content, so there is no container property
  to go through. `details` is the exception: the reference is its block list, and the
  always-visible summary is a `RichTextRef` at `details.summary`, which carries its own
  freeze state — `details.finish()` freezes the summary too, while `summary.finish()`
  freezes the summary alone.

- **`RichBlockBuilder.blocks` is removed.** `build({ checkEmpty: false })` already
  returned the same snapshot.
- **`builder.f` and `builder.fr` are removed.** Use the free helpers through `add()`:
  `builder.add(f.bold`hi`)`. The bound form mutated the builder while the free form of
  the same name returned a new one, and it was the only reason `createFormatter` carried
  a runtime `Interface`, an `instanceof` dispatch and a second overload on each helper
  type — all of which are gone with it.
- **`BoundFormatText` is now `FormatTextHelpers`, `BoundFormatRichText` is now
  `FormatRichTextHelpers`.** Nothing is bound any more.
- **`build()` now validates.** It throws `TypeError` when a field the Bot API refuses to
  accept empty is empty: `heading.text`, `footer.text`, `list.items`, `details.blocks`, a
  list item's `blocks`, and the top-level block list. Pass
  `build({ checkEmpty: false })` to skip the checks. `buildMessage()` and `buildInline()`
  take the same options.

  `paragraph.text` and `details.summary` may be empty, because the Bot API accepts both —
  these rules were measured against the live API, not read off the documentation, which
  disagrees with the server. See `agents/rich-limit.md`.

### Added

- **Block references**: `RichRef`, `RichBlockRef`, `ReadonlyRichBlockRef`,
  `RichTextBlockRef`, `RichBlocksRef`, `RichDetailsRef`, `RichListRef`, `RichLeafRef`
  and `RichTextRef`.
  `finish()` freezes a reference and everything nested inside it; a later write throws.
  `build({ finish: true })` does the same from the root. A plain `build()` freezes
  nothing and may be called repeatedly.
- **`RichBlockBuilder.lastBlock`**, a reference to the last block, or `undefined`. A block
  appended with `addBlock` comes back as a `ReadonlyRichBlockRef` carrying only `type`.
- **Measuring**: `RichTextBuilder.measureText()` and `RichBlockBuilder.measureBlock()`,
  plus `richMessageLimits` and `RichBlockMeasurement`. The unit is Unicode **code
  points**, which is what the Bot API counts — not the UTF-16 code units used by
  `MessageEntity.offset` on the classic side. `measureBlock()` deliberately does not go
  through `build()`, so a tree that is still being filled in can be measured.
- **`RichBlockBuilder.assertWithinLimits()`**, which throws `RangeError` past 32768 code
  points, 500 top-level blocks or a nesting depth of 16. It is never called for you:
  running out of budget is something a caller plans for, and this package does not
  truncate.
- **Tagged-template `add()`** on `RichTextBuilder`, `RichBlockBuilder`, `EntityBuilder`
  and `LazyEntityBuilder`: `` builder.add`a${f.bold`b`}c` ``. On a block builder it
  appends a paragraph.
- **`add()` wraps a bare builder**: a `RichTextBuilder` becomes a paragraph and a
  `RichListBuilder` becomes a list, so a single expression of rich text can stand in for
  a block.
- **`RichListBuilder` gained `addItem`, `addItems`, `isEmpty`, `clone` and `fork`**,
  matching the other two builders.

### Documentation

- **`agents/rich-limit.md`** records the rich message limits as measured against the live
  Bot API on 2026-10-21, with the error strings, the three candidate text units that were
  bisected, and the limits that were **not** measured. Two widely repeated claims are
  wrong: the 500-block cap counts the top-level array only, and the text unit is code
  points rather than UTF-8 characters.
- **`agents/rich-builders.md`** records the reference rules, why there can be no
  block-level `fr`, and the traps around `collapse()`.

## 0.4.0 — 2026-10-20

Targets `@grammyjs/types` 5.x, which tracks **Bot API 10.3**. The package grew from one
file of entity plumbing into three parts — classic messages, rich messages and parsers —
so this release is large and not backward compatible.

### Breaking

- **`@grammyjs/types` >= 5.0.0 is now required** (`peerDependencies` was `>=3`).
- **`MessageComposer` is now `MessageBuilder`**, including the default export.
- **`buildTextPayload()`, `buildCaptionPayload()` and `buildInlinePayload()` are now
  `buildText()`, `buildCaption()` and `buildInline()`.**
- **`TTextPayload`, `TCaptionPayload` and `TInlinePayload` are now `InputText`,
  `InputCaption` and `InputInline`**, matching the Bot API's own `Input*` naming.
- **`EntityBuilder.mergePayload()` is now `mergeContent()`.**
- **`IEntityBuilderBase` and `IEntityBuilder` are abstract classes rather than
  interfaces**, so `implements` becomes `extends` and `instanceof` now works — which is
  what lets a builder be passed around as a resolvable item. They also declare the new
  members below, so an external implementation has to grow with them.
- `buildText()` and `buildInline()` no longer emit `link_preview_options: undefined` when
  no options were set; the key is absent instead.
- `addTextEntities()` no longer attaches zero-length entities to empty text, which
  Telegram rejects. It now behaves like `addTextEntity()` always did.
- The single `src/index.ts` was split into `src/message.ts`, `src/rich-message/`,
  `src/parse/` and `src/utils/`. Nothing changes for anyone importing from the package
  root, but deep imports into `src/` have moved.

### Added

#### Classic messages

- Entity composition that reads like the text it builds: `add()` plus `bold()`,
  `italic()`, `underline()`, `strikethrough()`, `spoiler()`, `blockquote()`,
  `expandableBlockquote()`, `code()`, `pre()`, `mention()`, `hashtag()`, `cashtag()`,
  `botCommand()`, `emailAddress()`, `phoneNumber()`, `url()`, `textMention()`,
  `customEmoji()` and `dateTime()`, each taking a `ResolvableEntityItem` — a string, a
  segment, a callback, another builder, or any nesting of those.
- `formatText` and the `f` helpers, for tagged-template composition such as
  ``formatText`Hello ${f.bold`World`}!` ``. Every helper is also reachable bound to an
  instance through `builder.f`.
- `date_time` entities (Bot API 9.5), through `dateTime()` and `f.dateTime`.
- `EntityBuilder.toSegments()`, which flattens accumulated content into `TextSegment[]`
  and is how one builder's content is appended to another.

#### Rich messages

- `RichMessageBuilder`, which emits `InputRichMessage.blocks` — structured blocks that
  `sendRichMessage` takes as they are (Bot API 10.2). Nothing is serialized to HTML or
  Markdown on the way out.
- `RichBlockBuilder`, generic over the client's file type (`F = never`, so only file
  identifiers and URLs unless you parameterize it), covering every input block: headings,
  paragraphs, preformatted text, footers, dividers, formulas, anchors, lists, block and
  expandable quotations, pullquotes, collages, slideshows, tables, details, maps,
  animations, audio, documents, photos, videos, voice notes, button rows and thinking
  placeholders.
- `RichTextBuilder` and `RichListBuilder`, plus `formatRichText` and the `fr` helpers.
- `button`, a set of factories for every `RichMessageButton` kind (Bot API 10.3).
- Table cells accept plain rich text and fill in the `align`/`valign` the Bot API
  requires; list items no longer have to carry the receive-only `label`.

#### Parsing

- `parseHtml()`, `parseMarkdownV2()`, `parseMarkdown()` and `parseEntities()`, which turn
  a `parse_mode` string into text plus entities. These are ports of tdlib's own
  `parse_html`, `parse_markdown_v2` and `parse_markdown`, so they accept and reject what
  the server does.
- `parseRichHtml()`, `parseRichText()`, `parseRichMarkdown()` and `richMarkdownToHtml()`,
  which turn rich markup into blocks. Telegram parses those fields server-side, so these
  follow the documented syntax and can differ from the server in corners — send the
  markup as `rich_message.html` or `rich_message.markdown` when exactness matters.
- A `weak` option on both HTML parsers that never throws: an unsupported tag keeps its
  text and loses its markup, an entity that cannot be built is left out, a stray end tag
  is ignored, an unclosed one is closed at the end of the input, and a malformed tag is
  skipped.
- An `on` option that rewrites the elements with no Telegram equivalent, keyed by a small
  CSS-like selector. A handler is told its `parent` and `index`, which is enough to number
  an ordered list without keeping a counter. `HtmlTransform`, `EntityTransform`,
  `RichTransform` and `HtmlSelectorMap` package the same options for reuse.
- `ParseError`, which carries the offending offset in UTF-16 code units as `.position`.

#### Other

- `escapeHtml()`, for text going into hand-written Telegram HTML.
- `@since Bot API x.y` on every builder and rich message declaration, so the version a
  feature needs is visible where it is used. The parsers carry none on purpose: parsing
  is local and has no server to agree with.

### Fixed

- `sliceInplace(0, 0)` left the text untouched instead of emptying it, because the guard
  treated `0` as "no argument given".
- `addTextEntities()` produced zero-length entities for empty text.
- `MessageBuilder.buildText()` always carried a `link_preview_options` key, even when it
  was `undefined`.

## 0.3.0 — 2026-06-07

No changelog was kept for this release.

## 0.2.0 — 2026-06-05

No changelog was kept for this release.

## 0.1.1 – 0.1.4 — 2026-06-05

No changelog was kept for these patch releases.

## 0.1.0 — 2026-06-05

Initial release.
