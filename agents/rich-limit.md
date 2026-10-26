# Rich message limits, as measured

Reference for [AGENTS.md](../AGENTS.md). Read this before writing or changing any
validation of rich message content — length budgets, block counts, nesting depth, or
"this field must not be empty" checks. Revise it in the same commit as the change.

## Why this document exists

**None of the numbers here can be derived from `@grammyjs/types`, and the official
documentation disagrees with the server on two of them.**

`InputRichBlockDetails.summary` and `InputRichBlockParagraph.text` are both a required
`RichText` (`rich.d.ts:1113` and `:995`) — structurally identical. Yet the server accepts
an empty `summary` and rejects an empty `heading.text`. Nothing in the typings predicts
that, and nothing in the code can recover it.

Widely repeated claims that turned out to be **wrong**:

- "the 500-block cap includes nested blocks, list items and table rows" — it does not;
  the cap is on the top-level `blocks` array only.
- "the text limit is 32768 UTF-8 characters" — the unit is Unicode **code points**;
  neither UTF-8 bytes nor UTF-16 code units match the observed boundary.

So the numbers are only ever as good as the last measurement. Each table below records
what was observed, when, and against which API version.

## How to re-measure

There is no probe script in the repository on purpose: every probe needs a real bot token
and **sends real messages to a real chat**. The numbers live in the unit tests of
`assertWithinLimits` and the `finish()` validation instead, so a server change surfaces as
a test that documents a stale expectation rather than as a silently wrong constant.

To re-measure, `POST` to `sendRichMessage` with `{ chat_id, rich_message: { blocks } }`
and compare the `description` of each 400 against the tables below. Bisect each boundary;
a single pass/fail tells you nothing about which unit is being counted. Measuring the
text unit in particular needs three separate strings — ASCII, BMP-but-multibyte (e.g.
`U+6F22`), and astral (e.g. `U+1F600`) — because a single over-limit result is consistent
with all three candidate units.

---

## Measurement: 2026-10-21, Bot API 10.3, `@grammyjs/types` 5.0.0

### Empty fields

The distinction is per field, not per block, and it is not "empty means meaningless": a
`details` with no summary is accepted while a `heading` with no text is not.

| Construct                           | Server       | Error                           |
| ----------------------------------- | ------------ | ------------------------------- |
| `paragraph.text` is `[]` or `""`    | **accepted** | —                               |
| `details.summary` is `[]` or `""`   | **accepted** | —                               |
| `heading.text` is `[]`              | rejected     | `RICH_MESSAGE_CONTENT_REQUIRED` |
| `footer.text` is `[]`               | rejected     | `RICH_MESSAGE_CONTENT_REQUIRED` |
| `list.items` is `[]`                | rejected     | `list must be non-empty`        |
| `details.blocks` is `[]`            | rejected     | `RICH_MESSAGE_EMPTY`            |
| a list item's `blocks` is `[]`      | rejected     | `RICH_MESSAGE_EMPTY`            |
| top-level `blocks` is `[]`          | rejected     | `RICH_MESSAGE_EMPTY`            |
| top-level `blocks` is one `divider` | rejected     | `RICH_MESSAGE_EMPTY`            |

The `heading` and `footer` rejections are **per block**, not a message-level "no content"
check: both were measured in a message that also carried a non-empty paragraph, and both
still failed. A lone `divider`, by contrast, fails because the _message_ carries no
content, not because `divider` is malformed.

`paragraph.text: []` being accepted is load-bearing for this package: it is what lets a
builder emit a paragraph whose content was never filled in, rather than having to decide
between a wrong default and an error.

### Text length

**32768 Unicode code points, inclusive, summed over the whole message including every
nested block.**

| String            | code points | UTF-16 units | UTF-8 bytes | Server                         |
| ----------------- | ----------- | ------------ | ----------- | ------------------------------ |
| `U+6F22` × 16000  | 16000       | 16000        | 48000       | **accepted** → not bytes       |
| `U+1F600` × 16385 | 16385       | 32770        | 65540       | **accepted** → not UTF-16      |
| `a` × 32768       | 32768       | 32768        | 32768       | **accepted** → limit inclusive |
| `a` × 32769       | 32769       | 32769        | 32769       | `RICH_MESSAGE_TEXT_TOO_LONG`   |

The budget is cumulative, not per block, and nesting does not exempt anything:

| Construct                                         | Server                       |
| ------------------------------------------------- | ---------------------------- |
| two paragraphs of 16384 code points (32768 total) | **accepted**                 |
| two paragraphs of 16385 code points (32770 total) | `RICH_MESSAGE_TEXT_TOO_LONG` |
| 32769 code points inside a list item              | `RICH_MESSAGE_TEXT_TOO_LONG` |

Note the unit differs from the classic side of this package, where `MessageEntity.offset`
and `length` count UTF-16 code units. Do not share a measuring function between the two.

### Block count

**500, counted over the top-level `blocks` array only. Nesting is not counted.**

| Construct                                  | Server                         |
| ------------------------------------------ | ------------------------------ |
| 500 top-level paragraphs                   | accepted (501 is the failure)  |
| 501 top-level paragraphs                   | `RICH_MESSAGE_BLOCKS_TOO_MANY` |
| 1 list holding 500 items                   | **accepted**                   |
| 1 list → 1 item → 501 paragraphs inside it | **accepted**                   |

The last row is the decisive one: 503 blocks exist in that message and it is accepted, so
the cap cannot be recursive.

### Nesting depth

**15 levels of container nesting around a leaf block are accepted; 16 are not.**

| Construct                                          | Server                       |
| -------------------------------------------------- | ---------------------------- |
| 15 nested `list` → `item` levels, then a paragraph | accepted                     |
| 16 nested `list` → `item` levels, then a paragraph | `RICH_MESSAGE_DEPTH_INVALID` |

Read as a total depth including the leaf, that is a cap of 16 levels. The measurement used
`list`/`items` only; whether `items` itself consumes a level, and whether other containers
(`details`, `blockquote`, `table`) count the same way, was **not** measured.

### Not measured

Do not state these as facts without measuring them first:

- the media-attachment cap (documented as 50; a third-party report claims the server keeps
  roughly 20 and silently drops the rest)
- the table column cap (documented as 20)
- whether `details`, `blockquote` and `table` consume nesting levels like `list` does
- whether custom-emoji alternative text and formula source count toward the 32768
  (documented as counting; not verified here)
- whether a `details` with an empty summary is actually expandable in the client — only
  the API's acceptance of it was measured
