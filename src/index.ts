/**
 * @packageDocumentation
 * A dynamic builder — and parser — for Telegram Bot API message content, built on
 * `@grammyjs/types`.
 *
 * Three jobs, which do not mix:
 *
 * - **Classic messages** — a flat string plus `MessageEntity` offsets. `EntityBuilder`
 *   and friends keep those offsets correct while you append, slice, trim and nest. The
 *   entity set is complete as of Bot API 9.5 (`date_time` being the newest type); each
 *   method carries the Bot API version its entity needs.
 * - **Rich messages** — a tree of blocks and rich text, introduced in Bot API 10.1.
 *   `RichMessageBuilder` emits `InputRichMessage.blocks`, which `sendRichMessage` takes
 *   as-is; sending blocks rather than markup needs Bot API 10.2.
 * - **Parsing** — `parseHtml`, `parseMarkdownV2` and `parseMarkdown` turn a `parse_mode`
 *   string into text plus entities, and `parseRichHtml`/`parseRichMarkdown` turn rich
 *   markup into blocks. The classic parsers are ports of tdlib's own; the rich ones are
 *   an interpretation of the documented syntax, listed in `agents/rich-parsers.md`. Both HTML
 *   parsers take `weak`, which drops what cannot be represented instead of raising, and
 *   `on`, which rewrites the elements that have no equivalent.
 *
 * Built against `@grammyjs/types` 5.x, which tracks **Bot API 10.3**. The target is
 * always the latest published typings, never the Bot API documentation's current state.
 *
 * @example
 * ```typescript
 * import {
 * 	EntityBuilder,
 * 	parseHtml,
 * 	RichMessageBuilder,
 * } from "@sunafterrainwm/telegram-entities-builder";
 *
 * const builder = new EntityBuilder();
 * builder.bold('Hello World');
 * await bot.api.sendMessage({ chat_id: id, ...builder.buildText() });
 *
 * const rich = new RichMessageBuilder();
 * rich.heading('Rich Message', 1);
 * rich.paragraph('Sent as blocks.');
 * await bot.api.sendRichMessage({ chat_id: id, rich_message: rich.buildMessage() });
 *
 * const { text, entities } = parseHtml('Hello <b>world</b>');
 * ```
 *
 * @useWhen - You need to build or inspect Telegram message content programmatically.
 * @avoidWhen - You have a static string and no formatting at all.
 * @never - NEVER mutate a returned payload; build a new one or clone the builder.
 */

export * from './message.ts';
export { default } from './message.ts';
export * from './rich-message/message.ts';
export * from './rich-message/text.ts';
export * from './rich-message/block.ts';
export {
	ReadonlyRichBlockRef,
	type RichBlockRef,
	type RichRef,
} from './rich-message/ref.ts';
export { richMessageLimits, type RichBlockMeasurement } from './rich-message/measure.ts';
export * from './parse/index.ts';
export * from './utils/html.ts';
