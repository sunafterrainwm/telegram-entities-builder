import type * as TT from '@grammyjs/types';

import {
	createFormatter,
	interleaveTemplate,
	isTemplateStrings,
} from '../utils/formatter.ts';

import { measureRichText } from './measure.ts';

/**
 * A resolvable rich text, which can be a raw Telegram `RichText`
 * (including a plain string), a {@link RichTextBuilder}, or an array of resolvables.
 *
 * @category Rich Message Types
 * @since Bot API 10.1
 */
export type ResolvableRichText = TT.RichText | RichTextBuilder | ResolvableRichText[];

/**
 * Collapses a node list into the most compact `RichText` representation.
 *
 * A single node is returned as-is, everything else stays an array, because
 * `RichText` is `string | RichText[] | RichTextNode`.
 *
 * @internal
 */
function collapse(nodes: TT.RichText[]): TT.RichText {
	return nodes.length === 1 ? nodes[0] : nodes;
}

/**
 * Unwraps a {@link ResolvableRichText} into a plain Telegram `RichText`.
 *
 * Nested arrays and builders are flattened, since an array of `RichText` simply
 * means concatenation.
 *
 * @param text - The resolvable rich text.
 * @returns The equivalent plain `RichText`.
 *
 * @example
 * ```typescript
 * unwrapRichText(['a ', new RichTextBuilder().bold('b')]);
 * // ["a ", { type: "bold", text: "b" }]
 * ```
 *
 * @category Rich Message Functions
 * @since Bot API 10.1
 */
export function unwrapRichText(text: ResolvableRichText): TT.RichText {
	if (text instanceof RichTextBuilder) {
		return collapse(text.build());
	}

	if (Array.isArray(text)) {
		const flat: TT.RichText[] = [];
		for (const item of text) {
			const unwrapped = unwrapRichText(item);
			if (Array.isArray(unwrapped)) {
				flat.push(...unwrapped);
			} else {
				flat.push(unwrapped);
			}
		}
		return collapse(flat);
	}

	return text;
}

/**
 * Attaches an optional style to a button, omitting the key when no style is given.
 *
 * @internal
 */
function withStyle<B extends TT.RichMessageButton>(
	item: B,
	style: TT.RichMessageButton['style'] | undefined,
): B {
	return style === undefined ? item : { ...item, style };
}

/**
 * Factory helpers for `RichMessageButton` objects.
 *
 * Buttons appear both inline (via {@link RichTextBuilder.button}) and as a block
 * (via `RichBlockBuilder.buttons`); in both places they are the same object, so
 * these helpers are shared.
 *
 * @example
 * ```typescript
 * import { button } from "@sunafterrainwm/telegram-entities-builder";
 *
 * button.url("Open docs", "https://core.telegram.org/bots/api");
 * button.callback("Refresh", "refresh:1", "primary");
 * ```
 *
 * @category Rich Message Functions
 * @since Bot API 10.3
 */
export const button = {
	/** A button that opens an HTTP or `tg://` URL. */
	url(
		text: ResolvableRichText,
		url: string,
		style?: TT.RichMessageButton['style'],
	): TT.RichMessageButton.UrlButton {
		return withStyle({ text: unwrapRichText(text), url }, style);
	},
	/** A button that sends a callback query to the bot. */
	callback(
		text: ResolvableRichText,
		callbackData: string,
		style?: TT.RichMessageButton['style'],
	): TT.RichMessageButton.CallbackButton {
		return withStyle({ text: unwrapRichText(text), callback_data: callbackData }, style);
	},
	/** A button that launches a Web App. */
	webApp(
		text: ResolvableRichText,
		webApp: TT.WebAppInfo,
		style?: TT.RichMessageButton['style'],
	): TT.RichMessageButton.WebAppButton {
		return withStyle({ text: unwrapRichText(text), web_app: webApp }, style);
	},
	/** A button that authorizes the user through a login URL. */
	loginUrl(
		text: ResolvableRichText,
		loginUrl: Omit<TT.LoginUrl, 'bot_username'>,
		style?: TT.RichMessageButton['style'],
	): TT.RichMessageButton.LoginUrlButton {
		return withStyle({ text: unwrapRichText(text), login_url: loginUrl }, style);
	},
	/** A button that prompts the user to pick a chat and inserts an inline query there. */
	switchInline(
		text: ResolvableRichText,
		query: string,
		style?: TT.RichMessageButton['style'],
	): TT.RichMessageButton.SwitchInlineButton {
		return withStyle({ text: unwrapRichText(text), switch_inline_query: query }, style);
	},
	/** A button that inserts an inline query in the current chat. */
	switchInlineCurrentChat(
		text: ResolvableRichText,
		query: string,
		style?: TT.RichMessageButton['style'],
	): TT.RichMessageButton.SwitchInlineCurrentChatButton {
		return withStyle(
			{ text: unwrapRichText(text), switch_inline_query_current_chat: query },
			style,
		);
	},
	/** A button that prompts the user to pick a chat of the given type. */
	switchInlineChosenChat(
		text: ResolvableRichText,
		chosenChat: TT.SwitchInlineQueryChosenChat,
		style?: TT.RichMessageButton['style'],
	): TT.RichMessageButton.SwitchInlineQueryChosenChatButton {
		return withStyle(
			{ text: unwrapRichText(text), switch_inline_query_chosen_chat: chosenChat },
			style,
		);
	},
	/** A button that copies text to the clipboard. */
	copyText(
		text: ResolvableRichText,
		copyText: TT.CopyTextButton | string,
		style?: TT.RichMessageButton['style'],
	): TT.RichMessageButton.CopyTextButtonButton {
		return withStyle(
			{
				text: unwrapRichText(text),
				copy_text: typeof copyText === 'string' ? { text: copyText } : copyText,
			},
			style,
		);
	},
	/** A button that is shown but does nothing. */
	disabled(
		text: ResolvableRichText,
		style?: TT.RichMessageButton['style'],
	): TT.RichMessageButton.DisabledButtonButton {
		return withStyle({ text: unwrapRichText(text), disabled: {} }, style);
	},
};

/**
 * The format helpers of {@link fr}.
 *
 * Each helper builds a fresh {@link RichTextBuilder} out of a tagged template, which is
 * then handed to `add()`: ``builder.add(fr.bold`hi`)``.
 *
 * @category Rich Message Types
 * @since Bot API 10.1
 */
export interface FormatRichTextHelpers<B extends RichTextBuilder> {
	/** Format text as bold (bold text) */
	bold(strings: TemplateStringsArray, ...values: ResolvableRichText[]): B;
	/** Format text as italic (italic text) */
	italic(strings: TemplateStringsArray, ...values: ResolvableRichText[]): B;
	/** Format text as underline (underlined text) */
	underline(strings: TemplateStringsArray, ...values: ResolvableRichText[]): B;
	/** Format text as strikethrough (strikethrough text) */
	strikethrough(strings: TemplateStringsArray, ...values: ResolvableRichText[]): B;
	/** Format text as spoiler (spoiler message) */
	spoiler(strings: TemplateStringsArray, ...values: ResolvableRichText[]): B;
	/** Format text as subscript (subscript text) */
	subscript(strings: TemplateStringsArray, ...values: ResolvableRichText[]): B;
	/** Format text as superscript (superscript text) */
	superscript(strings: TemplateStringsArray, ...values: ResolvableRichText[]): B;
	/** Format text as marked (marked text) */
	marked(strings: TemplateStringsArray, ...values: ResolvableRichText[]): B;
	/** Format text as code (inline fixed-width code) */
	code(strings: TemplateStringsArray, ...values: ResolvableRichText[]): B;

	/** Format text as date_time (formatted date and time) */
	dateTime(
		unixTime: number,
		format: TT.RichTextDateTime['date_time_format'],
	): (strings: TemplateStringsArray, ...values: ResolvableRichText[]) => B;
	/** Format text as URL (https://telegram.org) */
	url(url: string): {
		// eslint-disable-next-line @typescript-eslint/unified-signatures
		(strings: TemplateStringsArray, ...values: ResolvableRichText[]): B;
		(): B;
	};
	/** Format text as email address (do-not-reply@telegram.org) */
	emailAddress(emailAddress: string): {
		// eslint-disable-next-line @typescript-eslint/unified-signatures
		(strings: TemplateStringsArray, ...values: ResolvableRichText[]): B;
		(): B;
	};
	/** Format text as phone number (+1-212-555-0123) */
	phoneNumber(phoneNumber: string): {
		// eslint-disable-next-line @typescript-eslint/unified-signatures
		(strings: TemplateStringsArray, ...values: ResolvableRichText[]): B;
		(): B;
	};
	/** Format text as bank card number (e.g. 4242 4242 4242 4242) */
	bankCardNumber(bankCardNumber: string): {
		// eslint-disable-next-line @typescript-eslint/unified-signatures
		(strings: TemplateStringsArray, ...values: ResolvableRichText[]): B;
		(): B;
	};
	/** Format text as text_mention (for users without usernames) */
	textMention(
		user: TT.User,
	): (strings: TemplateStringsArray, ...values: ResolvableRichText[]) => B;
	/** Format text as anchor link (in-document link) */
	anchorLink(
		anchorName: string,
	): (strings: TemplateStringsArray, ...values: ResolvableRichText[]) => B;
	/** Format text as a reference (referenced text) */
	reference(
		name: string,
	): (strings: TemplateStringsArray, ...values: ResolvableRichText[]) => B;
	/** Format text as a reference link (link to referenced text) */
	referenceLink(
		referenceName: string,
	): (strings: TemplateStringsArray, ...values: ResolvableRichText[]) => B;

	/** Format text as custom emoji (for inline custom emoji stickers) */
	customEmoji(customEmojiId: string, alternativeText: string): B;
	/** Format text as mathematical expression (raw LaTeX formula) */
	mathematicalExpression(expression: string): B;
	/** Format text as mention (@username) */
	mention(username: string, text?: ResolvableRichText): B;
	/** Format text as hashtag (#hashtag or #hashtag@chatusername) */
	hashtag(hashtag: string, text?: ResolvableRichText): B;
	/** Format text as cashtag ($USD or $USD@chatusername) */
	cashtag(cashtag: string, text?: ResolvableRichText): B;
	/** Format text as bot command (/start@jobs_bot) */
	botCommand(command: string, text?: ResolvableRichText): B;
	/** Add an inline button */
	button(button: TT.RichMessageButton): B;
	/** Add an in-document anchor name */
	anchor(anchorName: string): B;
}

/**
 * A builder for inline Telegram `RichText`.
 *
 * Unlike `EntityBuilder`, rich text is a tree rather than a flat string plus offsets,
 * so nesting is expressed structurally and no offset arithmetic is ever needed.
 *
 * @category Rich Message Builders
 * @useWhen - You are composing the inline text of a rich message block.
 * @avoidWhen - You are sending a classic text message with `entities` (use `EntityBuilder`).
 * @never - NEVER mutate the array returned by `build()`; it is a snapshot.
 *
 * @example
 * ```typescript
 * import { RichTextBuilder } from "@sunafterrainwm/telegram-entities-builder";
 *
 * const text = new RichTextBuilder().add('Hello ').bold('world').add('!').build();
 * // ["Hello ", { type: "bold", text: "world" }, "!"]
 * ```
 * @since Bot API 10.1
 */
export class RichTextBuilder {
	#nodes: TT.RichText[] = [];
	#parent?: RichTextBuilder;

	/**
	 * Appends nodes after checking that this builder may still be written to.
	 *
	 * Every mutating method funnels through here so that a frozen block reference has a
	 * single place to refuse the write.
	 */
	#push(...nodes: TT.RichText[]): void {
		this._assertWritable();
		this.#nodes.push(...nodes);
	}

	/**
	 * Hook for subclasses that can be frozen; the plain builder never refuses a write.
	 *
	 * @throws {TypeError} In a subclass, if the builder has been frozen.
	 */
	protected _assertWritable(): void {
		// A plain builder is always writable.
	}

	/**
	 * Indicates whether this builder is a fork that has not been merged yet.
	 */
	public get isFork(): boolean {
		return this.#parent !== undefined;
	}

	/**
	 * The parent builder, if this builder is an unmerged fork.
	 */
	public get parent(): RichTextBuilder | undefined {
		return this.#parent;
	}

	/**
	 * Indicates whether no node has been added yet.
	 */
	public get isEmpty(): boolean {
		return this.#nodes.length === 0;
	}

	/**
	 * Creates a child builder whose content can later be merged back into this one.
	 *
	 * @returns A new builder whose `merge()` appends its nodes here.
	 */
	public fork(): RichTextBuilder {
		const child = new RichTextBuilder();
		child.#parent = this;
		return child;
	}

	/**
	 * Appends this fork's content to its parent and detaches it.
	 *
	 * @throws {TypeError} If this builder is not a fork, or was merged already.
	 */
	public merge(): void {
		if (!this.#parent) {
			throw new TypeError(
				'Cannot merge: This builder is not a fork or has already been merged.',
			);
		}
		this.#parent.add(this.#nodes);
		this.#parent = undefined;
	}

	/**
	 * Creates an independent copy of this builder. The copy is never a fork.
	 *
	 * @returns A new builder holding a deep copy of the nodes.
	 */
	public clone(): RichTextBuilder {
		const instance = new RichTextBuilder();
		instance.#nodes = structuredClone(this.#nodes);
		return instance;
	}

	/**
	 * Adds resolvable rich text to the builder.
	 */
	public add(text: ResolvableRichText): this;
	/**
	 * Adds rich text written as a tagged template.
	 *
	 * @param strings - The literal parts of the template.
	 * @param values - The interpolated resolvable rich text.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 10.1
	 */
	public add(strings: TemplateStringsArray, ...values: ResolvableRichText[]): this;
	public add(
		text: ResolvableRichText | TemplateStringsArray,
		...values: ResolvableRichText[]
	): this {
		const resolvable: ResolvableRichText = isTemplateStrings(text)
			? interleaveTemplate(text, values)
			: text;
		const unwrapped = unwrapRichText(resolvable);
		if (Array.isArray(unwrapped)) {
			this.#push(...unwrapped);
		} else {
			this.#push(unwrapped);
		}
		return this;
	}

	/**
	 * Format text as bold (bold text).
	 *
	 * @param text - The content to format.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 10.1
	 */
	public bold(text: ResolvableRichText): this {
		this.#push({ type: 'bold', text: unwrapRichText(text) });
		return this;
	}

	/**
	 * Format text as italic (italic text).
	 *
	 * @param text - The content to format.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 10.1
	 */
	public italic(text: ResolvableRichText): this {
		this.#push({ type: 'italic', text: unwrapRichText(text) });
		return this;
	}

	/**
	 * Format text as underline (underlined text).
	 *
	 * @param text - The content to format.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 10.1
	 */
	public underline(text: ResolvableRichText): this {
		this.#push({ type: 'underline', text: unwrapRichText(text) });
		return this;
	}

	/**
	 * Format text as strikethrough (strikethrough text).
	 *
	 * @param text - The content to format.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 10.1
	 */
	public strikethrough(text: ResolvableRichText): this {
		this.#push({ type: 'strikethrough', text: unwrapRichText(text) });
		return this;
	}

	/**
	 * Format text as spoiler (spoiler message).
	 *
	 * @param text - The content to format.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 10.1
	 */
	public spoiler(text: ResolvableRichText): this {
		this.#push({ type: 'spoiler', text: unwrapRichText(text) });
		return this;
	}

	/**
	 * Format text as subscript (subscript text).
	 *
	 * @param text - The content to format.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 10.1
	 */
	public subscript(text: ResolvableRichText): this {
		this.#push({ type: 'subscript', text: unwrapRichText(text) });
		return this;
	}

	/**
	 * Format text as superscript (superscript text).
	 *
	 * @param text - The content to format.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 10.1
	 */
	public superscript(text: ResolvableRichText): this {
		this.#push({ type: 'superscript', text: unwrapRichText(text) });
		return this;
	}

	/**
	 * Format text as marked (marked text).
	 *
	 * @param text - The content to format.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 10.1
	 */
	public marked(text: ResolvableRichText): this {
		this.#push({ type: 'marked', text: unwrapRichText(text) });
		return this;
	}

	/**
	 * Format text as code (inline fixed-width code).
	 *
	 * @param text - The content to format.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 10.1
	 */
	public code(text: ResolvableRichText): this {
		this.#push({ type: 'code', text: unwrapRichText(text) });
		return this;
	}

	/**
	 * Format text as date_time (formatted date and time).
	 *
	 * @param text - The content to format.
	 * @param unixTime - The Unix time the entity refers to.
	 * @param format - How the client renders the date and time.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 10.1
	 */
	public dateTime(
		text: ResolvableRichText,
		unixTime: number,
		format: TT.RichTextDateTime['date_time_format'],
	): this {
		this.#push({
			type: 'date_time',
			text: unwrapRichText(text),
			unix_time: unixTime,
			date_time_format: format,
		});
		return this;
	}

	/**
	 * Format text as text_mention (for users without usernames).
	 *
	 * @param text - The content to format.
	 * @param user - The mentioned user; only `id` is read when sending.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 10.1
	 */
	public textMention(text: ResolvableRichText, user: TT.User): this {
		this.#push({ type: 'text_mention', text: unwrapRichText(text), user });
		return this;
	}

	/**
	 * Format text as URL (https://telegram.org).
	 *
	 * @param text - The content to format.
	 * @param url - URL that is opened when the text is tapped.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 10.1
	 */
	public url(text: ResolvableRichText, url: string): this {
		this.#push({ type: 'url', text: unwrapRichText(text), url });
		return this;
	}

	/**
	 * Format text as email address (do-not-reply@telegram.org).
	 *
	 * @param text - The content to format.
	 * @param emailAddress - The email address the text links to.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 10.1
	 */
	public emailAddress(text: ResolvableRichText, emailAddress: string): this {
		this.#push({
			type: 'email_address',
			text: unwrapRichText(text),
			email_address: emailAddress,
		});
		return this;
	}

	/**
	 * Format text as phone number (+1-212-555-0123).
	 *
	 * @param text - The content to format.
	 * @param phoneNumber - The phone number the text links to.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 10.1
	 */
	public phoneNumber(text: ResolvableRichText, phoneNumber: string): this {
		this.#push({
			type: 'phone_number',
			text: unwrapRichText(text),
			phone_number: phoneNumber,
		});
		return this;
	}

	/**
	 * Format text as bank card number (e.g. 4242 4242 4242 4242).
	 *
	 * @param text - The content to format.
	 * @param bankCardNumber - The bank card number the text refers to.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 10.1
	 */
	public bankCardNumber(text: ResolvableRichText, bankCardNumber: string): this {
		this.#push({
			type: 'bank_card_number',
			text: unwrapRichText(text),
			bank_card_number: bankCardNumber,
		});
		return this;
	}

	/**
	 * Format text as anchor link (in-document link).
	 *
	 * @param text - The content to format.
	 * @param anchorName - Name of the anchor to jump to.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 10.1
	 */
	public anchorLink(text: ResolvableRichText, anchorName: string): this {
		this.#push({
			type: 'anchor_link',
			text: unwrapRichText(text),
			anchor_name: anchorName,
		});
		return this;
	}

	/**
	 * Format text as a reference (referenced text).
	 *
	 * @param text - The content to format.
	 * @param name - Name under which the anchor or reference is defined.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 10.1
	 */
	public reference(text: ResolvableRichText, name: string): this {
		this.#push({ type: 'reference', text: unwrapRichText(text), name });
		return this;
	}

	/**
	 * Format text as a reference link (link to referenced text).
	 *
	 * @param text - The content to format.
	 * @param referenceName - Name of the reference to jump to.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 10.1
	 */
	public referenceLink(text: ResolvableRichText, referenceName: string): this {
		this.#push({
			type: 'reference_link',
			text: unwrapRichText(text),
			reference_name: referenceName,
		});
		return this;
	}

	/**
	 * Format text as mention (@username).
	 *
	 * @param username - The username to mention.
	 * @param text - The text to display; defaults to the first argument.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 10.1
	 */
	public mention(username: string, text: ResolvableRichText = username): this {
		this.#push({ type: 'mention', text: unwrapRichText(text), username });
		return this;
	}

	/**
	 * Format text as hashtag (#hashtag or #hashtag@chatusername).
	 *
	 * @param hashtag - The hashtag, leading `#` included.
	 * @param text - The text to display; defaults to the first argument.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 10.1
	 */
	public hashtag(hashtag: string, text: ResolvableRichText = hashtag): this {
		this.#push({ type: 'hashtag', text: unwrapRichText(text), hashtag });
		return this;
	}

	/**
	 * Format text as cashtag ($USD or $USD@chatusername).
	 *
	 * @param cashtag - The cashtag, leading `$` included.
	 * @param text - The text to display; defaults to the first argument.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 10.1
	 */
	public cashtag(cashtag: string, text: ResolvableRichText = cashtag): this {
		this.#push({ type: 'cashtag', text: unwrapRichText(text), cashtag });
		return this;
	}

	/**
	 * Format text as bot command (/start@jobs_bot).
	 *
	 * @param command - The bot command, leading `/` included.
	 * @param text - The text to display; defaults to the first argument.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 10.1
	 */
	public botCommand(command: string, text: ResolvableRichText = command): this {
		this.#push({
			type: 'bot_command',
			text: unwrapRichText(text),
			bot_command: command,
		});
		return this;
	}

	/**
	 * Format text as custom emoji (for inline custom emoji stickers).
	 *
	 * @param customEmojiId - Identifier of the custom emoji sticker.
	 * @param alternativeText - Emoji shown where the custom emoji cannot be rendered.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 10.1
	 */
	public customEmoji(customEmojiId: string, alternativeText: string): this {
		this.#push({
			type: 'custom_emoji',
			custom_emoji_id: customEmojiId,
			alternative_text: alternativeText,
		});
		return this;
	}

	/**
	 * Format text as mathematical expression (raw LaTeX formula).
	 *
	 * @param expression - The expression in LaTeX format.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 10.1
	 */
	public mathematicalExpression(expression: string): this {
		this.#push({ type: 'mathematical_expression', expression });
		return this;
	}

	/**
	 * Adds an inline button, which the `button` factory helpers construct.
	 *
	 * @param button - The button to show. See `button` for factory helpers.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 10.3
	 */
	public button(button: TT.RichMessageButton): this {
		this.#push({ type: 'button', button });
		return this;
	}

	/**
	 * Adds an in-document anchor name.
	 *
	 * @param anchorName - Name of the anchor to jump to.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 10.1
	 */
	public anchor(anchorName: string): this {
		this.#push({ type: 'anchor', name: anchorName });
		return this;
	}

	/**
	 * Returns a snapshot of the nodes collected so far.
	 *
	 * @returns The nodes, as a fresh array that the builder no longer owns.
	 */
	public build(): TT.RichText[] {
		return [...this.#nodes];
	}

	/**
	 * Returns the collected nodes as a single `RichText` value, collapsing a lone node
	 * out of its array.
	 *
	 * @returns The nodes as one `RichText`, ready to drop into a block.
	 */
	public buildText(): TT.RichText {
		return collapse(this.build());
	}

	/**
	 * Measures the content collected so far, in the unit the Bot API counts.
	 *
	 * The unit is Unicode **code points**, not UTF-16 code units: the server accepts
	 * 16385 astral characters (32770 code units) and rejects 32769 ASCII ones. The
	 * classic side of this package counts UTF-16 code units for `MessageEntity.offset`,
	 * so do not compare the two numbers.
	 *
	 * @returns The number of code points this text contributes to a message.
	 * @since Bot API 10.1
	 */
	public measureText(): number {
		return measureRichText(this.build());
	}
}

const fmt = createFormatter<ResolvableRichText, RichTextBuilder>({
	Builder: RichTextBuilder,
});

/**
 * Tagged template literal that composes a {@link RichTextBuilder} out of strings and
 * resolvable rich text.
 *
 * @example
 * ```typescript
 * import { formatRichText, fr } from "@sunafterrainwm/telegram-entities-builder";
 *
 * formatRichText`Hello ${fr.bold`world`}!`.build();
 * // ["Hello ", { type: "bold", text: "world" }, "!"]
 * ```
 *
 * @category Rich Message Functions
 * @since Bot API 10.1
 */
export const formatRichText = fmt.mergeTpl;

/**
 * Format helpers for the {@link formatRichText} tagged template literal.
 *
 * Every helper doubles as a tagged template (``fr.bold`text` ``) and, when handed a
 * builder, returns a tagged template bound to it — which is how `builder.fr` works.
 *
 * @category Rich Message Functions
 * @since Bot API 10.1
 */
export const fr = Object.assign(formatRichText, {
	bold: fmt.style('bold'),
	italic: fmt.style('italic'),
	underline: fmt.style('underline'),
	strikethrough: fmt.style('strikethrough'),
	spoiler: fmt.style('spoiler'),
	subscript: fmt.style('subscript'),
	superscript: fmt.style('superscript'),
	marked: fmt.style('marked'),
	code: fmt.style('code'),

	dateTime: fmt.styleWithParam('dateTime'),
	url: fmt.styleWithParam('url', true),
	emailAddress: fmt.styleWithParam('emailAddress', true),
	phoneNumber: fmt.styleWithParam('phoneNumber', true),
	bankCardNumber: fmt.styleWithParam('bankCardNumber', true),
	textMention: fmt.styleWithParam('textMention'),
	anchorLink: fmt.styleWithParam('anchorLink'),
	reference: fmt.styleWithParam('reference'),
	referenceLink: fmt.styleWithParam('referenceLink'),

	customEmoji: fmt.embed('customEmoji'),
	mathematicalExpression: fmt.embed('mathematicalExpression'),
	mention: fmt.embed('mention'),
	hashtag: fmt.embed('hashtag'),
	cashtag: fmt.embed('cashtag'),
	botCommand: fmt.embed('botCommand'),
	button: fmt.embed('button'),
	anchor: fmt.embed('anchor'),
}) satisfies FormatRichTextHelpers<RichTextBuilder>;
