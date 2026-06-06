/**
 * @packageDocumentation
 * This package provides a highly robust, dynamic, and powerful entity builder for the Telegram Bot API. It seamlessly integrates with Grammy types and provides advanced features like slicing, merging, and lazy evaluation of text segments and entities.
 *
 * @example
 * ```typescript
 * import { EntityBuilder } from "@sunafterrainwm/telegram-entities-builder";
 * const builder = new EntityBuilder();
 * builder.addText("Hello World");
 * console.log(builder.buildTextPayload());
 * ```
 *
 * @useWhen - You need to dynamically build Telegram messages.
 * @avoidWhen - You don't need any entities.
 * @never - NEVER mutate the returned payload directly.
 */
import type * as TT from '@grammyjs/types';

type Telegram = TT.ApiMethods<never>;
type ApiParameters<T extends keyof Telegram> = Parameters<Telegram[T]>[0];

/**
 * Represents a Telegram MessageEntity without the offset and length properties.
 * @category Types
 */
export type PartialEntity<E extends TT.MessageEntity = TT.MessageEntity> = Omit<E, 'offset' | 'length'>;
/**
 * Represents any draft entity that can be used before calculating the final offset and length.
 */
export type AnyDraftEntity =
	| PartialEntity<TT.MessageEntity.CommonMessageEntity>
	| PartialEntity<TT.MessageEntity.CustomEmojiMessageEntity>
	| PartialEntity<TT.MessageEntity.PreMessageEntity>
	| PartialEntity<TT.MessageEntity.TextLinkMessageEntity>
	| PartialEntity<TT.MessageEntity.TextMentionMessageEntity>;

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
 * Creates a type with some properties required and some optional.
 *
 * @internal
 */
type PartialRequired<T, REQUIRED extends keyof T, OPTIONAL extends keyof T = never> = Required<Pick<T, REQUIRED>> &
	Pick<T, OPTIONAL>;

/**
 * Base interface for entity builders, providing fundamental operations for appending text and managing builder state.
 */
export interface IEntityBuilderBase {
	/**
	 * Appends plain text.
	 *
	 * @param text - The text to append.
	 * @returns The current builder instance for chaining.
	 */
	addText(text: string): this;
	/**
	 * Appends text with a single entity.
	 *
	 * @param text - The text to append.
	 * @param entity - The entity to apply to the text.
	 * @returns The current builder instance for chaining.
	 */
	addTextEntity(text: string, entity: AnyDraftEntity): this;
	/**
	 * Appends text with multiple entities.
	 *
	 * @param text - The text to append.
	 * @param entities - An array of entities to apply to the text.
	 * @returns The current builder instance for chaining.
	 */
	addTextEntities(text: string, entities: AnyDraftEntity[]): this;
	/**
	 * Appends a list of text segments.
	 *
	 * @param segments - An array of text segments, each optionally containing entities.
	 * @returns The current builder instance for chaining.
	 */
	addTextSegmentList(segments: TextSegment[]): this;

	/**
	 * Creates a deep clone of this builder.
	 *
	 * @returns A new instance of the builder with cloned state.
	 */
	clone(): IEntityBuilderBase;
	/**
	 * Creates a child builder that forks from this instance.
	 *
	 * @returns A new child builder instance.
	 */
	fork(): IEntityBuilderBase;
	/**
	 * Merges a forked builder back into its parent.
	 *
	 * @param wrapperEntities - Optional entities to wrap around the merged block.
	 * @throws {Error} If this builder is not a fork or has already been merged.
	 */
	merge(wrapperEntities?: AnyDraftEntity[]): void;

	/**
	 * Indicates if this builder is a fork and has not been merged yet.
	 */
	readonly hasParent: boolean;
}

/**
 * Payload for sending a text message.
 */
export interface TTextPayload extends PartialRequired<
	ApiParameters<'sendMessage'>,
	'text' | 'entities',
	'link_preview_options'
> {}

/**
 * Payload for sending a document with a caption.
 */
export interface TCaptionPayload extends PartialRequired<
	ApiParameters<'sendDocument'>,
	'caption' | 'caption_entities'
> {}

/**
 * Payload for answering an inline query with text.
 */
export interface TInlinePayload extends PartialRequired<
	TT.InputTextMessageContent,
	'message_text' | 'entities',
	'link_preview_options'
> {}

/**
 * Represents the core entity builder which provides high-level text manipulation operations.
 * @category Core Types
 */
export interface IEntityBuilder extends IEntityBuilderBase {
	/**
	 * Trims or slices the string in-place, and automatically recalculates, filters, or truncates the affected entities.
	 *
	 * @param start - The zero-based index at which to start extraction.
	 * @param end - The zero-based index before which to end extraction.
	 * @returns The current builder instance for chaining.
	 */
	sliceInplace(start?: number, end?: number): this;
	/**
	 * Returns a new sliced instance.
	 *
	 * @param start - The zero-based index at which to start extraction.
	 * @param end - The zero-based index before which to end extraction.
	 * @returns A new IEntityBuilder instance containing the sliced content.
	 */
	slice(start?: number, end?: number): IEntityBuilder;
	/**
	 * Removes leading whitespace in-place.
	 *
	 * @returns The current builder instance for chaining.
	 */
	trimStart(): this;
	/**
	 * Removes trailing whitespace in-place.
	 *
	 * @returns The current builder instance for chaining.
	 */
	trimEnd(): this;
	/**
	 * Removes leading and trailing whitespace in-place.
	 *
	 * @returns The current builder instance for chaining.
	 */
	trim(): this;

	/**
	 * Sorts the entities based on their offset and length.
	 *
	 * @returns The current builder instance for chaining.
	 */
	sortEntities(): this;

	/**
	 * Builds the payload for sending a text message.
	 *
	 * @returns The final text payload object suitable for Grammy's API.
	 */
	buildTextPayload(): TTextPayload;
	/**
	 * Builds the payload for sending a document with a caption.
	 *
	 * @returns The final caption payload object suitable for Grammy's API.
	 */
	buildCaptionPayload(): TCaptionPayload;
	/**
	 * Builds the payload for inline query results.
	 *
	 * @returns The final inline payload object suitable for Grammy's API.
	 */
	buildInlinePayload(): TInlinePayload;

	clone(): IEntityBuilder;
	fork(): IEntityBuilder;
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
 * const payload = builder.buildTextPayload();
 * // payload.text === "Hello"
 * ```
 */
export class EntityBuilder implements IEntityBuilder {
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
	public addText(text: string): this {
		this.#text += text;
		return this;
	}

	/** @inheritDoc */
	public addTextEntity(text: string, entity: AnyDraftEntity): this {
		text = String(text);
		if (text.length > 0) {
			this.#entities.push({
				...entity,
				offset: this.#text.length,
				length: text.length,
			});
			this.#text += text;
		}
		return this;
	}

	/** @inheritDoc */
	public addTextEntities(text: string, entities: AnyDraftEntity[]): this {
		for (const entity of entities) {
			this.#entities.push({
				...entity,
				offset: this.#text.length,
				length: text.length,
			} as TT.MessageEntity);
		}
		this.#text += text;
		return this;
	}

	/** @inheritDoc */
	public addTextSegmentList(segments: TextSegment[]): this {
		for (const segment of segments) {
			if (segment.entity) {
				this.addTextEntity(segment.text, segment.entity);
			} else if (segment.entities) {
				this.addTextEntities(segment.text, segment.entities);
			} else {
				this.#text += segment.text;
			}
		}
		return this;
	}

	/** @inheritDoc */
	public buildTextPayload(): TTextPayload {
		return {
			text: this.#text,
			entities: this.#entities,
		};
	}

	/** @inheritDoc */
	public buildCaptionPayload(): TCaptionPayload {
		return {
			caption: this.#text,
			caption_entities: this.#entities,
		};
	}

	/** @inheritDoc */
	public buildInlinePayload(): TInlinePayload {
		return {
			message_text: this.#text,
			entities: this.#entities,
		};
	}

	/** @inheritDoc */
	public sortEntities() {
		this.#entities.sort((a, b) => a.offset - b.offset || a.length - b.length);
		return this;
	}

	/** @inheritDoc */
	public sliceInplace(start?: number, end?: number): this {
		if (!start && !end) {
			return this;
		}

		const len = this.#text.length;

		const s = start === undefined ? 0 : start < 0 ? Math.max(len + start, 0) : Math.min(start, len);
		const e = end === undefined ? len : end < 0 ? Math.max(len + end, 0) : Math.min(end, len);

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

	/** @inheritDoc */
	public slice(start?: number, end?: number): EntityBuilder {
		return this.clone().sliceInplace(start, end);
	}

	/** @inheritDoc */
	public trimStart(): this {
		const trimmedLength = this.#text.trimStart().length;
		const diff = this.#text.length - trimmedLength;
		if (diff > 0) {
			this.sliceInplace(diff);
		}

		return this;
	}

	/** @inheritDoc */
	public trimEnd(): this {
		const trimmedLength = this.#text.trimEnd().length;
		if (trimmedLength < this.#text.length) {
			this.sliceInplace(0, trimmedLength);
		}

		return this;
	}

	/** @inheritDoc */
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

	/** @inheritDoc */
	public clone(): EntityBuilder {
		const instance = new EntityBuilder();
		instance.#text = this.#text;
		instance.#entities = structuredClone(this.#entities);
		return instance;
	}

	/** @inheritDoc */
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
	public mergePayload(text: string, entities: TT.MessageEntity[], wrappers: AnyDraftEntity[] = []): void {
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

	/** @inheritDoc */
	public merge(wrapperEntities: AnyDraftEntity[] = []): void {
		if (!this.#parent) {
			throw new Error('Cannot merge: This builder is not a fork or has already been merged.');
		}
		this.#parent.mergePayload(this.#text, this.#entities, wrapperEntities);
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
export class LazyEntityBuilder implements IEntityBuilderBase {
	/** The stored text segments. */
	#segments: TextSegment[] = [];
	/** The parent builder if this is a fork. */
	#parent?: LazyEntityBuilder;

	/** @inheritDoc */
	public get hasParent(): boolean {
		return this.#parent !== undefined;
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

	/** @inheritDoc */
	public addText(text: string): this {
		this.#segments.push({ text });
		return this;
	}

	/** @inheritDoc */
	public addTextEntity(text: string, entity: AnyDraftEntity): this {
		this.#segments.push({ text, entity });
		return this;
	}

	/** @inheritDoc */
	public addTextEntities(text: string, entities: AnyDraftEntity[]): this {
		this.#segments.push({ text, entities });
		return this;
	}

	/** @inheritDoc */
	public addTextSegmentList(segments: TextSegment[]): this {
		this.#segments.push(...segments);
		return this;
	}

	/** @inheritDoc */
	public clone(): LazyEntityBuilder {
		const instance = new LazyEntityBuilder();
		instance.#segments = structuredClone(this.#segments);
		return instance;
	}

	/** @inheritDoc */
	public fork(): LazyEntityBuilder {
		const instance = new LazyEntityBuilder();
		instance.#parent = this;
		return instance;
	}

	/** @inheritDoc */
	public merge(wrapperEntities: AnyDraftEntity[] = []): void {
		if (!this.#parent) {
			throw new Error('Cannot merge: This builder is not a fork or has already been merged.');
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
const symbolAbstractEntityBuilderProxy: unique symbol = Symbol('AbstractEntityBuilderProxy');

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
abstract class AbstractEntityBuilderProxy<THIS extends IEntityBuilder = IEntityBuilder> implements IEntityBuilder {
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
	public addTextSegmentList(...args: Parameters<IEntityBuilder['addTextSegmentList']>): this {
		this._entities.addTextSegmentList(...args);
		return this;
	}

	/**
	 * @inheritDoc
	 * @param args - The arguments passed to the underlying builder's sliceInplace.
	 */
	public sliceInplace(...args: Parameters<IEntityBuilder['sliceInplace']>): this {
		this._entities.sliceInplace(...args);
		return this;
	}

	/** @inheritDoc */
	public slice(...args: Parameters<IEntityBuilder['slice']>): THIS {
		return this.clone().sliceInplace(...args);
	}

	/** @inheritDoc */
	public trim(): this {
		this._entities.trim();
		return this;
	}

	/** @inheritDoc */
	public trimStart(): this {
		this._entities.trimStart();
		return this;
	}

	/** @inheritDoc */
	public trimEnd(): this {
		this._entities.trimEnd();
		return this;
	}

	/** @inheritDoc */
	public sortEntities(): this {
		this._entities.sortEntities();
		return this;
	}

	/** @inheritDoc */
	public abstract clone(): THIS;

	/** @inheritDoc */
	public fork(): IEntityBuilder {
		return this._entities.fork();
	}

	/** @inheritDoc */
	public merge(...args: Parameters<IEntityBuilder['merge']>): void {
		this._entities.merge(...args);
	}

	/** @inheritDoc */
	public buildTextPayload(): TTextPayload {
		return this._entities.buildTextPayload();
	}

	/** @inheritDoc */
	public buildCaptionPayload(): TCaptionPayload {
		const { text, entities } = this.buildTextPayload();
		return {
			caption: text,
			caption_entities: entities,
		};
	}

	/** @inheritDoc */
	public buildInlinePayload(): TInlinePayload {
		const { text, entities, link_preview_options } = this.buildTextPayload();
		return {
			message_text: text,
			entities: entities,
			link_preview_options,
		};
	}
}

/**
 * A proxy class that delegates all IEntityBuilder operations to an underlying builder instance.
 *
 * @category Proxies
 * @useWhen - You need to instantiate a concrete proxy over an existing builder without writing a custom subclass.
 * @avoidWhen - You need advanced domain-specific functionality (like MessageComposer).
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
	public constructor(entities?: IEntityBuilder & { [symbolAbstractEntityBuilderProxy]?: never }) {
		super(entities ?? new EntityBuilder());
	}

	/** @inheritDoc */
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
 * @see {@link MessageComposer} for where this is heavily utilized.
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
 * const composer = new MessageComposer();
 * composer.addText("Check out this link!");
 * composer.addTags("update", "news");
 * const payload = composer.buildTextPayload();
 * // payload contains text with appended hashtags.
 * ```
 */
export class MessageComposer extends AbstractEntityBuilderProxy<MessageComposer> {
	#upperTags = new Set<string>();
	#tags: string[] = [];

	/**
	 * Options for link preview generation.
	 */
	public linkPreviewOptions?: TT.LinkPreviewOptions;

	/**
	 * Creates a new MessageComposer instance.
	 *
	 * @param entities - An optional existing entity builder to wrap.
	 * @throws {TypeError} If the provided entity builder is a forked instance.
	 */
	public constructor(entities?: IEntityBuilder & { [symbolAbstractEntityBuilderProxy]?: never }) {
		if (entities && entities.hasParent) {
			throw new TypeError('Cannot wrap a forked entity builder.');
		}
		super(entities ?? new EntityBuilder());
	}

	/** @inheritDoc */
	public override clone(): MessageComposer {
		const instance = new MessageComposer(this.entities.clone());
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

	/** @inheritDoc */
	public override buildTextPayload(): TTextPayload {
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

		return {
			...entities.buildTextPayload(),
			link_preview_options: this.linkPreviewOptions,
		};
	}
}

export default MessageComposer;
