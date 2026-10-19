import type * as TT from '@grammyjs/types';

import { createFormatter } from './utils/formatter.ts';

type Telegram = TT.ApiMethods<never>;
type ApiParameters<T extends keyof Telegram> = Parameters<Telegram[T]>[0];

/**
 * Represents a Telegram MessageEntity without the offset and length properties.
 * @category Types
 */
export type PartialEntity<E extends TT.MessageEntity = TT.MessageEntity> = Omit<
	E,
	'offset' | 'length'
>;
/**
 * Represents any draft entity that can be used before calculating the final offset and length.
 */
export type AnyDraftEntity =
	| PartialEntity<TT.MessageEntity.CommonMessageEntity>
	| PartialEntity<TT.MessageEntity.CustomEmojiMessageEntity>
	| PartialEntity<TT.MessageEntity.PreMessageEntity>
	| PartialEntity<TT.MessageEntity.TextLinkMessageEntity>
	| PartialEntity<TT.MessageEntity.TextMentionMessageEntity>
	| PartialEntity<TT.MessageEntity.DateTimeMessageEntity>;

/**
 * Represents a segment of text which may contain one or multiple entities.
 * @category Core Types
 */
export type TextSegment = TextSegment.SingleTextSegment | TextSegment.MultiTextSegment;

/**
 * Namespace for TextSegment types.
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
export declare namespace TextSegment {
	/** Represents a single text segment which solves the problem of binding text to one entity. */
	interface SingleTextSegment {
		/** The text content to be appended. */
		text: string;
		/** The specific draft entity applied to this text. */
		entity?: AnyDraftEntity;
		/** Must be absent for single segments. */
		entities?: never;
	}

	/** Represents a multi-text segment which solves the problem of binding text to overlapping or nested entities. */
	interface MultiTextSegment {
		/** The text content to be appended. */
		text: string;
		/** Must be absent for multi segments. */
		entity?: never;
		/** The list of draft entities applied to this text. */
		entities: AnyDraftEntity[];
	}
}

/**
 * Strips the positional fields off an entity, leaving a reusable draft.
 *
 * @internal
 */
function toDraftEntity(entity: TT.MessageEntity): AnyDraftEntity {
	const draft: Record<string, unknown> = { ...entity };
	delete draft.offset;
	delete draft.length;
	return draft as unknown as AnyDraftEntity;
}

/**
 * Creates a type with some properties required and some optional.
 *
 * @internal
 */
type PartialRequired<
	T,
	REQUIRED extends keyof T,
	OPTIONAL extends keyof T = never,
> = Required<Pick<T, REQUIRED>> & Pick<T, OPTIONAL>;

/**
 * A resolvable text type, which can be a string, a TextSegment, a builder function, an IEntityBuilderBase, or an array of resolvables.
 */
export type ResolvableEntityItem =
	| string
	| TextSegment
	| ((builder: IEntityBuilderBase) => void)
	| IEntityBuilderBase
	| ResolvableEntityItem[];

/**
 * Appends a {@link ResolvableEntityItem} to a builder.
 *
 * @param builder - The builder to append to.
 * @param text - The item to resolve.
 *
 * @example
 * ```typescript
 * const builder = new EntityBuilder();
 * unwrapText(builder, ['plain ', { text: 'bold', entity: { type: 'bold' } }]);
 * ```
 *
 * @internal
 */
export function unwrapText(
	builder: IEntityBuilderBase,
	text: ResolvableEntityItem,
): void {
	if (typeof text === 'string') {
		builder.addText(text);
	} else if (typeof text === 'function') {
		text(builder);
	} else if (Array.isArray(text)) {
		for (const item of text) {
			unwrapText(builder, item);
		}
	} else if (text instanceof IEntityBuilderBase) {
		// The content is copied, so the source stays usable. A fork is still expected to
		// be handed back with `merge()`; adding one copies it and leaves it mergeable.
		builder.addTextSegmentList(text.toSegments());
	} else if ('text' in text) {
		builder.addTextSegmentList([text]);
	}
}

/**
 * Format helpers bound to an entity builder, exposed as `builder.f`.
 *
 * @category Types
 */
export interface BoundFormatText<B extends IEntityBuilderBase> {
	/** Format text as bold (bold text) */
	bold(strings: TemplateStringsArray, ...values: ResolvableEntityItem[]): B;
	/** Format text as italic (italic text) */
	italic(strings: TemplateStringsArray, ...values: ResolvableEntityItem[]): B;
	/** Format text as underline (underlined text) */
	underline(strings: TemplateStringsArray, ...values: ResolvableEntityItem[]): B;
	/** Format text as strikethrough (strikethrough text) */
	strikethrough(strings: TemplateStringsArray, ...values: ResolvableEntityItem[]): B;
	/** Format text as spoiler (spoiler message) */
	spoiler(strings: TemplateStringsArray, ...values: ResolvableEntityItem[]): B;
	/** Format text as blockquote (block quotation) */
	blockquote(strings: TemplateStringsArray, ...values: ResolvableEntityItem[]): B;
	/** Format text as expandable blockquote (collapsed-by-default block quotation) */
	expandableBlockquote(
		strings: TemplateStringsArray,
		...values: ResolvableEntityItem[]
	): B;
	/** Format text as code (monowidth string) */
	code(strings: TemplateStringsArray, ...values: ResolvableEntityItem[]): B;
	/** Format text as mention (@username) */
	mention(strings: TemplateStringsArray, ...values: ResolvableEntityItem[]): B;
	/** Format text as hashtag (#hashtag or #hashtag@chatusername) */
	hashtag(strings: TemplateStringsArray, ...values: ResolvableEntityItem[]): B;
	/** Format text as cashtag ($USD or $USD@chatusername) */
	cashtag(strings: TemplateStringsArray, ...values: ResolvableEntityItem[]): B;
	/** Format text as bot command (/start@jobs_bot) */
	botCommand(strings: TemplateStringsArray, ...values: ResolvableEntityItem[]): B;
	/** Format text as email address (do-not-reply@telegram.org) */
	emailAddress(strings: TemplateStringsArray, ...values: ResolvableEntityItem[]): B;
	/** Format text as phone number (+1-212-555-0123) */
	phoneNumber(strings: TemplateStringsArray, ...values: ResolvableEntityItem[]): B;

	/** Format text as pre (monowidth block), optionally with a programming language */
	pre(
		language?: string,
	): (strings: TemplateStringsArray, ...values: ResolvableEntityItem[]) => B;
	/** Format text as URL (https://telegram.org) or text link (for clickable text URLs) */
	url(url?: string): {
		// eslint-disable-next-line @typescript-eslint/unified-signatures
		(strings: TemplateStringsArray, ...values: ResolvableEntityItem[]): B;
		(): B;
	};
	/** Format text as text mention (for users without usernames) */
	textMention(
		user: TT.User,
	): (strings: TemplateStringsArray, ...values: ResolvableEntityItem[]) => B;
	/** Format text as custom emoji (for inline custom emoji stickers) */
	customEmoji(
		customEmojiId: string,
	): (strings: TemplateStringsArray, ...values: ResolvableEntityItem[]) => B;
	/** Format text as date_time (formatted date and time) */
	dateTime(
		unixTime: number,
		format: TT.MessageEntity.DateTimeMessageEntity['date_time_format'],
	): (strings: TemplateStringsArray, ...values: ResolvableEntityItem[]) => B;
}

/**
 * Base interface for entity builders, providing fundamental operations for appending text and managing builder state.
 */
export abstract class IEntityBuilderBase {
	/**
	 * Proxy getter for format helpers bound to this builder.
	 */
	public abstract readonly f: BoundFormatText<this>;

	/**
	 * Appends plain text.
	 *
	 * @param text - The text to append.
	 * @returns The current builder instance for chaining.
	 */
	public abstract addText(text: string): this;
	/**
	 * Appends text with a single entity.
	 *
	 * @param text - The text to append.
	 * @param entity - The entity to apply to the text.
	 * @returns The current builder instance for chaining.
	 */
	public abstract addTextEntity(text: string, entity: AnyDraftEntity): this;
	/**
	 * Appends text with multiple entities.
	 *
	 * @param text - The text to append.
	 * @param entities - An array of entities to apply to the text.
	 * @returns The current builder instance for chaining.
	 */
	public abstract addTextEntities(text: string, entities: AnyDraftEntity[]): this;
	/**
	 * Appends a list of text segments.
	 *
	 * @param segments - An array of text segments, each optionally containing entities.
	 * @returns The current builder instance for chaining.
	 */
	public abstract addTextSegmentList(segments: TextSegment[]): this;

	/**
	 * Appends a resolvable item: a string, a segment, a callback, another builder, or
	 * any nesting of those.
	 *
	 * @param text - The item to append.
	 * @returns The current builder instance for chaining.
	 */
	public abstract add(text: ResolvableEntityItem): this;

	/**
	 * Format text as bold (bold text).
	 *
	 * @param text - The content to format.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 1.0
	 */
	public abstract bold(text: ResolvableEntityItem): this;
	/**
	 * Format text as italic (italic text).
	 *
	 * @param text - The content to format.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 1.0
	 */
	public abstract italic(text: ResolvableEntityItem): this;
	/**
	 * Format text as underline (underlined text).
	 *
	 * @param text - The content to format.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 4.5
	 */
	public abstract underline(text: ResolvableEntityItem): this;
	/**
	 * Format text as strikethrough (strikethrough text).
	 *
	 * @param text - The content to format.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 4.5
	 */
	public abstract strikethrough(text: ResolvableEntityItem): this;
	/**
	 * Format text as spoiler (spoiler message).
	 *
	 * @param text - The content to format.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 5.6
	 */
	public abstract spoiler(text: ResolvableEntityItem): this;
	/**
	 * Format text as blockquote (block quotation).
	 *
	 * @param text - The content to format.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 7.0
	 */
	public abstract blockquote(text: ResolvableEntityItem): this;
	/**
	 * Format text as expandable blockquote (collapsed-by-default block quotation).
	 *
	 * @param text - The content to format.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 7.4
	 */
	public abstract expandableBlockquote(text: ResolvableEntityItem): this;
	/**
	 * Format text as code (monowidth string).
	 *
	 * @param text - The content to format.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 1.0
	 */
	public abstract code(text: ResolvableEntityItem): this;
	/**
	 * Format text as pre (monowidth block), optionally with a programming language.
	 *
	 * @param text - The content to format.
	 * @param language - Programming language of the block; omitted when not given.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 1.0
	 */
	public abstract pre(text: ResolvableEntityItem, language?: string): this;

	/**
	 * Format text as mention (@username).
	 *
	 * @param text - The content to format.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 1.0
	 */
	public abstract mention(text: ResolvableEntityItem): this;
	/**
	 * Format text as hashtag (#hashtag or #hashtag@chatusername).
	 *
	 * @param text - The content to format.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 1.0
	 */
	public abstract hashtag(text: ResolvableEntityItem): this;
	/**
	 * Format text as cashtag ($USD or $USD@chatusername).
	 *
	 * @param text - The content to format.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 4.0
	 */
	public abstract cashtag(text: ResolvableEntityItem): this;
	/**
	 * Format text as bot command (/start@jobs_bot).
	 *
	 * @param text - The content to format.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 1.0
	 */
	public abstract botCommand(text: ResolvableEntityItem): this;
	/**
	 * Format text as email address (do-not-reply@telegram.org).
	 *
	 * @param text - The content to format.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 1.0
	 */
	public abstract emailAddress(text: ResolvableEntityItem): this;
	/**
	 * Format text as phone number (+1-212-555-0123).
	 *
	 * @param text - The content to format.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 4.0
	 */
	public abstract phoneNumber(text: ResolvableEntityItem): this;

	/**
	 * Format text as URL (https://telegram.org) or text link (for clickable text URLs).
	 *
	 * @param text - The content to format.
	 * @param url - URL that is opened when the text is tapped.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 1.0
	 */
	public abstract url(text: ResolvableEntityItem, url?: string): this;
	/**
	 * Format text as text mention (for users without usernames).
	 *
	 * @param text - The content to format.
	 * @param user - The mentioned user; only `id` is read when sending.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 2.1
	 */
	public abstract textMention(text: ResolvableEntityItem, user: TT.User): this;
	/**
	 * Format text as custom emoji (for inline custom emoji stickers).
	 *
	 * @param text - The content to format.
	 * @param customEmojiId - Identifier of the custom emoji sticker.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 6.2
	 */
	public abstract customEmoji(text: ResolvableEntityItem, customEmojiId: string): this;
	/**
	 * Format text as date_time (formatted date and time).
	 *
	 * @param text - The content to format.
	 * @param unixTime - The Unix time the entity refers to.
	 * @param format - How the client renders the date and time.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 9.5
	 */
	public abstract dateTime(
		text: ResolvableEntityItem,
		unixTime: number,
		format: TT.MessageEntity.DateTimeMessageEntity['date_time_format'],
	): this;

	/**
	 * Flattens the accumulated content into a list of text segments.
	 *
	 * This is the lowest common denominator between the eager and the lazy builder, and
	 * is how one builder's content is appended to another.
	 *
	 * @returns A list of segments equivalent to this builder's content.
	 */
	public abstract toSegments(): TextSegment[];

	/**
	 * Creates a deep clone of this builder.
	 *
	 * @returns A new instance of the builder with cloned state.
	 */
	public abstract clone(): IEntityBuilderBase;
	/**
	 * Creates a child builder that forks from this instance.
	 *
	 * @returns A new child builder instance.
	 */
	public abstract fork(): IEntityBuilderBase;
	/**
	 * Merges a forked builder back into its parent.
	 *
	 * @param wrapperEntities - Optional entities to wrap around the merged block.
	 * @throws {Error} If this builder is not a fork or has already been merged.
	 */
	public abstract merge(wrapperEntities?: AnyDraftEntity[]): void;

	/**
	 * Indicates if this builder is a fork and has not been merged yet.
	 */
	public abstract readonly hasParent: boolean;
}

/**
 * Payload for sending a text message.
 */
export interface InputText extends PartialRequired<
	ApiParameters<'sendMessage'>,
	'text' | 'entities',
	'link_preview_options'
> {}

/**
 * Payload for sending a document with a caption.
 */
export interface InputCaption extends PartialRequired<
	ApiParameters<'sendDocument'>,
	'caption' | 'caption_entities'
> {}

/**
 * Payload for answering an inline query with text.
 */
export interface InputInline extends PartialRequired<
	TT.InputTextMessageContent,
	'message_text' | 'entities',
	'link_preview_options'
> {}

/**
 * Represents the core entity builder which provides high-level text manipulation operations.
 * @category Core Types
 */
export abstract class IEntityBuilder extends IEntityBuilderBase {
	/**
	 * Trims or slices the string in-place, and automatically recalculates, filters, or truncates the affected entities.
	 *
	 * @param start - The zero-based index at which to start extraction.
	 * @param end - The zero-based index before which to end extraction.
	 * @returns The current builder instance for chaining.
	 */
	public abstract sliceInplace(start?: number, end?: number): this;
	/**
	 * Returns a new sliced instance.
	 *
	 * @param start - The zero-based index at which to start extraction.
	 * @param end - The zero-based index before which to end extraction.
	 * @returns A new IEntityBuilder instance containing the sliced content.
	 */
	public abstract slice(start?: number, end?: number): IEntityBuilder;
	/**
	 * Removes leading whitespace in-place.
	 *
	 * @returns The current builder instance for chaining.
	 */
	public abstract trimStart(): this;
	/**
	 * Removes trailing whitespace in-place.
	 *
	 * @returns The current builder instance for chaining.
	 */
	public abstract trimEnd(): this;
	/**
	 * Removes leading and trailing whitespace in-place.
	 *
	 * @returns The current builder instance for chaining.
	 */
	public abstract trim(): this;

	/**
	 * Sorts the entities based on their offset and length.
	 *
	 * @returns The current builder instance for chaining.
	 */
	public abstract sortEntities(): this;

	/**
	 * Builds the payload for sending a text message.
	 *
	 * @returns The final text payload object suitable for Grammy's API.
	 */
	public abstract buildText(): InputText;
	/**
	 * Builds the payload for sending a document with a caption.
	 *
	 * @returns The final caption payload object suitable for Grammy's API.
	 */
	public abstract buildCaption(): InputCaption;
	/**
	 * Builds the payload for inline query results.
	 *
	 * @returns The final inline payload object suitable for Grammy's API.
	 */
	public abstract buildInline(): InputInline;

	public abstract clone(): IEntityBuilder;
	public abstract fork(): IEntityBuilder;
}

/**
 * Main implementation of IEntityBuilder that eagerly evaluates and stores entities.
 *
 * @category Classes
 * @useWhen - You need to incrementally build message text with overlapping entities and perform text manipulation (slice/trim).
 * @avoidWhen - You are dealing with entirely pre-calculated entities where simple string concatenation is sufficient.
 * @never - NEVER mutate the returned payload entities directly. Fix: Fork or clone the builder and modify text there.
 *
 * @example
 * ```typescript
 * const builder = new EntityBuilder();
 * builder.addTextEntity("Hello", { type: "bold" });
 * const message = builder.buildText();
 * // payload.text === "Hello"
 * ```
 */
export class EntityBuilder extends IEntityBuilder {
	/** The accumulated plain text. */
	#text = '';
	/** The eagerly evaluated entities. */
	#entities: TT.MessageEntity[] = [];
	/** The parent builder if this is a fork. */
	#parent?: EntityBuilder;

	/** @inheritDoc */
	public get hasParent(): boolean {
		return this.#parent !== undefined;
	}

	/** @inheritDoc */
	public get f(): BoundFormatText<this> {
		return new Proxy(f, {
			get: (target, prop) => {
				if (prop in target) {
					return (
						target[prop as keyof typeof f] as (builder: IEntityBuilderBase) => unknown
					)(this);
				}
				return undefined;
			},
		}) as unknown as BoundFormatText<this>;
	}

	/**
	 * @inheritDoc.
	 *
	 * @param text - The content to format.
	 * @returns The current builder instance for chaining.
	 */
	public addText(text: string): this {
		this.#text += text;
		return this;
	}

	/**
	 * @inheritDoc.
	 *
	 * @param text - The content to format.
	 * @param entity - The draft entity to apply to the text.
	 * @returns The current builder instance for chaining.
	 */
	public addTextEntity(text: string, entity: AnyDraftEntity): this {
		return this.addTextEntities(text, [entity]);
	}

	/**
	 * @inheritDoc.
	 *
	 * @param text - The content to format.
	 * @param entities - The draft entities to apply to the text.
	 * @returns The current builder instance for chaining.
	 */
	public addTextEntities(text: string, entities: AnyDraftEntity[]): this {
		// A zero-length entity is rejected by Telegram, so empty text is added bare.
		if (text.length > 0) {
			for (const entity of entities) {
				this.#entities.push({
					...entity,
					offset: this.#text.length,
					length: text.length,
				});
			}
		}
		this.#text += text;
		return this;
	}

	/**
	 * @inheritDoc.
	 *
	 * @param segments - The segments to append, in order.
	 * @returns The current builder instance for chaining.
	 */
	public addTextSegmentList(segments: TextSegment[]): this {
		for (const segment of segments) {
			if (segment.entities) {
				this.addTextEntities(segment.text, segment.entities);
			} else if (segment.entity) {
				this.addTextEntity(segment.text, segment.entity);
			} else {
				this.addText(segment.text);
			}
		}
		return this;
	}

	public add(text: ResolvableEntityItem): this {
		unwrapText(this, text);
		return this;
	}

	/**
	 * Appends an item wrapped in one entity, forking when the item is not a bare string.
	 *
	 * @param text - The item to wrap.
	 * @param entity - The entity to apply to it.
	 * @returns The current builder instance for chaining.
	 */
	protected _wrapEntity(text: ResolvableEntityItem, entity: AnyDraftEntity): this {
		if (typeof text === 'string') {
			this.addTextEntity(text, entity);
		} else {
			const child = this.fork();
			child.add(text);
			child.merge([entity]);
		}
		return this;
	}

	public bold(text: ResolvableEntityItem): this {
		return this._wrapEntity(text, { type: 'bold' });
	}
	public italic(text: ResolvableEntityItem): this {
		return this._wrapEntity(text, { type: 'italic' });
	}
	public underline(text: ResolvableEntityItem): this {
		return this._wrapEntity(text, { type: 'underline' });
	}
	public strikethrough(text: ResolvableEntityItem): this {
		return this._wrapEntity(text, { type: 'strikethrough' });
	}
	public spoiler(text: ResolvableEntityItem): this {
		return this._wrapEntity(text, { type: 'spoiler' });
	}
	public blockquote(text: ResolvableEntityItem): this {
		return this._wrapEntity(text, { type: 'blockquote' });
	}
	public expandableBlockquote(text: ResolvableEntityItem): this {
		return this._wrapEntity(text, { type: 'expandable_blockquote' });
	}
	public code(text: ResolvableEntityItem): this {
		return this._wrapEntity(text, { type: 'code' });
	}
	public mention(text: ResolvableEntityItem): this {
		return this._wrapEntity(text, { type: 'mention' });
	}
	public hashtag(text: ResolvableEntityItem): this {
		return this._wrapEntity(text, { type: 'hashtag' });
	}
	public cashtag(text: ResolvableEntityItem): this {
		return this._wrapEntity(text, { type: 'cashtag' });
	}
	public botCommand(text: ResolvableEntityItem): this {
		return this._wrapEntity(text, { type: 'bot_command' });
	}
	public emailAddress(text: ResolvableEntityItem): this {
		return this._wrapEntity(text, { type: 'email' });
	}
	public phoneNumber(text: ResolvableEntityItem): this {
		return this._wrapEntity(text, { type: 'phone_number' });
	}
	public pre(text: ResolvableEntityItem, language?: string): this {
		// An empty `language` is not the same as no language at all, so it is omitted.
		return this._wrapEntity(
			text,
			language === undefined ? { type: 'pre' } : { type: 'pre', language },
		);
	}
	public url(text: ResolvableEntityItem, url?: string): this {
		return this._wrapEntity(text, url ? { type: 'text_link', url } : { type: 'url' });
	}
	public textMention(text: ResolvableEntityItem, user: TT.User): this {
		return this._wrapEntity(text, { type: 'text_mention', user });
	}
	public customEmoji(text: ResolvableEntityItem, customEmojiId: string): this {
		return this._wrapEntity(text, {
			type: 'custom_emoji',
			custom_emoji_id: customEmojiId,
		});
	}
	public dateTime(
		text: ResolvableEntityItem,
		unixTime: number,
		format: TT.MessageEntity.DateTimeMessageEntity['date_time_format'],
	): this {
		return this._wrapEntity(text, {
			type: 'date_time',
			unix_time: unixTime,
			date_time_format: format,
		});
	}

	/**
	 * @inheritDoc.
	 *
	 * @returns The current builder instance for chaining.
	 */
	public toSegments(): TextSegment[] {
		if (this.#text.length === 0) {
			return [];
		}
		if (this.#entities.length === 0) {
			return [{ text: this.#text }];
		}

		// Cut the text at every entity boundary, then hand each piece the entities that
		// cover it in full. Re-adding the result reproduces the same formatting.
		const bounds = new Set<number>([0, this.#text.length]);
		for (const entity of this.#entities) {
			for (const bound of [entity.offset, entity.offset + entity.length]) {
				if (bound > 0 && bound < this.#text.length) {
					bounds.add(bound);
				}
			}
		}

		const points = [...bounds].sort((a, b) => a - b);
		const segments: TextSegment[] = [];

		for (let i = 0; i + 1 < points.length; i++) {
			const start = points[i];

			const end = points[i + 1];
			const text = this.#text.slice(start, end);
			const entities = this.#entities
				.filter(
					(entity) => entity.offset <= start && entity.offset + entity.length >= end,
				)
				.map(toDraftEntity);

			segments.push(entities.length > 0 ? { text, entities } : { text });
		}

		return segments;
	}

	/**
	 * @inheritDoc.
	 *
	 * @returns The current builder instance for chaining.
	 */
	public buildText(): InputText {
		return {
			text: this.#text,
			entities: this.#entities,
		};
	}

	/**
	 * @inheritDoc.
	 *
	 * @returns The current builder instance for chaining.
	 */
	public buildCaption(): InputCaption {
		return {
			caption: this.#text,
			caption_entities: this.#entities,
		};
	}

	/**
	 * @inheritDoc.
	 *
	 * @returns The current builder instance for chaining.
	 */
	public buildInline(): InputInline {
		return {
			message_text: this.#text,
			entities: this.#entities,
		};
	}

	/**
	 * @inheritDoc.
	 *
	 * @returns The current builder instance for chaining.
	 */
	public sortEntities() {
		this.#entities.sort((a, b) => a.offset - b.offset || a.length - b.length);
		return this;
	}

	/**
	 * @inheritDoc.
	 *
	 * @param start - See the type for what this controls.
	 * @param end - See the type for what this controls.
	 * @returns The current builder instance for chaining.
	 */
	public sliceInplace(start?: number, end?: number): this {
		if (start === undefined && end === undefined) {
			return this;
		}

		const len = this.#text.length;

		const s =
			start === undefined
				? 0
				: start < 0
					? Math.max(len + start, 0)
					: Math.min(start, len);
		const e =
			end === undefined ? len : end < 0 ? Math.max(len + end, 0) : Math.min(end, len);

		if (s >= e) {
			this.#text = '';
			this.#entities = [];
			return this;
		}

		this.#text = this.#text.slice(s, e);
		this.#entities = this.#entities.flatMap<TT.MessageEntity>((entity) => {
			// Calculate the intersection of the entity range and the retained text range [s, e)
			const overlapStart = Math.max(s, entity.offset);
			const overlapEnd = Math.min(e, entity.offset + entity.length);

			// If the overlap length is greater than 0, a portion of this entity survives in the new string
			if (overlapStart < overlapEnd) {
				return [
					{
						...entity,
						offset: overlapStart - s,
						length: overlapEnd - overlapStart,
					},
				];
			}

			// Exclude entities with no overlap
			return [];
		});

		return this;
	}

	/**
	 * @inheritDoc.
	 *
	 * @param start - See the type for what this controls.
	 * @param end - See the type for what this controls.
	 * @returns The current builder instance for chaining.
	 */
	public slice(start?: number, end?: number): EntityBuilder {
		return this.clone().sliceInplace(start, end);
	}

	/**
	 * @inheritDoc.
	 *
	 * @returns The current builder instance for chaining.
	 */
	public trimStart(): this {
		const trimmedLength = this.#text.trimStart().length;
		const diff = this.#text.length - trimmedLength;
		if (diff > 0) {
			this.sliceInplace(diff);
		}

		return this;
	}

	/**
	 * @inheritDoc.
	 *
	 * @returns The current builder instance for chaining.
	 */
	public trimEnd(): this {
		const trimmedLength = this.#text.trimEnd().length;
		if (trimmedLength < this.#text.length) {
			this.sliceInplace(0, trimmedLength);
		}

		return this;
	}

	/**
	 * @inheritDoc.
	 *
	 * @returns The current builder instance for chaining.
	 */
	public trim(): this {
		const originalLength = this.#text.length;

		// Calculate the number of leading whitespace characters
		const startOffset = originalLength - this.#text.trimStart().length;
		// Calculate the effective length of the string after removing trailing whitespace (i.e., end index)
		const endOffset = this.#text.trimEnd().length;

		if (startOffset > 0 || endOffset < originalLength) {
			this.sliceInplace(startOffset, endOffset);
		}

		return this;
	}

	/**
	 * @inheritDoc.
	 *
	 * @returns The current builder instance for chaining.
	 */
	public clone(): EntityBuilder {
		const instance = new EntityBuilder();
		instance.#text = this.#text;
		instance.#entities = structuredClone(this.#entities);
		return instance;
	}

	/**
	 * @inheritDoc.
	 *
	 * @returns The current builder instance for chaining.
	 */
	public fork(): EntityBuilder {
		const instance = new EntityBuilder();
		instance.#parent = this;
		return instance;
	}

	/**
	 * Merges a payload text and its entities into this builder, optionally wrapping them with additional entities.
	 *
	 * @param text - The text payload to merge.
	 * @param entities - The entities associated with the text payload.
	 * @param wrappers - Optional wrapper entities to apply over the merged block.
	 */
	public mergeContent(
		text: string,
		entities: TT.MessageEntity[],
		wrappers: AnyDraftEntity[] = [],
	): void {
		const startOffset = this.#text.length;
		this.#text += text;

		this.#entities.push(
			// 1. Mount Wrapper (length covers the entire sub-block)
			...wrappers.map(
				(w) =>
					({
						...w,
						offset: startOffset,
						length: text.length,
					}) as TT.MessageEntity,
			),
			// 2. Offset the entities of the child node itself
			...entities.map((e) => ({
				...e,
				offset: e.offset + startOffset,
			})),
		);
	}

	/**
	 * @inheritDoc.
	 *
	 * @param wrapperEntities - See the type for what this controls.
	 * @returns The current builder instance for chaining.
	 */
	public merge(wrapperEntities: AnyDraftEntity[] = []): void {
		if (!this.#parent) {
			throw new TypeError(
				'Cannot merge: This builder is not a fork or has already been merged.',
			);
		}
		this.#parent.mergeContent(this.#text, this.#entities, wrapperEntities);
		this.#parent = undefined;
	}
}

/**
 * A lazy implementation of IEntityBuilderBase that stores segments and flattens them into an EntityBuilder only when needed.
 *
 * @category Builders
 * @useWhen - You want to defer the actual evaluation and text manipulation of entities until strictly necessary.
 * @avoidWhen - You need to slice or trim entities on the fly.
 * @never - NEVER assume the inner segments are finalized until flattened. Fix: Call flatten() to evaluate.
 * @see {@link EntityBuilder} for the eager evaluation counterpart.
 *
 * @example
 * ```typescript
 * const lazy = new LazyEntityBuilder();
 * lazy.addText("Hello ");
 * lazy.addTextEntity("World", { type: "bold" });
 * const builder = lazy.flatten();
 * ```
 */
export class LazyEntityBuilder extends IEntityBuilderBase {
	/** The stored text segments. */
	#segments: TextSegment[] = [];
	/** The parent builder if this is a fork. */
	#parent?: LazyEntityBuilder;

	/** @inheritDoc */
	public get hasParent(): boolean {
		return this.#parent !== undefined;
	}

	/** @inheritDoc */
	public get f(): BoundFormatText<this> {
		return new Proxy(f, {
			get: (target, prop) => {
				if (prop in target) {
					return (
						target[prop as keyof typeof f] as (builder: IEntityBuilderBase) => unknown
					)(this);
				}
				return undefined;
			},
		}) as unknown as BoundFormatText<this>;
	}

	/**
	 * Flattens the lazy segments into a new EntityBuilder instance.
	 *
	 * @returns A new EntityBuilder containing the flattened segments.
	 */
	public flatten(): EntityBuilder {
		const builder = new EntityBuilder();
		builder.addTextSegmentList(this.#segments);
		return builder;
	}

	/**
	 * @inheritDoc.
	 *
	 * @param text - The content to format.
	 * @returns The current builder instance for chaining.
	 */
	public addText(text: string): this {
		this.#segments.push({ text });
		return this;
	}

	/**
	 * @inheritDoc.
	 *
	 * @param text - The content to format.
	 * @param entity - The draft entity to apply to the text.
	 * @returns The current builder instance for chaining.
	 */
	public addTextEntity(text: string, entity: AnyDraftEntity): this {
		this.#segments.push({ text, entity });
		return this;
	}

	/**
	 * @inheritDoc.
	 *
	 * @param text - The content to format.
	 * @param entities - The draft entities to apply to the text.
	 * @returns The current builder instance for chaining.
	 */
	public addTextEntities(text: string, entities: AnyDraftEntity[]): this {
		this.#segments.push({ text, entities });
		return this;
	}

	/**
	 * @inheritDoc.
	 *
	 * @param segments - The segments to append, in order.
	 * @returns The current builder instance for chaining.
	 */
	public addTextSegmentList(segments: TextSegment[]): this {
		this.#segments.push(...segments);
		return this;
	}

	public add(text: ResolvableEntityItem): this {
		unwrapText(this, text);
		return this;
	}

	/**
	 * Appends an item wrapped in one entity, forking when the item is not a bare string.
	 *
	 * @param text - The item to wrap.
	 * @param entity - The entity to apply to it.
	 * @returns The current builder instance for chaining.
	 */
	protected _wrapEntity(text: ResolvableEntityItem, entity: AnyDraftEntity): this {
		if (typeof text === 'string') {
			this.addTextEntity(text, entity);
		} else {
			const child = this.fork();
			child.add(text);
			child.merge([entity]);
		}
		return this;
	}

	public bold(text: ResolvableEntityItem): this {
		return this._wrapEntity(text, { type: 'bold' });
	}
	public italic(text: ResolvableEntityItem): this {
		return this._wrapEntity(text, { type: 'italic' });
	}
	public underline(text: ResolvableEntityItem): this {
		return this._wrapEntity(text, { type: 'underline' });
	}
	public strikethrough(text: ResolvableEntityItem): this {
		return this._wrapEntity(text, { type: 'strikethrough' });
	}
	public spoiler(text: ResolvableEntityItem): this {
		return this._wrapEntity(text, { type: 'spoiler' });
	}
	public blockquote(text: ResolvableEntityItem): this {
		return this._wrapEntity(text, { type: 'blockquote' });
	}
	public expandableBlockquote(text: ResolvableEntityItem): this {
		return this._wrapEntity(text, { type: 'expandable_blockquote' });
	}
	public code(text: ResolvableEntityItem): this {
		return this._wrapEntity(text, { type: 'code' });
	}
	public mention(text: ResolvableEntityItem): this {
		return this._wrapEntity(text, { type: 'mention' });
	}
	public hashtag(text: ResolvableEntityItem): this {
		return this._wrapEntity(text, { type: 'hashtag' });
	}
	public cashtag(text: ResolvableEntityItem): this {
		return this._wrapEntity(text, { type: 'cashtag' });
	}
	public botCommand(text: ResolvableEntityItem): this {
		return this._wrapEntity(text, { type: 'bot_command' });
	}
	public emailAddress(text: ResolvableEntityItem): this {
		return this._wrapEntity(text, { type: 'email' });
	}
	public phoneNumber(text: ResolvableEntityItem): this {
		return this._wrapEntity(text, { type: 'phone_number' });
	}
	public pre(text: ResolvableEntityItem, language?: string): this {
		// An empty `language` is not the same as no language at all, so it is omitted.
		return this._wrapEntity(
			text,
			language === undefined ? { type: 'pre' } : { type: 'pre', language },
		);
	}
	public url(text: ResolvableEntityItem, url?: string): this {
		return this._wrapEntity(text, url ? { type: 'text_link', url } : { type: 'url' });
	}
	public textMention(text: ResolvableEntityItem, user: TT.User): this {
		return this._wrapEntity(text, { type: 'text_mention', user });
	}
	public customEmoji(text: ResolvableEntityItem, customEmojiId: string): this {
		return this._wrapEntity(text, {
			type: 'custom_emoji',
			custom_emoji_id: customEmojiId,
		});
	}
	public dateTime(
		text: ResolvableEntityItem,
		unixTime: number,
		format: TT.MessageEntity.DateTimeMessageEntity['date_time_format'],
	): this {
		return this._wrapEntity(text, {
			type: 'date_time',
			unix_time: unixTime,
			date_time_format: format,
		});
	}

	/**
	 * @inheritDoc.
	 *
	 * @returns The current builder instance for chaining.
	 */
	public toSegments(): TextSegment[] {
		return structuredClone(this.#segments);
	}

	/**
	 * @inheritDoc.
	 *
	 * @returns The current builder instance for chaining.
	 */
	public clone(): LazyEntityBuilder {
		const instance = new LazyEntityBuilder();
		instance.#segments = structuredClone(this.#segments);
		return instance;
	}

	/**
	 * @inheritDoc.
	 *
	 * @returns The current builder instance for chaining.
	 */
	public fork(): LazyEntityBuilder {
		const instance = new LazyEntityBuilder();
		instance.#parent = this;
		return instance;
	}

	/**
	 * @inheritDoc.
	 *
	 * @param wrapperEntities - See the type for what this controls.
	 * @returns The current builder instance for chaining.
	 */
	public merge(wrapperEntities: AnyDraftEntity[] = []): void {
		if (!this.#parent) {
			throw new TypeError(
				'Cannot merge: This builder is not a fork or has already been merged.',
			);
		}

		const wrappedSegments: TextSegment[] = this.#segments.map((seg) => {
			if (seg.text.length === 0) {
				// Skip empty strings directly
				return seg;
			}

			// Collect all original entities of this segment
			const existing = seg.entities ? [...seg.entities] : seg.entity ? [seg.entity] : [];

			return {
				text: seg.text,
				entities: [...existing, ...wrapperEntities],
			};
		});

		this.#parent.addTextSegmentList(wrappedSegments);
		this.#parent = undefined;
	}
}

/** @internal */
const symbolAbstractEntityBuilderProxy: unique symbol = Symbol(
	'AbstractEntityBuilderProxy',
);

/**
 * Abstract proxy class that delegates all IEntityBuilder operations to an underlying builder instance.
 *
 * @category Proxies
 * @useWhen - You are creating a custom builder that extends or wraps an existing entity builder.
 * @avoidWhen - You just need standard entity building without custom logic.
 * @never - NEVER nest a proxy inside the same type of proxy. Fix: Unwrap or use a single layer of proxy.
 *
 * @example
 * ```typescript
 * class MyCustomBuilder extends AbstractEntityBuilderProxy<MyCustomBuilder> {
 *   public override clone(): MyCustomBuilder {
 *     return new MyCustomBuilder(this.entities.clone());
 *   }
 * }
 * ```
 * @internal
 */
abstract class AbstractEntityBuilderProxy<
	THIS extends IEntityBuilder = IEntityBuilder,
> implements IEntityBuilder {
	protected [symbolAbstractEntityBuilderProxy] = true as const;

	protected constructor(protected _entities: IEntityBuilder) {
		if (symbolAbstractEntityBuilderProxy in _entities) {
			const inputClass = _entities.constructor.name || 'AbstractEntityBuilderProxy';
			const thisClass = this.constructor.name || 'AbstractEntityBuilderProxy';
			throw new TypeError(
				`Cannot nest ${inputClass} inside ${inputClass === thisClass ? 'another ' : ''}${thisClass}.`,
			);
		}
	}

	/**
	 * The underlying entity builder instance.
	 */
	public get entities(): IEntityBuilder {
		return this._entities;
	}

	/** @inheritDoc */
	public get hasParent(): boolean {
		return this._entities.hasParent;
	}

	/** @inheritDoc */
	public get f(): BoundFormatText<this> {
		return new Proxy(f, {
			get: (target, prop) => {
				if (prop in target) {
					return (
						target[prop as keyof typeof f] as (builder: IEntityBuilderBase) => unknown
					)(this);
				}
				return undefined;
			},
		}) as unknown as BoundFormatText<this>;
	}

	/**
	 * @inheritDoc
	 * @param args - The arguments passed to the underlying builder's addText.
	 */
	public addText(...args: Parameters<IEntityBuilder['addText']>): this {
		this._entities.addText(...args);
		return this;
	}

	/**
	 * @inheritDoc
	 * @param args - The arguments passed to the underlying builder's addTextEntity.
	 */
	public addTextEntity(...args: Parameters<IEntityBuilder['addTextEntity']>): this {
		this._entities.addTextEntity(...args);
		return this;
	}

	/**
	 * @inheritDoc
	 * @param args - The arguments passed to the underlying builder's addTextEntities.
	 */
	public addTextEntities(...args: Parameters<IEntityBuilder['addTextEntities']>): this {
		this._entities.addTextEntities(...args);
		return this;
	}

	/**
	 * @inheritDoc
	 * @param args - The arguments passed to the underlying builder's addTextSegmentList.
	 */
	public addTextSegmentList(
		...args: Parameters<IEntityBuilder['addTextSegmentList']>
	): this {
		this._entities.addTextSegmentList(...args);
		return this;
	}

	public add(text: ResolvableEntityItem): this {
		this._entities.add(text);
		return this;
	}
	public bold(text: ResolvableEntityItem): this {
		this._entities.bold(text);
		return this;
	}
	public italic(text: ResolvableEntityItem): this {
		this._entities.italic(text);
		return this;
	}
	public underline(text: ResolvableEntityItem): this {
		this._entities.underline(text);
		return this;
	}
	public strikethrough(text: ResolvableEntityItem): this {
		this._entities.strikethrough(text);
		return this;
	}
	public spoiler(text: ResolvableEntityItem): this {
		this._entities.spoiler(text);
		return this;
	}
	public blockquote(text: ResolvableEntityItem): this {
		this._entities.blockquote(text);
		return this;
	}
	public expandableBlockquote(text: ResolvableEntityItem): this {
		this._entities.expandableBlockquote(text);
		return this;
	}
	public code(text: ResolvableEntityItem): this {
		this._entities.code(text);
		return this;
	}
	public mention(text: ResolvableEntityItem): this {
		this._entities.mention(text);
		return this;
	}
	public hashtag(text: ResolvableEntityItem): this {
		this._entities.hashtag(text);
		return this;
	}
	public cashtag(text: ResolvableEntityItem): this {
		this._entities.cashtag(text);
		return this;
	}
	public botCommand(text: ResolvableEntityItem): this {
		this._entities.botCommand(text);
		return this;
	}
	public emailAddress(text: ResolvableEntityItem): this {
		this._entities.emailAddress(text);
		return this;
	}
	public phoneNumber(text: ResolvableEntityItem): this {
		this._entities.phoneNumber(text);
		return this;
	}
	public pre(text: ResolvableEntityItem, language?: string): this {
		this._entities.pre(text, language);
		return this;
	}
	public url(text: ResolvableEntityItem, url?: string): this {
		this._entities.url(text, url);
		return this;
	}
	public textMention(text: ResolvableEntityItem, user: TT.User): this {
		this._entities.textMention(text, user);
		return this;
	}
	public customEmoji(text: ResolvableEntityItem, customEmojiId: string): this {
		this._entities.customEmoji(text, customEmojiId);
		return this;
	}
	public dateTime(
		text: ResolvableEntityItem,
		unixTime: number,
		format: TT.MessageEntity.DateTimeMessageEntity['date_time_format'],
	): this {
		this._entities.dateTime(text, unixTime, format);
		return this;
	}

	/**
	 * @inheritDoc.
	 *
	 * @returns The current builder instance for chaining.
	 */
	public toSegments(): TextSegment[] {
		return this._entities.toSegments();
	}

	/**
	 * @inheritDoc
	 * @param args - The arguments passed to the underlying builder's sliceInplace.
	 */
	public sliceInplace(...args: Parameters<IEntityBuilder['sliceInplace']>): this {
		this._entities.sliceInplace(...args);
		return this;
	}

	/**
	 * @inheritDoc.
	 *
	 * @param args - See the type for what this controls.
	 * @returns The current builder instance for chaining.
	 */
	public slice(...args: Parameters<IEntityBuilder['slice']>): THIS {
		return this.clone().sliceInplace(...args);
	}

	/**
	 * @inheritDoc.
	 *
	 * @returns The current builder instance for chaining.
	 */
	public trim(): this {
		this._entities.trim();
		return this;
	}

	/**
	 * @inheritDoc.
	 *
	 * @returns The current builder instance for chaining.
	 */
	public trimStart(): this {
		this._entities.trimStart();
		return this;
	}

	/**
	 * @inheritDoc.
	 *
	 * @returns The current builder instance for chaining.
	 */
	public trimEnd(): this {
		this._entities.trimEnd();
		return this;
	}

	/**
	 * @inheritDoc.
	 *
	 * @returns The current builder instance for chaining.
	 */
	public sortEntities(): this {
		this._entities.sortEntities();
		return this;
	}

	/**
	 * @inheritDoc.
	 *
	 * @returns The current builder instance for chaining.
	 */
	public abstract clone(): THIS;

	/**
	 * @inheritDoc.
	 *
	 * @returns The current builder instance for chaining.
	 */
	public fork(): IEntityBuilder {
		return this._entities.fork();
	}

	/**
	 * @inheritDoc.
	 *
	 * @param args - See the type for what this controls.
	 * @returns The current builder instance for chaining.
	 */
	public merge(...args: Parameters<IEntityBuilder['merge']>): void {
		this._entities.merge(...args);
	}

	/**
	 * @inheritDoc.
	 *
	 * @returns The current builder instance for chaining.
	 */
	public buildText(): InputText {
		return this._entities.buildText();
	}

	/**
	 * @inheritDoc.
	 *
	 * @returns The current builder instance for chaining.
	 */
	public buildCaption(): InputCaption {
		const { text, entities } = this.buildText();
		return {
			caption: text,
			caption_entities: entities,
		};
	}

	/**
	 * @inheritDoc.
	 *
	 * @returns The current builder instance for chaining.
	 */
	public buildInline(): InputInline {
		const { text, entities, link_preview_options } = this.buildText();
		const payload: InputInline = { message_text: text, entities };
		if (link_preview_options !== undefined) {
			payload.link_preview_options = link_preview_options;
		}
		return payload;
	}
}

/**
 * A proxy class that delegates all IEntityBuilder operations to an underlying builder instance.
 *
 * @category Proxies
 * @useWhen - You need to instantiate a concrete proxy over an existing builder without writing a custom subclass.
 * @avoidWhen - You need advanced domain-specific functionality (like MessageBuilder).
 * @never - NEVER double-wrap proxy instances unnecessarily.
 *
 * @example
 * ```typescript
 * const builder = new EntityBuilder();
 * const proxy = new EntityBuilderProxy(builder);
 * proxy.addText("Proxied text");
 * ```
 */
export class EntityBuilderProxy extends AbstractEntityBuilderProxy<EntityBuilderProxy> {
	public constructor(
		entities?: IEntityBuilder & { [symbolAbstractEntityBuilderProxy]?: never },
	) {
		super(entities ?? new EntityBuilder());
	}

	/**
	 * Creates an independent copy of this proxy.
	 *
	 * @returns A new proxy over an independent copy of the underlying builder.
	 */
	public override clone(): EntityBuilderProxy {
		return new EntityBuilderProxy(this.entities.clone());
	}
}

/**
 * Capitalizes the first letter of a string.
 *
 * @internal
 * @param input - The string to capitalize.
 * @returns The capitalized string.
 */
function upperFirst(input: string) {
	return input.slice(0, 1).toUpperCase() + input.slice(1);
}

/**
 * Escapes a string to be used as a valid tag by removing or replacing invalid characters.
 *
 * @param input - The raw string to escape.
 * @returns The escaped tag string, suitable for Telegram hashtags.
 * @category Functions
 * @useWhen - You need to format strings as valid Telegram hashtags.
 * @avoidWhen - You are dealing with pre-formatted hashtags.
 * @never - NEVER assume the output is entirely lowercase. Fix: Lowercase it yourself if needed.
 * @see {@link MessageBuilder} for where this is heavily utilized.
 * @since 0.1.0
 *
 * @example
 * ```typescript
 * import { escapeTag } from "@sunafterrainwm/telegram-entities-builder";
 *
 * const validTag = escapeTag("hello world!");
 * console.log(validTag); // Outputs: "HelloWorld"
 * ```
 */
export function escapeTag(input: string) {
	// return input.replace(/[^\p{L}\p{N}_]/gu, "");
	return input
		.replaceAll(/["'′]/g, '') // It's => Its
		.split(/[^\p{L}\p{N}_]/gu)
		.map((s) => upperFirst(s))
		.join('');
}

/**
 * A high-level composer that wraps an IEntityBuilder and provides additional features like tags and link preview options.
 *
 * @category Composers
 * @useWhen - You need to add Telegram hashtags globally or specify link preview options for the final payload.
 * @avoidWhen - You just need basic string concatenation without hashtags or link previews.
 * @never - NEVER wrap an already forked entity builder. Fix: Merge the builder before wrapping.
 * @see {@link EntityBuilder}
 *
 * @example
 * ```typescript
 * const composer = new MessageBuilder();
 * composer.addText("Check out this link!");
 * composer.addTags("update", "news");
 * const message = composer.buildText();
 * // payload contains text with appended hashtags.
 * ```
 */
export class MessageBuilder extends AbstractEntityBuilderProxy<MessageBuilder> {
	#upperTags = new Set<string>();
	#tags: string[] = [];

	/**
	 * Options for link preview generation.
	 */
	public linkPreviewOptions?: TT.LinkPreviewOptions;

	/**
	 * Creates a new MessageBuilder instance.
	 *
	 * @param entities - An optional existing entity builder to wrap.
	 * @throws {TypeError} If the provided entity builder is a forked instance.
	 */
	public constructor(
		entities?: IEntityBuilder & { [symbolAbstractEntityBuilderProxy]?: never },
	) {
		if (entities && entities.hasParent) {
			throw new TypeError('Cannot wrap a forked entity builder.');
		}
		super(entities ?? new EntityBuilder());
	}

	/**
	 * Creates an independent copy of this composer.
	 *
	 * @returns A new composer with the same tags, link preview options and content.
	 */
	public override clone(): MessageBuilder {
		const instance = new MessageBuilder(this.entities.clone());
		instance.#tags = [...this.#tags];
		instance.#upperTags = new Set(this.#upperTags);
		instance.linkPreviewOptions = this.linkPreviewOptions;
		return instance;
	}

	/**
	 * Gets the current list of tags.
	 *
	 * @returns An array of tags currently managed by the composer.
	 */
	public get tags(): string[] {
		return [...this.#tags];
	}

	/**
	 * Adds one or more tags, escaping them and avoiding duplicates.
	 *
	 * @param tags - One or more tag strings to add.
	 * @returns The current composer instance for chaining.
	 */
	public addTags(...tags: string[]) {
		for (let tag of tags) {
			tag = escapeTag(tag);
			const upperTag = tag.toUpperCase();
			if (this.#upperTags.has(upperTag)) {
				// Deduplicate
				continue;
			}
			this.#upperTags.add(upperTag);
			this.#tags.push(tag);
		}

		return this;
	}

	/**
	 * Builds the payload for sending a text message.
	 *
	 * @returns The payload, with the tags appended and the link preview options applied.
	 */
	public override buildText(): InputText {
		const entities = this.entities.clone();

		entities.trimEnd();

		if (this.#tags.length) {
			entities.addText('\n\n');

			for (const [i, tag] of this.tags.entries()) {
				entities.addTextEntity(`#${tag}`, { type: 'hashtag' });
				if (i + 1 < this.tags.length) {
					entities.addText(' ');
				}
			}
		}

		const payload: InputText = entities.buildText();
		if (this.linkPreviewOptions !== undefined) {
			payload.link_preview_options = this.linkPreviewOptions;
		}
		return payload;
	}
}

export default MessageBuilder;

const fmt = createFormatter<ResolvableEntityItem, IEntityBuilderBase, LazyEntityBuilder>({
	Builder: LazyEntityBuilder,
	Interface: IEntityBuilderBase,
});

/**
 * Tagged template literal that composes a {@link LazyEntityBuilder} out of strings and
 * resolvable items.
 *
 * @example
 * ```typescript
 * import { formatText, f } from "@sunafterrainwm/telegram-entities-builder";
 *
 * formatText`Hello ${f.bold`world`}!`.flatten().buildText();
 * // { text: "Hello world!", entities: [{ type: "bold", offset: 6, length: 5 }] }
 * ```
 *
 * @category Functions
 */
export const formatText = fmt.mergeTpl;

/**
 * Format helpers for the {@link formatText} tagged template literal.
 *
 * Every helper doubles as a tagged template (``f.bold`text` ``) and, when handed a
 * builder, returns a tagged template bound to it — which is how `builder.f` works.
 *
 * @category Functions
 */
export const f = Object.assign(formatText, {
	bold: fmt.style('bold'),
	italic: fmt.style('italic'),
	underline: fmt.style('underline'),
	strikethrough: fmt.style('strikethrough'),
	spoiler: fmt.style('spoiler'),
	blockquote: fmt.style('blockquote'),
	expandableBlockquote: fmt.style('expandableBlockquote'),
	code: fmt.style('code'),
	mention: fmt.style('mention'),
	hashtag: fmt.style('hashtag'),
	cashtag: fmt.style('cashtag'),
	botCommand: fmt.style('botCommand'),
	emailAddress: fmt.style('emailAddress'),
	phoneNumber: fmt.style('phoneNumber'),

	pre: fmt.styleWithParam('pre'),
	url: fmt.styleWithParam('url', true),
	textMention: fmt.styleWithParam('textMention'),
	customEmoji: fmt.styleWithParam('customEmoji'),
	dateTime: fmt.styleWithParam('dateTime'),
}) satisfies BoundFormatText<LazyEntityBuilder>;
