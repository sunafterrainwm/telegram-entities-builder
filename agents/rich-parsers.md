# The rich parsers, an interpretation rather than a port

Reference for [AGENTS.md](../AGENTS.md). Read this before touching
`src/parse/rich-html.ts`, `src/parse/rich-markdown.ts` or `src/parse/html-tree.ts`.
Revise it in the same commit as the change it describes: every entry below is a decision
with no external authority behind it, so an undocumented one is a decision nobody can
check.

tdlib has **no** local parser for rich HTML or rich Markdown: Telegram parses the `html`
and `markdown` fields of `InputRichMessage` server-side. `src/parse/rich-html.ts` and
`src/parse/rich-markdown.ts` are therefore written against the syntax documented in the
`InputRichMessage` docs (reproduced verbatim in `@grammyjs/types`' `rich.d.ts`), and they
can disagree with the server. Anything that must be exact should be sent as `html` or
`markdown` and parsed by Telegram.

## Choices made where the documentation does not say

- `parseRichMarkdown` translates to rich HTML (`richMarkdownToHtml`) and then runs
  `parseRichHtml`. The Bot API describes rich Markdown as GFM that may contain arbitrary
  rich message HTML, so one parser is enough. Call `richMarkdownToHtml` to see how a
  document was understood.
- `<tg-map>` carries no size in rich HTML, but `InputRichBlockMap` requires `width` and
  `height`, so `DEFAULT_MAP_WIDTH`/`DEFAULT_MAP_HEIGHT` (600×400) are used unless
  `width`/`height` attributes are given.
- A footnote (`[^id]` plus `[^id]: …`) becomes a `reference_link` plus a `footer` block
  holding a `reference`. There is no footnote block in the API.
- Soft line breaks inside a paragraph become `\n`, matching what GFM emits and what
  `<br>` produces.
- Media type comes from the tag plus the file extension: `<video src="*.gif">` is an
  animation, `<audio src="*.ogg">` a voice note, `<tg-document>` a document.
- A block-level media line in Markdown must be an `http(s)` URL; a `tg://` one is inline
  (custom emoji or formatted date).
- Emphasis matching is a simple "next matching delimiter" scan, not GFM's
  left/right-flanking rules.
- Inline Markdown on the same source line as a raw HTML block tag is **not** translated;
  use HTML there. The body of `<details>`, `<tg-collage>` and `<tg-slideshow>` _is_
  translated when it spans its own lines.
- `<br>`, `<br/>` and `<br />` are built into the rich parser and produce a newline.
  <https://core.telegram.org/bots/api#rich-message-formatting-options> leaves `<br>` out
  of its tag list, but its own `<blockquote>` example uses it, so it is treated as
  supported rather than as something `weak` has to rescue. The classic parse mode has no
  `<br>` and still rejects it, which is what tdlib does.
- Rich HTML decodes nine named references that classic HTML does not: `&apos;`,
  `&nbsp;`, `&hellip;`, `&mdash;`, `&ndash;`, `&lsquo;`, `&rsquo;`, `&ldquo;` and
  `&rdquo;`, on top of the classic four. A no-break space is content, so block trimming
  never strips it.
