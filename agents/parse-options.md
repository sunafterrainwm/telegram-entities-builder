# `weak` and `on`, which tdlib has no equivalent of

Reference for [AGENTS.md](../AGENTS.md). Read this before touching `src/parse/transform.ts`,
the option handling in `src/parse/entities.ts` or `src/parse/rich-html.ts`, or anything to
do with selectors and handlers. Revise it in the same commit as the change it describes:
these are our own invention, so this document is the only specification they have.

`parseHtml` and `parseRichHtml` take options beyond what the Bot API models, so these are
ours to keep coherent rather than to port.

## The contracts

- **`weak: true` must never throw a `ParseError`.** That is the contract, and it is what
  makes the option worth having: an unsupported tag keeps its text and loses its markup,
  an entity that cannot be built is left out, a stray end tag is ignored, an unclosed one
  is closed at the end of the input, and a malformed tag is skipped. If you add a `throw`
  to either parser, it needs an `if (!weak)` in front of it, and a test in
  `tests/parse/transform.spec.ts` that proves weak mode survives the same input.
- **`on` handlers take precedence over the built-in handling of a tag**, so `{ 'b': … }`
  replaces the bold entity rather than adding to it. Keep it that way: overriding is the
  point.

## The selector language

It lives in `src/parse/transform.ts` and is a small subset of CSS — comma-separated
alternatives of a tag name or `*`, plus `[attr]` and `[attr=value]` filters, most specific
first. It has no combinators and no classes on purpose: the classic parser sees a tag
stream, not a document, so a handler cannot know its ancestors. If that ever needs to
change, it changes for both parsers at once.

## The handler types

- `HtmlSelectorMap`, `HtmlTransformOptions` and `HtmlTransform` all bound their handler
  parameter with `H extends HtmlTagHandlerLike`, which is `(element: never) => unknown`.
  The parsers hand their handlers different descriptions of an element — the classic one
  only has the tag name and the attributes, the rich one has the parsed node — so there
  is no common argument type to bound on; `never` accepts them all while still ruling out
  a table of plain values.
- The classic handler fires on the **start tag**, because the scanner is single-pass and
  the children have not been read yet; what it returns (`before`, `after`, `entities`,
  `drop`, `selfClosing`) is applied around them. `entities` cover the children only, so
  `{ entities: [{ type: 'bold' }], after: '\n\n' }` does not make the blank line part of
  the entity. The rich handler gets the parsed node and returns `{ blocks }` or
  `{ text }`, since the tree is already built there.

## Where a handler sits

A handler is told its position: the classic one receives `parent` and `index` on its
`EntityTagElement`, and the rich one has them on its context (mirrored from
`HtmlElementNode.parent`/`.index`, which the tokenizer fills in). `index` counts
**element** siblings inside the same parent, and every element counts whether or not it
keeps its markup, so the numbers stay stable. This is what makes an ordered list
expressible without the handler keeping a counter of its own — see the `EntityTransform`
example and `tests/parse/transform.spec.ts`.

In the rich parser a handler only fires for elements the walk visits as nodes. The
structural children a block reads itself — `<li>`, `<tr>`, `<td>`, `<th>`, `<caption>`,
`<summary>`, `<figcaption>`, `<cite>` — never reach one, because those shapes already have
a block. Rewrite the enclosing `<ul>`, `<table>` or `<figure>` instead.
