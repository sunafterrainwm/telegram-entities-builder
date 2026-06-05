import type * as TT from '@grammyjs/types';

type Telegram = TT.ApiMethods<never>;
type ApiParameters<T extends keyof Telegram> = Parameters<Telegram[T]>[0];

/**
 * Represents a Telegram MessageEntity without the offset and length properties.
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
 */
export type TextSegment = TextSegment.SingleTextSegment | TextSegment.MultiTextSegment;

/**
 * Namespace for TextSegment types.
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
export declare namespace TextSegment {
	interface SingleTextSegment {
		text: string;
		entity?: AnyDraftEntity;
		entities?: never;
	}

	interface MultiTextSegment {
		text: string;
		entity?: never;
		entities: AnyDraftEntity[];
	}
}

type PartialRequired<T, REQUIRED extends keyof T, OPTIONAL extends keyof T> = Required<Pick<T, REQUIRED>> &
	Pick<T, OPTIONAL>;

/**
 * Base interface for entity builders, providing fundamental operations for appending text and managing builder state.
 */
export interface IEntityBuilderBase {
	/**
	 * Appends plain text.
	 */
	addText(text: string): this;
	/**
	 * Appends text with a single entity.
	 */
	addTextEntity(text: string, entity: AnyDraftEntity): this;
	/**
	 * Appends text with multiple entities.
	 */
	addTextEntities(text: string, entities: AnyDraftEntity[]): this;
	/**
	 * Appends a list of text segments.
	 */
	addTextSegmentList(segments: TextSegment[]): this;

	/**
	 * Creates a deep clone of this builder.
	 */
	clone(): IEntityBuilderBase;
	/**
	 * Creates a child builder that forks from this instance.
	 */
	fork(): IEntityBuilderBase;
	/**
	 * Merges a forked builder back into its parent.
	 */
	merge(wrapperEntities?: AnyDraftEntity[]): void;
}

/**
 * Advanced entity builder interface supporting string manipulation, entity sorting, and payload generation.
 */
export interface IEntityBuilder extends IEntityBuilderBase {
	/**
	 * Trims or slices the string in-place, and automatically recalculates, filters, or truncates the affected entities.
	 */
	sliceInplace(start?: number, end?: number): this;
	/**
	 * Returns a new sliced instance.
	 */
	slice(start?: number, end?: number): IEntityBuilder;
	/**
	 * Removes leading whitespace in-place.
	 */
	trimStart(): this;
	/**
	 * Removes trailing whitespace in-place.
	 */
	trimEnd(): this;
	/**
	 * Removes leading and trailing whitespace in-place.
	 */
	trim(): this;

	/**
	 * Sorts the entities based on their offset and length.
	 */
	sortEntities(): this;

	/**
	 * Builds the payload for sending a text message.
	 */
	buildTextPayload(): PartialRequired<ApiParameters<'sendMessage'>, 'text', 'entities' | 'link_preview_options'>;
	/**
	 * Builds the payload for sending a document with a caption.
	 */
	buildCaptionPayload(): PartialRequired<ApiParameters<'sendDocument'>, 'caption', 'caption_entities'>;
	/**
	 * Builds the payload for inline query results.
	 */
	buildInlinePayload(): PartialRequired<
		TT.InputTextMessageContent,
		'message_text',
		'entities' | 'link_preview_options'
	>;

	clone(): IEntityBuilder;
	fork(): IEntityBuilder;
}

/**
 * Main implementation of IEntityBuilder that eagerly evaluates and stores entities.
 */
export class EntityBuilder implements IEntityBuilder {
	#text = '';
	#entities: TT.MessageEntity[] = [];
	#parent?: EntityBuilder;

	public addText(text: string): this {
		this.#text += text;
		return this;
	}

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

	public buildTextPayload() {
		return {
			text: this.#text,
			entities: this.#entities,
		};
	}

	public buildCaptionPayload() {
		return {
			caption: this.#text,
			caption_entities: this.#entities as TT.MessageEntity[],
		};
	}

	public buildInlinePayload() {
		return {
			message_text: this.#text,
			entities: this.#entities,
		};
	}

	public sortEntities() {
		this.#entities.sort((a, b) => a.offset - b.offset || a.length - b.length);
		return this;
	}

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
			// 計算 Entity 區間與保留文字區間 [s, e) 的交集
			const overlapStart = Math.max(s, entity.offset);
			const overlapEnd = Math.min(e, entity.offset + entity.length);

			// 若交集長度大於 0，代表此 Entity 仍有部分存活於新字串中
			if (overlapStart < overlapEnd) {
				return [
					{
						...entity,
						offset: overlapStart - s,
						length: overlapEnd - overlapStart,
					},
				];
			}

			// 剔除沒有交集的 Entity
			return [];
		});

		return this;
	}

	public slice(start?: number, end?: number): EntityBuilder {
		return this.clone().sliceInplace(start, end);
	}

	public trimStart(): this {
		const trimmedLength = this.#text.trimStart().length;
		const diff = this.#text.length - trimmedLength;
		if (diff > 0) {
			this.sliceInplace(diff);
		}

		return this;
	}

	public trimEnd(): this {
		const trimmedLength = this.#text.trimEnd().length;
		if (trimmedLength < this.#text.length) {
			this.sliceInplace(0, trimmedLength);
		}

		return this;
	}

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

	public clone(): EntityBuilder {
		const instance = new EntityBuilder();
		instance.#text = this.#text;
		instance.#entities = structuredClone(this.#entities);
		return instance;
	}

	public fork(): EntityBuilder {
		const instance = new EntityBuilder();
		instance.#parent = this;
		return instance;
	}

	/**
	 * Merges a payload text and its entities into this builder, optionally wrapping them with additional entities.
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
 */
export class LazyEntityBuilder implements IEntityBuilderBase {
	#segments: TextSegment[] = [];
	#parent?: LazyEntityBuilder;

	/**
	 * Flattens the lazy segments into a new EntityBuilder instance.
	 */
	public flatten(): EntityBuilder {
		const builder = new EntityBuilder();
		builder.addTextSegmentList(this.#segments);
		return builder;
	}

	public addText(text: string): this {
		this.#segments.push({ text });
		return this;
	}

	public addTextEntity(text: string, entity: AnyDraftEntity): this {
		this.#segments.push({ text, entity });
		return this;
	}

	public addTextEntities(text: string, entities: AnyDraftEntity[]): this {
		this.#segments.push({ text, entities });
		return this;
	}

	public addTextSegmentList(segments: TextSegment[]): this {
		this.#segments.push(...segments);
		return this;
	}

	public clone(): LazyEntityBuilder {
		const instance = new LazyEntityBuilder();
		instance.#segments = structuredClone(this.#segments);
		return instance;
	}

	public fork(): LazyEntityBuilder {
		const instance = new LazyEntityBuilder();
		instance.#parent = this;
		return instance;
	}

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

/**
 * Abstract proxy class that delegates all IEntityBuilder operations to an underlying builder instance.
 */
export abstract class EntityBuilderProxy<THIS extends IEntityBuilder = IEntityBuilder> implements IEntityBuilder {
	protected constructor(protected _entities: IEntityBuilder) {}

	public get entities(): IEntityBuilder {
		return this._entities;
	}

	public addText(...args: Parameters<IEntityBuilder['addText']>): this {
		this._entities.addText(...args);
		return this;
	}

	public addTextEntity(...args: Parameters<IEntityBuilder['addTextEntity']>): this {
		this._entities.addTextEntity(...args);
		return this;
	}

	public addTextEntities(...args: Parameters<IEntityBuilder['addTextEntities']>): this {
		this._entities.addTextEntities(...args);
		return this;
	}

	public addTextSegmentList(...args: Parameters<IEntityBuilder['addTextSegmentList']>): this {
		this._entities.addTextSegmentList(...args);
		return this;
	}

	public sliceInplace(...args: Parameters<IEntityBuilder['sliceInplace']>): this {
		this._entities.sliceInplace(...args);
		return this;
	}

	public slice(...args: Parameters<IEntityBuilder['slice']>): THIS {
		return this.fork().sliceInplace(...args) as THIS;
	}

	public trim(): this {
		this._entities.trim();
		return this;
	}

	public trimStart(): this {
		this._entities.trimStart();
		return this;
	}

	public trimEnd(): this {
		this._entities.trimEnd();
		return this;
	}

	public sortEntities(): this {
		this._entities.sortEntities();
		return this;
	}

	public clone(): THIS {
		const newInstance = Object.create(this.constructor.prototype) as EntityBuilderProxy;
		newInstance._entities.clone();
		return newInstance as IEntityBuilder as THIS;
	}

	public fork() {
		return this._entities.fork();
	}

	public merge(...args: Parameters<IEntityBuilder['merge']>) {
		this._entities.merge(...args);
	}

	public buildTextPayload() {
		return this._entities.buildTextPayload();
	}

	public buildCaptionPayload() {
		const { text, entities } = this.buildTextPayload();
		return {
			caption: text,
			caption_entities: entities,
		};
	}

	public buildInlinePayload() {
		const { text, entities, link_preview_options } = this.buildTextPayload();
		return {
			message_text: text,
			entities: entities,
			link_preview_options,
		};
	}
}

function upperFirst(input: string) {
	return input.slice(0, 1).toUpperCase() + input.slice(1);
}

/**
 * Escapes a string to be used as a valid tag by removing or replacing invalid characters.
 */
export function escapeTag(input: string) {
	// return input.replace(/[^\p{L}\p{N}_]/gu, "");
	return input
		.replaceAll(/["'′]/g, '') // It's => Its
		.split(/[^\p{L}\p{N}_]/gu)
		.map((s) => upperFirst(s))
		.join('');
}

const SymbolMessageComposer = Symbol('MessageComposer');

/**
 * A high-level composer that wraps an IEntityBuilder and provides additional features like tags and link preview options.
 */
export class MessageComposer extends EntityBuilderProxy<MessageComposer> {
	protected [SymbolMessageComposer] = true as const;

	#upperTags = new Set<string>();
	#tags: string[] = [];

	/**
	 * Options for link preview generation.
	 */
	public linkPreviewOptions?: TT.LinkPreviewOptions;

	public constructor(entities?: IEntityBuilder & { [SymbolMessageComposer]?: never }) {
		if (entities && SymbolMessageComposer in entities) {
			throw new TypeError('Cannot nest MessageComposer inside MessageComposer');
		}
		super(entities ?? new EntityBuilder());
	}

	/**
	 * Gets the current list of tags.
	 */
	public get tags(): string[] {
		return [...this.#tags];
	}

	/**
	 * Adds one or more tags, escaping them and avoiding duplicates.
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

	public override buildTextPayload() {
		const entities = this.entities.clone();

		entities.trimEnd().addText('\n\n');

		for (const tag of this.tags) {
			entities.addTextEntity(`#${tag}`, { type: 'hashtag' }).addText(' ');
		}

		entities.trimEnd();

		return {
			...entities.buildTextPayload(),
			link_preview_options: this.linkPreviewOptions,
		};
	}
}

export default MessageComposer;
