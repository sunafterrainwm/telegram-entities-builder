# Bot API versions and `@since` tags

Reference for [AGENTS.md](../AGENTS.md). Read this before bumping `@grammyjs/types`,
before adding a `@since` tag, and before answering any question of the form "which Bot
API version does this need". Revise it in the same commit as the change it describes.

## The rule

**The target is the latest published `@grammyjs/types`, not the Bot API documentation.**

<https://core.telegram.org/bots/api> and its changelog describe whatever Telegram has
published most recently, which regularly runs ahead of the typings — and the API page is
edited in place, so a field can appear there before any release carries it. Building
against that is how you end up shipping `@since` tags for a version nobody can install
and types that do not exist. So: read the changelog **only up to the version the
installed typings cover**, and treat anything newer as not existing yet.

Release-to-version mapping, for when the typings jump several Bot API versions at once:
`@grammyjs/types` 3.28.0 → Bot API 10.1, 4.0.0 → 10.2, 5.0.0 → 10.3. The git history of
<https://github.com/grammyjs/types> states it per release ("feat: support Bot API 10.3").

## What the tag means, and where it goes

`@since Bot API <x.y>` means "you need at least this version of the **server** for this
to work". It is not a library version, and it is not a promise about when the package
gained the feature.

- It goes on the builders and their methods, and on the rich message types.
- **`src/parse` carries none, deliberately.** Parsing runs locally over a string, so
  there is no server to agree with and no version to require. If you add a parser, do not
  tag it; if you move something into `src/parse`, strip the tag.
- Declaration-level tags belong only where the whole declaration needs that version
  (`RichBlockBuilder` is 10.2 because `InputRichBlock` is). Do **not** tag aggregate
  classic types such as `AnyDraftEntity` with a version — state coverage in prose, as
  `src/index.ts` does.

## Version map

The single source of truth for the tags. If this table disagrees with the code, the code
is wrong. Everything here is already covered by the installed typings.

| Feature                                                                                                                                 | Bot API |
| --------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `bold`, `italic`, `code`, `pre`, `text_link`, `mention`, `hashtag`, `url`, `email`, `bot_command`                                       | 1.0     |
| `text_mention`                                                                                                                          | 2.1     |
| `cashtag`, `phone_number`                                                                                                               | 4.0     |
| `underline`, `strikethrough`, MarkdownV2, nested entities                                                                               | 4.5     |
| `spoiler`                                                                                                                               | 5.6     |
| `custom_emoji`                                                                                                                          | 6.2     |
| `blockquote`, `LinkPreviewOptions`                                                                                                      | 7.0     |
| `expandable_blockquote`                                                                                                                 | 7.4     |
| `date_time` entity, `<tg-time>`                                                                                                         | 9.5     |
| Rich messages: `RichText*`, `RichBlock*`, `sendRichMessage`, rich HTML/Markdown                                                         | 10.1    |
| `InputRichBlock*`, `InputRichMessage.blocks`, `InputRichBlockListItem`, `InputMediaVoiceNote`                                           | 10.2    |
| `RichMessageButton`, `RichTextButton`, `RichBlockButtons`, `RichBlockDocument`, `RichBlockExpandableBlockQuotation`, table `is_compact` | 10.3    |

## The chore: when `@grammyjs/types` is bumped

Do the chore, do not just read it.

1. Find out which Bot API version the new release covers — its changelog entry or commit
   message says so — and read <https://core.telegram.org/bots/api-changelog> from the
   previous target **up to that version and no further**. Never tag against a version the
   typings do not cover yet.
2. Update **Current target** in [AGENTS.md](../AGENTS.md) and the version map above.
3. Add `@since Bot API <new version>` to anything new you add, and check that nothing
   existing moved (Telegram does occasionally re-document a field).
4. `pnpm run docs` must end with `0 fatal` from the `@skillit/typedoc` report. One error
   is expected and unfixable: `ParseError.captureStackTrace`, inherited from
   `@types/node`.
