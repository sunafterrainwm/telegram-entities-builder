# Rich block references and the shape of the builders

Reference for [AGENTS.md](../AGENTS.md). Read this before touching
`src/rich-message/block.ts`, `ref.ts`, `measure.ts`, or any `build()` signature. Revise
it in the same commit as the change.

The numbers the validation compares against are **not** here; they live in
[rich-limit.md](./rich-limit.md), with the measurements they came from.

## The problem references solve

Telegram's rich blocks form a tree, and real code fills that tree out of order: a header
paragraph is positioned first but keeps growing as later facts are discovered, a list is
positioned before its items are known, a `details` block is positioned before its file
tree has been walked. Written against plain data that is simply

```ts
const text: TT.RichText[] = [];
blocks.push({ type: 'paragraph', text }); // position fixed now
text.push({ type: 'bold', text: '名稱' }); // content later
```

A builder that resolves its argument at call time cannot express this at all, which is
why every block method now **returns a reference** instead of `this`.

## The rules

1. **A block method fixes the position immediately and returns a reference.**
   `b.paragraph()` inserts the paragraph at once; writing through the reference afterwards
   changes only its content. There is therefore no "attach this reference" method and no
   detached reference — `unwrapRichBlocks` **throws** on a reference, because adding one
   that already holds a position would duplicate the block.

2. **A reference is the builder for its own content, with no container property in
   between.** `RichTextBlockRef` extends `RichTextBuilder`, `RichBlocksRef` extends
   `RichBlockBuilder`, `RichListRef` extends `RichListBuilder`, so content is written
   straight onto the reference: `b.paragraph().bold('Name')`.

   An earlier design gave each reference a self-pointing `text` / `blocks` / `items`
   property as a label, projected through a type that hid the reference's own container
   keys. It was removed: the property was exactly equivalent to writing on the reference
   and so gave two spellings for everything, which is the thing this release sets out to
   avoid. Do not reintroduce it. The projection it needed is gone too — note that a
   blanket `'text' | 'blocks' | 'items'` key set would have been wrong anyway, because
   `RichListBuilder.text()` adds an item holding a paragraph and has nothing to do with a
   paragraph's text.

3. **`details` is the one reference with two containers, and the only one with a
   container property.** The reference itself is the block list; `summary` is a
   `RichTextRef`. The asymmetry with the other references is deliberate — `details` really
   is the only block with two containers, and the API says so instead of hiding it behind
   a label that does nothing elsewhere. Any future two-container block (`table` with a
   caption, `collage` with a caption) should follow the same split rather than inventing a
   second rule.

4. **A secondary container is a `RichTextRef`, not a bare `RichTextBuilder`.** It would
   work as a bare builder, but the declared type would then say "independent builder that
   never refuses a write" about something that is frozen along with the block it belongs
   to — the meaning is lost exactly when the value is passed somewhere else or stored.
   `RichTextRef` implements `RichRef`, which is `RichBlockRef` minus `type`: the freeze
   surface without the claim to be a block.

   It carries **its own** `RefState`, adopted by the block's. So `details.finish()`
   cascades into the summary, while `summary.finish()` freezes the summary alone and
   leaves the block list writable. Keep that direction if you add another one.

5. **References are an interface in public, a class in private.** `RichBlockRef` is what
   callers see. Implementations extend the three builders — text, block list, list items —
   which is why they cannot share a base class, so the freeze behaviour lives in a
   composed `RefState` instead. A block appended through `addBlock` has no builder behind
   it and comes back from `lastBlock` as a `ReadonlyRichBlockRef` carrying only `type`.

6. **`finish()` freezes downwards.** It marks the reference and every reference nested
   inside it, after which any write throws `TypeError`. `build({ finish: true })` is the
   same recursive operation entered at the root.

7. **A plain `build()` freezes nothing.** It resolves, validates and hands back a fresh
   array; the tree stays writable and may be built again. Never make `build()` freeze
   implicitly: "build, look at the size, add a few more blocks" is the normal way to work
   within the 32768-code-point budget, and an implicit freeze would break it.

8. **`measureBlock()` must not go through `build()`.** It resolves the slots directly.
   Going through `build()` would apply the empty-field checks and so refuse to measure a
   tree that is still being filled in — which is exactly when a caller wants to measure.

9. **Validation has two entry points, and only one of them is automatic.** The empty-field
   checks run inside `build()` and `finish()`, and are turned off with
   `build({ checkEmpty: false })`. The numeric limits are checked only by
   `assertWithinLimits()`, which is never called for you. The distinction is deliberate:
   an empty `heading` is always a bug, while "the message is too long" is a budget a caller
   plans for by measuring and truncating, not an exception thrown at delivery time. This
   package does not truncate.

## Traps

- **`buildText()` collapses a lone node, `build()` does not.** `collapse()` returns
  `nodes[0]` when there is exactly one, so a reference resolving through `buildText()`
  emits `text: <node>` rather than `text: [<node>]`. Both are valid `RichText` and
  Telegram does not care, but code that must reproduce an existing payload byte for byte
  cannot use a reference for a one-element array — it needs
  `addBlock({ type: 'paragraph', text: builder.build() })`. This is the one place the
  reference abstraction does not reach.

- **`collapse([])` returns `[]`.** An empty text builder resolves to `text: []`, not to
  `''` and not to a dropped block, which is what makes a reserved-but-never-filled
  paragraph legal. The Bot API accepts it; see [rich-limit.md](./rich-limit.md). Do not
  "fix" `collapse` to normalise the empty case.

- **The empty-field rules are measured, not derived.** `details.summary` and
  `paragraph.text` may be empty; `heading.text` and `footer.text` may not — and all four
  are the same required `RichText` in the typings. Adding a rule needs a measurement, not
  an argument about what the client probably renders.

- **`totalBlocks` corresponds to no server limit.** The 500-block cap counts the
  top-level array only. `totalBlocks` is reported for information; anything that budgets
  against it is wrong.

- **The text unit differs between the two halves of this package.** Rich messages count
  Unicode code points; `MessageEntity.offset` counts UTF-16 code units. Do not share a
  measuring function, and do not compare the two numbers.

- **Line endings.** The repo is LF. Python's `write_text` re-encodes to CRLF on Windows
  unless `newline='\n'` is passed, and `eslint --fix` then rewrites every line of every
  file it touched.

## What `createFormatter` is for, and what it cannot do

`f` and `fr` are generated from `src/utils/formatter.ts`, which derives the helper names
from the builder's method signatures: `StyleMethods` keeps methods shaped
`(item: TItem) => TInterface`, and the other two mapped types keep the parameterised and
text-free ones.

**There can be no block-level `fr`.** All three mapped types require a method that returns
the builder itself, and every block method now returns a reference, so a formatter built
over `RichBlockBuilder` derives zero keys. This is structural, not a missing feature: do
not try to add `fr.paragraph`. The single-expression path from text to a block is
`add()`, which wraps a bare `RichTextBuilder` as a paragraph and a bare
`RichListBuilder` as a list.

`builder.f` and `builder.fr` are gone. They were the only reason `createFormatter` had a
runtime `Interface` constructor, an `instanceof` dispatch in all three factories, and a
second overload on each of `StyleFunction`, `ParameterizedStyleFunction` and
`EmbedFunction`; all of that went with them. The helpers are now used as
`builder.add(f.bold`hi`)`, which also avoids the trap that the bound form mutated the
builder while the free form returned a new one — same name, opposite meaning.

`ParamsOf<T>` still has to exist. See the note in AGENTS.md: intersecting with a
catch-all signature collapses every parameter list to `unknown[]`.

## The tagged-template overload

`add()` carries a second signature on `RichTextBuilder`, `RichBlockBuilder`,
`EntityBuilder` and `LazyEntityBuilder` so that `` builder.add`a${f.bold`b`}c` `` works.
It is safe in both directions, which is worth recording because it looks as though it
should not be:

- a plain `string[]` is **not** assignable to `TemplateStringsArray` (no `raw`), so an
  ordinary array argument cannot land on the template overload;
- a `TemplateStringsArray` is **not** assignable to `ResolvableRichText` or
  `ResolvableRichBlocks` (it is `readonly`), so a template call cannot land on the other
  overload.

At runtime the two are told apart by `isTemplateStrings`, which checks for `raw`.

ESLint's `no-unused-expressions` is configured with `allowTaggedTemplates` because
``builder.add`text`;`` as a statement is the idiom these overloads exist for.
