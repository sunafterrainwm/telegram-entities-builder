# telegram-entities-builder

Build and parse Telegram Bot API message content: compose, slice and merge the entities of
a classic message, assemble the blocks of a rich message, or turn HTML and Markdown back
into either. Typed against [`@grammyjs/types`](https://github.com/grammyjs/types), which
currently tracks **Bot API 10.3**.

## Features

- Dynamic text and entity composition, with safe offset/length recalculation on slice and trim
- Tagged-template formatting (`` formatText`a ${f.bold`b`}` ``), including nesting
- Rich messages (Bot API 10.1+) built as structured blocks — sent as-is, never serialized to HTML
- Parsers for `HTML`, `MarkdownV2` and legacy `Markdown`, ported from tdlib, plus parsers
  for rich HTML and rich Markdown
- A lenient mode and selector-based handlers, for HTML you did not write
- Every method documents the Bot API version its feature needs

## Requirements

- Node.js >= 18
- `@grammyjs/types` >= 5.0.0 (peer dependency)

## Classic messages

```typescript
import { EntityBuilder, f, formatText } from '@sunafterrainwm/telegram-entities-builder';

const builder = new EntityBuilder();
builder.addText('Hello ');
builder.bold('World');

await bot.api.sendMessage({ chat_id: chatId, ...builder.buildText() });
// { text: "Hello World", entities: [{ type: "bold", offset: 6, length: 5 }] }

// Or through tagged templates:
const payload = formatText`Hello ${f.bold`World`}!`.flatten().buildText();
```

`buildCaption()` and `buildInline()` produce the same content shaped for `sendDocument`
and for `InputTextMessageContent`. `MessageBuilder` adds hashtags and link preview
options on top.

## Rich messages

Since Bot API 10.1 a rich message is a tree of blocks, and since 10.2 those blocks can be
sent directly, so nothing has to be flattened into HTML or Markdown first:

```typescript
import {
	RichMessageBuilder,
	button,
	fr,
} from '@sunafterrainwm/telegram-entities-builder';

const rich = new RichMessageBuilder();
rich.heading(fr`Release ${fr.bold`2.0`}`, 1);
rich.paragraph('Everything is new.');
rich.list((list) => {
	list.text('Blocks are sent as data');
	list.text('Captions carry credit', { is_checked: true });
});
rich.photo('photo-file-id', { caption: 'A screenshot', credit: 'Me' });
rich.buttons([button.url('Read more', 'https://example.com')]);

await bot.api.sendRichMessage({ chat_id: chatId, rich_message: rich.buildMessage() });
// { blocks: [ { type: "heading", … }, … ] }
```

To upload new files inside a rich message, parameterize the builder with your client's
file type: `new RichMessageBuilder<InputFile>()`. The default is `never`, which allows
only file identifiers and URLs.

## Parsing

Going the other way — markup to structure — is useful when you hold formatted text and
need to slice, merge or inspect it:

```typescript
import {
	parseEntities,
	parseHtml,
	parseMarkdownV2,
	parseRichHtml,
	parseRichMarkdown,
} from '@sunafterrainwm/telegram-entities-builder';

parseHtml('Hello <b>world</b>');
// { text: "Hello world", entities: [{ type: "bold", offset: 6, length: 5 }] }

parseMarkdownV2('Hello *world*');
parseEntities(text, 'MarkdownV2'); // dispatches on a ParseMode

parseRichHtml('<h1>Title</h1><p>Body</p>');
parseRichMarkdown('# Title\n\nBody');
// { blocks: [ { type: "heading", … }, { type: "paragraph", … } ] }
```

### Markup you did not write

The HTML parsers are strict by default, the way Telegram is. Two options relax that.

`weak: true` never throws: an unsupported tag keeps its text and loses its markup, an
entity that cannot be built is left out, a stray end tag is ignored, an unclosed one is
closed at the end of the input, and a malformed tag is skipped.

```typescript
parseHtml('<div>kept <b>bold</b></div>', { weak: true });
// { text: "kept bold", entities: [{ type: "bold", offset: 5, length: 4 }] }

parseRichHtml('<div><p>one</p><p>two</p></div>', { weak: true });
// { blocks: [{ type: "paragraph", text: "one" }, { type: "paragraph", text: "two" }] }
```

`on` rewrites the elements that have no equivalent, keyed by a small CSS-like selector
(comma-separated tag names or `*`, plus `[attr]` and `[attr=value]` filters; most
specific wins). A handler also overrides the built-in handling of a tag.

For a classic message the handler runs on the start tag and places text and entities
around the children. It is also told where it sits — `parent` and `index` — which is what
makes an ordered list expressible without keeping a counter:

```typescript
parseHtml('<ol><li>one</li><li>two</li></ol>', {
	weak: true,
	on: {
		'h1, h2': () => ({ entities: [{ type: 'bold' }], after: '\n\n' }),
		'script, style': () => ({ drop: true }),
		br: () => ({ before: '\n', selfClosing: true }),
		li: ({ attrs, index, parent }) => {
			if (parent?.tag !== 'ol') {
				return { before: '• ', after: '\n' };
			}
			const start = Number(parent.attrs.start ?? '1');
			const value = attrs.value === undefined ? start + index : Number(attrs.value);
			return { before: `${value}. `, after: '\n' };
		},
	},
});
// { text: "1. one\n2. two\n", entities: [] }
```

`index` counts element siblings inside the same parent, so `<ol start="3">` and
`<li value="7">` come out the way a browser would render them, and a nested `<ol>`
numbers itself independently.

For a rich message the tree already exists, so the handler returns blocks or rich text:

```typescript
parseRichHtml(webPage, {
	weak: true,
	on: {
		'div, section, article': (context) => ({ blocks: context.blocks() }),
		kbd: (context) => ({ text: { type: 'code', text: context.text() } }),
		nav: () => undefined, // dropped
	},
});
```

In the rich parser a handler only fires for elements the walk visits as nodes, so the
structural children a block reads itself (`<li>`, `<tr>`, `<td>`, `<summary>`,
`<figcaption>`, `<cite>`) never reach one — rewrite the enclosing `<ul>`, `<table>` or
`<figure>` instead.

Either option can be packaged for reuse with `new EntityTransform({ … })` or
`new RichTransform({ … })` — both extend the abstract `HtmlTransform`, so overriding
`handlerFor` replaces the selector lookup wholesale.

`parseHtml`, `parseMarkdownV2` and `parseMarkdown` are ports of
[tdlib](https://github.com/tdlib/td)'s own `parse_html`, `parse_markdown_v2` and
`parse_markdown`, which is what
[`telegram-bot-api`](https://github.com/tdlib/telegram-bot-api) runs, so they accept and
reject the same input the server does. Malformed markup raises a `ParseError`.

Parsed content loads straight into a builder, which is the point of parsing at all:

```typescript
const { text, entities } = parseHtml('Hello <b>big <i>world</i></b>!');

const builder = new EntityBuilder();
builder.mergeContent(text, entities);
builder.slice(10, 15).buildText();
// { text: world, entities: [{ type: bold, … }, { type: italic, … }] }
```

The rich parsers have no tdlib counterpart — Telegram parses `rich_message.html` and
`rich_message.markdown` server-side — so they follow the documented syntax and can
disagree with the server in corners. `agents/rich-parsers.md` lists every such choice.
When exactness
matters, send the markup and let Telegram parse it.

## Troubleshooting

- **Entity overlaps:** classic entities must nest properly; overlapping runs that cross
  each other are rejected by Telegram.
- **Merge errors:** "Cannot merge: This builder is not a fork" means `merge()` was called
  on a builder that was not produced by `fork()`, or that was merged already.
- **`ParseError`:** the message carries the offset in UTF-16 code units, and `.position`
  has it as a number.
- **No HTML output:** there is no serializer back to markup on purpose — sending
  `entities` or rich message `blocks` is lossless. `escapeHtml` is still there for
  hand-written HTML.

## Maintaining

[AGENTS.md](./AGENTS.md) is the entry point, with the reference documents it links
under `agents/` covering the Bot API version map, the tdlib port checklist, the
`weak`/`on` contracts and the deliberate differences from the server's parsers. The
target Bot API version is whatever the latest published `@grammyjs/types` covers, never
the Bot API documentation's current state — that regularly runs ahead of any release.
