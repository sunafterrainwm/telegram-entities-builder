import type * as TT from '@grammyjs/types';

import { RichBlockBuilder } from './block.ts';

/**
 * Message-level options of a Telegram rich message.
 *
 * @category Rich Message Types
 * @since Bot API 10.1
 */
export interface RichMessageBuilderOptions {
	/** Pass `true` if the rich message must be shown right-to-left. */
	is_rtl?: boolean;
	/** Pass `true` to skip automatic detection of entities. */
	skip_entity_detection?: boolean;
}

/**
 * A builder for the `rich_message` payload of `sendRichMessage`,
 * `sendRichMessageDraft` and `editMessageText`.
 *
 * The payload is emitted as `InputRichMessage` `blocks`:
 * since Bot API 10.1 structured blocks are accepted directly, so nothing is
 * serialized to HTML or Markdown on the way out.
 *
 * @typeParam F - The file type accepted by the Bot API client (grammY's `InputFile`).
 *   Defaults to `never`, meaning only already-uploaded files and URLs can be used.
 *
 * @category Rich Message Builders
 * @useWhen - You need to send or edit a rich message built from blocks.
 * @avoidWhen - You only need inline formatting of a classic message (use `MessageBuilder`).
 * @never - NEVER mutate the returned payload or the blocks inside it.
 *
 * @example
 * ```typescript
 * import { RichMessageBuilder, fr } from "@sunafterrainwm/telegram-entities-builder";
 *
 * const builder = new RichMessageBuilder();
 * builder.heading(fr`Welcome ${fr.bold`User`}`, 1);
 * builder.paragraph('This is a rich message.');
 *
 * await bot.api.sendRichMessage({
 * 	chat_id: chatId,
 * 	rich_message: builder.buildMessage(),
 * });
 * ```
 * @since Bot API 10.2
 */
export class RichMessageBuilder<F = never> extends RichBlockBuilder<F> {
	/** Message-level options applied by {@link RichMessageBuilder.buildMessage}. */
	public options: RichMessageBuilderOptions;

	/**
	 * Creates a new RichMessageBuilder.
	 *
	 * @param options - Options that apply to the final payload.
	 */
	public constructor(options: RichMessageBuilderOptions = {}) {
		super();
		this.options = { ...options };
	}

	/**
	 * Builds the `rich_message` payload.
	 *
	 * @returns An `InputRichMessage` carrying the blocks.
	 */
	public buildMessage(): TT.InputRichMessage<F> {
		const message: TT.InputRichMessage<F> = { blocks: this.build() };
		if (this.options.is_rtl !== undefined) {
			message.is_rtl = this.options.is_rtl;
		}
		if (this.options.skip_entity_detection !== undefined) {
			message.skip_entity_detection = this.options.skip_entity_detection;
		}
		return message;
	}

	/**
	 * Builds the content of an inline query result.
	 *
	 * Inline results may only reference previously uploaded files, which is why this is
	 * available on a builder whose file type is `never`.
	 *
	 * @param this - A builder whose file type is `never`, so nothing is uploaded.
	 * @returns An `InputRichMessageContent`.
	 * @since Bot API 10.2
	 */
	public buildInline(this: RichMessageBuilder): TT.InputRichMessageContent {
		return { rich_message: this.buildMessage() };
	}

	/**
	 * Creates an independent copy of this builder, options included.
	 *
	 * The block list is copied, but the blocks themselves are shared: they may hold
	 * file handles that cannot be cloned, so treat built blocks as immutable.
	 *
	 * @returns A new builder with the same blocks and options.
	 */
	public override clone(): RichMessageBuilder<F> {
		const instance = new RichMessageBuilder<F>(this.options);
		instance._blocks = [...this._blocks];
		return instance;
	}
}
