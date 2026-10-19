# The classic parsers, ported from tdlib

Reference for [AGENTS.md](../AGENTS.md). Read this before touching `src/parse/entities.ts`
or `src/parse/internal.ts`. Revise it in the same commit as the change it describes —
especially the list of deliberate differences, which is only useful while it is complete.

`src/parse/entities.ts` is a hand port of tdlib, not an independent implementation. Keep
it that way; the Bot API's behaviour is defined by that code, not by a spec. The `weak`
and `on` options are the one place where we add behaviour of our own — see
[parse-options.md](./parse-options.md).

## Where each function came from

| Our function                                                    | tdlib source                                                                                                             |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `parseHtml`                                                     | `parse_html` in [`td/telegram/MessageEntity.cpp`](https://github.com/tdlib/td/blob/master/td/telegram/MessageEntity.cpp) |
| `parseMarkdownV2`                                               | `parse_markdown_v2`, same file                                                                                           |
| `parseMarkdown`                                                 | `parse_markdown`, same file                                                                                              |
| `decodeHtmlReference`                                           | `decode_html_entity`, same file                                                                                          |
| `normalizeDateTimeFormat`                                       | `FormattedDate::get_date_flags` in `td/telegram/FormattedDate.cpp`                                                       |
| `getLinkUserId`, `getLinkCustomEmojiId`, `getLinkFormattedDate` | `LinkManager::get_link_*` in `td/telegram/LinkManager.cpp`                                                               |
| `sortEntities`                                                  | `sort_entities` / `MessageEntity::operator<`                                                                             |

The deployed server is
[`tdlib/telegram-bot-api`](https://github.com/tdlib/telegram-bot-api), which links td; so
when a parse mode changes, diff td's `MessageEntity.cpp` and re-port.

## The chore: when a parse mode changes, or a Bot API release touches formatting

1. Re-read the tdlib function the table points at and re-port the diff. Keep the port
   structurally close to the C++ — the loops read oddly on purpose, because they are the
   C++ loops. `at()` returns `"\0"` past the end so the ported loops terminate the way
   the C++ ones do over a NUL-terminated string.
2. JS strings are already UTF-16, which is the unit Telegram entity offsets use, so
   `result.length` _is_ tdlib's `utf16_offset`. Do not reintroduce byte bookkeeping.
3. Add a test per changed construct in `tests/parse/entities.spec.ts`.

## Known, deliberate differences from tdlib

Re-check these on every port.

- `checkLink` only trims. tdlib's `get_checked_link` also normalizes schemes and IDN
  hosts and drops the entity when the link is unusable; the Bot API re-validates every
  URL anyway, so a bad link reaches the server instead of being dropped here.
- A `tg://user?id=N` link yields `text_mention` with
  `{ id: N, is_bot: false, first_name: '' }`. The link encodes nothing else, and `user.id`
  is the only field the Bot API reads when the entity is sent.
- A numeric character reference for a lone surrogate is left as literal text. tdlib
  accepts it and then re-checks the UTF-8 of the whole string.
- Entities with equal offset and length keep insertion order; tdlib breaks the tie with a
  type-priority table.
- A tag written `<x/>` is treated as an empty element. tdlib reads the name as `x/` and
  reports an unsupported tag, but handlers need void elements such as `<br/>` and
  `<input/>`. Since an empty element yields a zero-length entity, which is dropped either
  way, the only observable difference is an error that no longer happens.
