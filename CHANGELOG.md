# Changelog

This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html). While
the major version is `0`, a minor bump may still break the API.

Bot API versions named below are the versions a feature needs from the server; they are
taken from the `@grammyjs/types` release the package is built against, never from the Bot
API documentation's current state.

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
