import type * as TT from '@grammyjs/types';

import { interleaveTemplate, isTemplateStrings } from '../utils/formatter.ts';

import {
	type RichBlockMeasurement,
	measureRichBlocks,
	richMessageLimits,
} from './measure.ts';
import {
	ReadonlyRichBlockRef,
	RefState,
	type RichBlockRef,
	type RichRef,
	kState,
} from './ref.ts';
import { type ResolvableRichText, RichTextBuilder, unwrapRichText } from './text.ts';

/**
 * Resolves a reference into the block it stands for.
 *
 * Symbol-keyed so that it does not show up on the public surface of the reference
 * classes, which are otherwise ordinary builders.
 *
 * @internal
 */
const kResolve = Symbol('resolveRichBlock');

/**
 * The part of a block reference the owning builder needs: how to turn it into a block,
 * and which freeze state to attach nested references to.
 *
 * @internal
 */
interface InternalRichBlockRef<F> extends RichBlockRef {
	/** Freeze state of this reference. */
	readonly [kState]: RefState;
	/** Produces the block this reference stands for. */
	[kResolve](): TT.InputRichBlock<F>;
}

/**
 * Tells a block reference apart from a plain input block.
 *
 * @internal
 */
function isInternalRef<F>(value: unknown): value is InternalRichBlockRef<F> {
	return typeof value === 'object' && value !== null && kResolve in value;
}

/**
 * One entry of a builder's block list: either a block that is already complete, or a
 * reference whose content is still being filled in.
 *
 * @internal
 */
type BlockSlot<F> = TT.InputRichBlock<F> | InternalRichBlockRef<F>;

/**
 * Resolves a list of slots into plain input blocks.
 *
 * @internal
 */
function resolveSlots<F>(slots: BlockSlot<F>[]): TT.InputRichBlock<F>[] {
	return slots.map((slot) => (isInternalRef<F>(slot) ? slot[kResolve]() : slot));
}

/**
 * A resolvable rich block, which can be a raw Telegram `InputRichBlock`, a
 * {@link RichBlockBuilder}, a {@link RichTextBuilder} (which becomes a paragraph), a
 * {@link RichListBuilder} (which becomes a list), or an array of resolvables.
 *
 * @typeParam F - The file type accepted by the Bot API client (grammY's `InputFile`).
 *   Defaults to `never`, meaning only already-uploaded files and URLs can be used.
 *
 * @category Rich Message Types
 * @since Bot API 10.2
 */
export type ResolvableRichBlocks<F = never> =
	| TT.InputRichBlock<F>
	| RichBlockBuilder<F>
	| RichTextBuilder
	| RichListBuilder<F>
	| ResolvableRichBlocks<F>[];

/**
 * Unwraps {@link ResolvableRichBlocks} into a flat array of `InputRichBlock`.
 *
 * A bare {@link RichTextBuilder} becomes a paragraph and a {@link RichListBuilder}
 * becomes a list, so that a single expression of rich text can stand in for a block.
 *
 * @param blocks - The resolvable blocks.
 * @returns A flat array of input blocks.
 *
 * @throws {TypeError} If a block reference is passed. A reference already occupies a
 *   position in its builder's block list, so adding it again would duplicate the block;
 *   write through the reference instead.
 *
 * @example
 * ```typescript
 * unwrapRichBlocks([{ type: 'divider' }, fr`hello`]);
 * // [{ type: "divider" }, { type: "paragraph", text: "hello" }]
 * ```
 *
 * @category Rich Message Functions
 * @since Bot API 10.2
 */
export function unwrapRichBlocks<F = never>(
	blocks: ResolvableRichBlocks<F>,
): TT.InputRichBlock<F>[] {
	if (isInternalRef<F>(blocks)) {
		throw new TypeError(
			'Cannot add a block reference: it already holds a position in the block list. ' +
				'Write through the reference instead of adding it again.',
		);
	}

	if (blocks instanceof RichBlockBuilder) {
		return blocks.build({ checkEmpty: false });
	}

	if (blocks instanceof RichListBuilder) {
		return [{ type: 'list', items: blocks.build() }];
	}

	if (blocks instanceof RichTextBuilder) {
		return [{ type: 'paragraph', text: blocks.buildText() }];
	}

	if (Array.isArray(blocks)) {
		return blocks.flatMap((item) => unwrapRichBlocks<F>(item));
	}

	return [blocks];
}

/**
 * Caption and credit of a block that supports `RichBlockCaption`.
 *
 * @category Rich Message Types
 * @since Bot API 10.1
 */
export interface RichBlockCaptionOptions {
	/** The block caption. */
	caption?: ResolvableRichText;
	/** The block credit, which corresponds to the HTML tag `<cite>`. */
	credit?: ResolvableRichText;
}

/**
 * Builds a `RichBlockCaption`, or `undefined` when neither a caption nor a credit was
 * given.
 *
 * `RichBlockCaption.text` is required by the Bot API, so a credit-only caption is sent
 * with an empty text.
 *
 * @internal
 */
function unwrapCaption(
	options?: RichBlockCaptionOptions,
): TT.RichBlockCaption | undefined {
	if (!options) {
		return undefined;
	}

	const { caption, credit } = options;
	if (caption === undefined && credit === undefined) {
		return undefined;
	}

	const result: TT.RichBlockCaption = {
		text: caption === undefined ? '' : unwrapRichText(caption),
	};
	if (credit !== undefined) {
		result.credit = unwrapRichText(credit);
	}
	return result;
}

/**
 * Credit of a quotation block.
 *
 * @category Rich Message Types
 * @since Bot API 10.1
 */
export interface RichBlockCreditOptions {
	/** Credit of the quotation. */
	credit?: ResolvableRichText;
}

/**
 * Label options of a single list item.
 *
 * Unlike a received `RichBlockListItem`, an input list item has no `label`: the client
 * derives the label from `type` and `value`, and an item without either is rendered as
 * an unordered bullet.
 *
 * @category Rich Message Types
 * @since Bot API 10.2
 */
export interface RichListItemOptions {
	/** Pass `true` if the item has a checkbox. */
	has_checkbox?: true;
	/** Pass `true` if the item has a checked checkbox. Implies `has_checkbox`. */
	is_checked?: true;
	/** For ordered lists, the numeric value of the item label. */
	value?: number;
	/** For ordered lists, the type of the item label. */
	type?: TT.InputRichBlockListItem<never>['type'];
}

/**
 * A builder for the items of a `list block`.
 *
 * @typeParam F - The file type accepted by the Bot API client.
 *
 * @category Rich Message Builders
 *
 * @example
 * ```typescript
 * const list = new RichListBuilder();
 * list.text('First');
 * list.text('Second', { is_checked: true });
 * ```
 * @since Bot API 10.2
 */
export class RichListBuilder<F = never> {
	/** The items collected so far. */
	protected _items: TT.InputRichBlockListItem<F>[] = [];
	/** The parent builder if this builder is an unmerged fork. */
	protected _parent?: RichListBuilder<F>;

	/**
	 * Indicates whether this builder is a fork that has not been merged yet.
	 */
	public get isFork(): boolean {
		return this._parent !== undefined;
	}

	/**
	 * The parent builder, if this builder is an unmerged fork.
	 */
	public get parent(): RichListBuilder<F> | undefined {
		return this._parent;
	}

	/**
	 * Indicates whether no item has been added yet.
	 */
	public get isEmpty(): boolean {
		return this._items.length === 0;
	}

	/**
	 * Hook for subclasses that can be frozen; a plain builder never refuses a write.
	 *
	 * @throws {TypeError} In a subclass, if the builder has been frozen.
	 */
	protected _assertWritable(): void {
		// A plain builder is always writable.
	}

	/**
	 * Creates a child builder whose items can later be merged back into this one.
	 *
	 * @returns A new builder whose `merge()` appends its items here.
	 * @since Bot API 10.2
	 */
	public fork(): RichListBuilder<F> {
		const child = new RichListBuilder<F>();
		child._parent = this;
		return child;
	}

	/**
	 * Appends this fork's items to its parent and detaches it.
	 *
	 * @returns Nothing.
	 * @throws {TypeError} If this builder is not a fork, or was merged already.
	 * @since Bot API 10.2
	 */
	public merge(): void {
		if (!this._parent) {
			throw new TypeError(
				'Cannot merge: This builder is not a fork or has already been merged.',
			);
		}
		this._parent.addItems(...this._items);
		this._parent = undefined;
	}

	/**
	 * Creates an independent copy of this builder. The copy is never a fork.
	 *
	 * The item list is copied, but the items themselves are shared: they may hold file
	 * handles that cannot be cloned, so treat built items as immutable.
	 *
	 * @returns A new builder holding the same items.
	 * @since Bot API 10.2
	 */
	public clone(): RichListBuilder<F> {
		const instance = new RichListBuilder<F>();
		instance._items = [...this._items];
		return instance;
	}

	/**
	 * Appends an item that is already in Bot API form.
	 *
	 * @param item - The item to append.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 10.2
	 */
	public addItem(item: TT.InputRichBlockListItem<F>): this {
		this._assertWritable();
		this._items.push(item);
		return this;
	}

	/**
	 * Appends several items that are already in Bot API form.
	 *
	 * @param items - The items to append, in order.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 10.2
	 */
	public addItems(...items: TT.InputRichBlockListItem<F>[]): this {
		this._assertWritable();
		this._items.push(...items);
		return this;
	}

	/**
	 * Adds an item holding arbitrary blocks.
	 *
	 * @param blocks - The blocks nested in the item.
	 * @param options - Checkbox state and ordered-list label of the item.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 10.2
	 */
	public item(blocks: ResolvableRichBlocks<F>, options: RichListItemOptions = {}): this {
		const item: TT.InputRichBlockListItem<F> = { blocks: unwrapRichBlocks<F>(blocks) };
		if (options.is_checked) {
			item.has_checkbox = true;
			item.is_checked = true;
		} else if (options.has_checkbox) {
			item.has_checkbox = true;
		}
		if (options.value !== undefined) {
			item.value = options.value;
		}
		if (options.type !== undefined) {
			item.type = options.type;
		}
		return this.addItem(item);
	}

	/**
	 * Adds an item holding a single paragraph of rich text.
	 *
	 * @param text - The content of the item's paragraph.
	 * @param options - Checkbox state and ordered-list label of the item.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 10.2
	 */
	public text(text: ResolvableRichText, options: RichListItemOptions = {}): this {
		return this.item({ type: 'paragraph', text: unwrapRichText(text) }, options);
	}

	/**
	 * Returns a snapshot of the items collected so far.
	 *
	 * @returns The items, as a fresh array that the builder no longer owns.
	 * @since Bot API 10.2
	 */
	public build(): TT.InputRichBlockListItem<F>[] {
		return [...this._items];
	}
}

/**
 * Initializer of a single table cell, where `align` and `valign` may be omitted.
 *
 * @category Rich Message Types
 * @since Bot API 10.1
 */
export interface RichTableCellInit extends Omit<
	TT.RichBlockTableCell,
	'text' | 'align' | 'valign'
> {
	/** Text in the cell. If omitted, the cell is invisible. */
	text?: ResolvableRichText;
	/** Horizontal cell content alignment; defaults to `"left"`. */
	align?: TT.RichBlockTableCell['align'];
	/** Vertical cell content alignment; defaults to `"top"`. */
	valign?: TT.RichBlockTableCell['valign'];
}

/**
 * A resolvable table cell: either the cell text, or a {@link RichTableCellInit}.
 *
 * @category Rich Message Types
 * @since Bot API 10.1
 */
export type ResolvableRichTableCell = ResolvableRichText | RichTableCellInit;

/**
 * Tells a {@link RichTableCellInit} apart from a {@link ResolvableRichText}.
 *
 * Every `RichText` node carries a `type`, and the remaining rich text forms are
 * strings, arrays, or builders, so an object without `type` is a cell initializer.
 *
 * @internal
 */
function isTableCellInit(cell: ResolvableRichTableCell): cell is RichTableCellInit {
	return (
		typeof cell === 'object' &&
		!Array.isArray(cell) &&
		!(cell instanceof RichTextBuilder) &&
		!('type' in cell)
	);
}

/**
 * Normalizes a resolvable cell, filling in the required alignment defaults.
 *
 * @internal
 */
function unwrapTableCell(cell: ResolvableRichTableCell): TT.RichBlockTableCell {
	if (!isTableCellInit(cell)) {
		return { text: unwrapRichText(cell), align: 'left', valign: 'top' };
	}

	const { text, align, valign, ...rest } = cell;
	const result: TT.RichBlockTableCell = {
		...rest,
		align: align ?? 'left',
		valign: valign ?? 'top',
	};
	if (text !== undefined) {
		result.text = unwrapRichText(text);
	}
	return result;
}

/**
 * Options of a `table block`.
 *
 * @category Rich Message Types
 * @since Bot API 10.2
 */
export interface RichTableOptions {
	/** Pass `true` if the table has borders. */
	is_bordered?: true;
	/** Pass `true` if the table is striped. */
	is_striped?: true;
	/** Pass `true` if table cells must have smaller indents. */
	is_compact?: true;
	/** Caption of the table. */
	caption?: ResolvableRichText;
}

/**
 * Options of a `map block`.
 *
 * @category Rich Message Types
 * @since Bot API 10.2
 */
export interface RichMapOptions extends RichBlockCaptionOptions {
	/** Map zoom level; 0-24. */
	zoom: number;
	/** Map width; 0-10000. */
	width: number;
	/** Map height; 0-10000. */
	height: number;
}

/**
 * Options of a `details block`.
 *
 * @category Rich Message Types
 * @since Bot API 10.2
 */
export interface RichDetailsOptions {
	/** Pass `true` if the content of the block is visible by default. */
	is_open?: true;
}

/**
 * Options of a `preformatted block`.
 *
 * @category Rich Message Types
 * @since Bot API 10.2
 */
export interface RichPreformattedOptions {
	/** Programming language of the block. */
	language?: string;
}

/**
 * Options of a `buttons block`.
 *
 * @category Rich Message Types
 * @since Bot API 10.3
 */
export interface RichButtonsOptions {
	/** Horizontal alignment of the buttons. */
	align?: TT.InputRichBlockButtons['align'];
}

/**
 * Options of {@link RichBlockBuilder.build}.
 *
 * @category Rich Message Types
 * @since Bot API 10.2
 */
export interface RichBlockBuildOptions {
	/**
	 * Pass `true` to freeze every reference in the tree once it has been resolved, so
	 * that any later write throws. Defaults to `false`, which keeps the tree writable
	 * and lets the same builder be built more than once.
	 */
	finish?: boolean;
	/**
	 * Pass `false` to skip the checks for empty fields that the Bot API rejects.
	 * Defaults to `true`.
	 */
	checkEmpty?: boolean;
}

/**
 * Normalizes a media argument: a bare file reference becomes an `InputMedia` of the
 * given type, while a full `InputMedia` object is passed through.
 *
 * @internal
 */
function unwrapMedia<F, T extends string>(
	type: T,
	media: string | ({ type: T } & { media: F | string }),
): { type: T } & { media: F | string } {
	return typeof media === 'string' ? { type, media } : media;
}

/**
 * Indicates whether a `RichText` value carries nothing at all.
 *
 * @internal
 */
function isEmptyRichText(text: TT.RichText): boolean {
	if (typeof text === 'string') {
		return text.length === 0;
	}
	if (Array.isArray(text)) {
		return text.every(isEmptyRichText);
	}
	return false;
}

/**
 * Checks a resolved block tree for the empty fields the Bot API rejects.
 *
 * The rules are measured, not derived: `heading.text` and `footer.text` must not be
 * empty while `paragraph.text` and `details.summary` may be, even though all four are
 * the same required `RichText` in the typings. See `agents/rich-limit.md`.
 *
 * `list.items`, `details.blocks` and a list item's `blocks` must not be empty either.
 *
 * Note that the server also rejects a message that holds blocks but no content at all,
 * such as a lone divider. Where exactly the line between "content" and "no content"
 * falls was not measured, so that case is left to the server.
 *
 * @internal
 */
function assertNoEmptyFields<F>(blocks: TT.InputRichBlock<F>[], path: string): void {
	for (const [index, block] of blocks.entries()) {
		const at = `${path}[${index}] (${block.type})`;

		if (
			(block.type === 'heading' || block.type === 'footer') &&
			isEmptyRichText(block.text)
		) {
			throw new TypeError(
				`${at}: text must not be empty; the Bot API answers ` +
					'RICH_MESSAGE_CONTENT_REQUIRED.',
			);
		}

		if (block.type === 'list') {
			if (block.items.length === 0) {
				throw new TypeError(
					`${at}: items must not be empty; the Bot API answers "list must be non-empty".`,
				);
			}
			for (const [itemIndex, item] of block.items.entries()) {
				if (item.blocks.length === 0) {
					throw new TypeError(
						`${at}.items[${itemIndex}]: blocks must not be empty; the Bot API answers ` +
							'RICH_MESSAGE_EMPTY.',
					);
				}
				assertNoEmptyFields(item.blocks, `${at}.items[${itemIndex}].blocks`);
			}
			continue;
		}

		if (block.type === 'details' && block.blocks.length === 0) {
			throw new TypeError(
				`${at}: blocks must not be empty; the Bot API answers RICH_MESSAGE_EMPTY.`,
			);
		}

		if ('blocks' in block) {
			assertNoEmptyFields(block.blocks, `${at}.blocks`);
		}
	}
}

/**
 * A builder for the block list of a Telegram rich message.
 *
 * Every block method appends one block **and hands back a reference to it**, so the
 * block's position is fixed at the moment the method is called while its content can go
 * on being filled in afterwards. Resolution happens in {@link RichBlockBuilder.build},
 * which is what `sendRichMessage` consumes directly — no HTML or Markdown
 * serialization is involved.
 *
 * @typeParam F - The file type accepted by the Bot API client (grammY's `InputFile`).
 *   Defaults to `never`, meaning only already-uploaded files and URLs can be used.
 *
 * @category Rich Message Builders
 * @useWhen - You need to assemble the blocks of a rich message.
 * @avoidWhen - You want the finished `rich_message` payload (use `RichMessageBuilder`).
 * @never - NEVER mutate the array returned by `build()`, nor the blocks inside it.
 *
 * @example
 * ```typescript
 * import { fr, RichBlockBuilder } from "@sunafterrainwm/telegram-entities-builder";
 *
 * const b = new RichBlockBuilder();
 * b.heading(2).add('Release notes');
 * b.add(fr`Everything is ${fr.bold`new`}.`);
 * const blocks = b.build();
 * ```
 * @since Bot API 10.2
 */
export class RichBlockBuilder<F = never> {
	/** The block list, holding finished blocks and unresolved references alike. */
	protected _slots: BlockSlot<F>[] = [];
	/** The parent builder if this builder is an unmerged fork. */
	protected _parent?: RichBlockBuilder<F>;
	readonly #state = new RefState();

	/**
	 * Freeze state that nested references are attached to.
	 *
	 * @internal
	 */
	public get [kState](): RefState {
		return this.#state;
	}

	/**
	 * Indicates whether this builder is a fork that has not been merged yet.
	 */
	public get isFork(): boolean {
		return this._parent !== undefined;
	}

	/**
	 * The parent builder, if this builder is an unmerged fork.
	 */
	public get parent(): RichBlockBuilder<F> | undefined {
		return this._parent;
	}

	/**
	 * Indicates whether no block has been added yet.
	 */
	public get isEmpty(): boolean {
		return this._slots.length === 0;
	}

	/**
	 * A reference to the last block, or `undefined` while the list is empty.
	 *
	 * A block appended through {@link RichBlockBuilder.addBlock} has no builder behind
	 * it, so it comes back as a {@link ReadonlyRichBlockRef} on which only `type`
	 * carries information.
	 */
	public get lastBlock(): RichBlockRef | undefined {
		const slot = this._slots.at(-1);
		if (slot === undefined) {
			return undefined;
		}
		return isInternalRef<F>(slot) ? slot : new ReadonlyRichBlockRef(slot.type);
	}

	/**
	 * Hook for subclasses that can be frozen; a plain builder never refuses a write.
	 *
	 * @throws {TypeError} In a subclass, if the builder has been frozen.
	 */
	protected _assertWritable(): void {
		// A plain builder is always writable.
	}

	/**
	 * Appends a slot, registering a reference with this builder's freeze state.
	 *
	 * @param ref - The reference to append.
	 * @returns The same reference, so the caller can hand it on.
	 *
	 * @internal
	 */
	protected _addSlot<R extends InternalRichBlockRef<F>>(ref: R): R {
		this._assertWritable();
		this[kState].adopt(ref[kState]);
		this._slots.push(ref);
		return ref;
	}

	/**
	 * Creates a child builder whose blocks can later be merged back into this one.
	 *
	 * @returns A new builder whose `merge()` appends its blocks here.
	 * @since Bot API 10.2
	 */
	public fork(): RichBlockBuilder<F> {
		const child = new RichBlockBuilder<F>();
		child._parent = this;
		return child;
	}

	/**
	 * Appends this fork's blocks to its parent and detaches it.
	 *
	 * References created on the fork keep working after the merge: the slots move
	 * across unresolved.
	 *
	 * @returns Nothing.
	 * @throws {TypeError} If this builder is not a fork, or was merged already.
	 * @since Bot API 10.2
	 */
	public merge(): void {
		if (!this._parent) {
			throw new TypeError(
				'Cannot merge: This builder is not a fork or has already been merged.',
			);
		}
		this._parent._assertWritable();
		this._parent._slots.push(...this._slots);
		this._parent[kState].adopt(this[kState]);
		this._parent = undefined;
	}

	/**
	 * Creates an independent copy of this builder. The copy is never a fork.
	 *
	 * The block list is copied, but the blocks themselves are shared: they may hold
	 * file handles that cannot be cloned, so treat built blocks as immutable.
	 * References are shared too, so writing through one still reaches both builders.
	 *
	 * @returns A new builder holding the same blocks.
	 * @since Bot API 10.2
	 */
	public clone(): RichBlockBuilder<F> {
		const instance = new RichBlockBuilder<F>();
		instance._slots = [...this._slots];
		return instance;
	}

	/**
	 * Resolves the block list without applying any checks.
	 *
	 * @returns The blocks as they currently stand.
	 *
	 * @internal
	 */
	protected _resolve(): TT.InputRichBlock<F>[] {
		return resolveSlots(this._slots);
	}

	/**
	 * Resolves every reference and returns the finished block list.
	 *
	 * @param options - Whether to freeze the tree afterwards, and whether to check for
	 *   the empty fields the Bot API rejects.
	 * @returns The blocks, as a fresh array that the builder no longer owns.
	 * @throws {TypeError} If a field the Bot API requires is empty, unless
	 *   `checkEmpty` is `false`.
	 * @since Bot API 10.2
	 */
	public build(options: RichBlockBuildOptions = {}): TT.InputRichBlock<F>[] {
		const blocks = this._resolve();
		if (options.checkEmpty !== false) {
			if (blocks.length === 0) {
				throw new TypeError(
					'blocks must not be empty; the Bot API answers RICH_MESSAGE_EMPTY.',
				);
			}
			assertNoEmptyFields(blocks, 'blocks');
		}
		if (options.finish) {
			this[kState].finish();
		}
		return blocks;
	}

	/**
	 * Measures the block list in the units the Bot API counts.
	 *
	 * Deliberately does not go through {@link RichBlockBuilder.build}, so that a tree
	 * which is still being filled in can be measured without tripping the checks for
	 * empty fields. This is what makes "measure, then add more" possible.
	 *
	 * @returns The size of the message in each counted unit.
	 * @since Bot API 10.2
	 */
	public measureBlock(): RichBlockMeasurement {
		return measureRichBlocks(this._resolve());
	}

	/**
	 * Checks the block list against the limits the Bot API enforces.
	 *
	 * Never called on your behalf: running out of budget is a situation a caller plans
	 * for by measuring and truncating, not an exception to be thrown at delivery time.
	 *
	 * @returns Nothing.
	 * @throws {RangeError} If the text length, the top-level block count or the nesting
	 *   depth exceeds its measured limit.
	 * @since Bot API 10.2
	 */
	public assertWithinLimits(): void {
		const measurement = this.measureBlock();
		for (const key of ['characters', 'topLevelBlocks', 'depth'] as const) {
			const limit = richMessageLimits[key];
			if (measurement[key] > limit) {
				throw new RangeError(
					`Rich message ${key} is ${measurement[key]}, over the limit of ${limit}.`,
				);
			}
		}
	}

	/**
	 * Appends a raw input block.
	 *
	 * @param block - The block to append.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 10.2
	 */
	public addBlock(block: TT.InputRichBlock<F>): this {
		this._assertWritable();
		this._slots.push(block);
		return this;
	}

	/**
	 * Appends several raw input blocks.
	 *
	 * @param blocks - The blocks to append, in order.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 10.2
	 */
	public addBlocks(...blocks: TT.InputRichBlock<F>[]): this {
		this._assertWritable();
		this._slots.push(...blocks);
		return this;
	}

	/**
	 * Appends resolvable rich blocks. A bare rich text becomes a paragraph.
	 *
	 * @param blocks - The blocks to append.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 10.2
	 */
	public add(blocks: ResolvableRichBlocks<F>): this;
	/**
	 * Appends a paragraph written as a tagged template.
	 *
	 * @param strings - The literal parts of the template.
	 * @param values - The interpolated resolvable rich text.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 10.2
	 */
	public add(strings: TemplateStringsArray, ...values: ResolvableRichText[]): this;
	public add(
		blocks: ResolvableRichBlocks<F> | TemplateStringsArray,
		...values: ResolvableRichText[]
	): this {
		this._assertWritable();
		if (isTemplateStrings(blocks)) {
			const text = interleaveTemplate(blocks, values);
			this._slots.push({ type: 'paragraph', text: unwrapRichText(text) });
			return this;
		}
		this._slots.push(...unwrapRichBlocks<F>(blocks));
		return this;
	}

	/**
	 * A text paragraph, corresponding to the HTML tag `<p>`.
	 *
	 * An empty paragraph is legal: the Bot API accepts `text: []`, which is what lets a
	 * paragraph be reserved here and filled in later — or not at all.
	 *
	 * @returns A reference to the paragraph, whose `text` accepts the content.
	 * @since Bot API 10.2
	 */
	public paragraph(): RichTextBlockRef<F> {
		return this._addSlot(
			new RichTextBlockRef<F>('paragraph', (text) => ({ type: 'paragraph', text })),
		);
	}

	/**
	 * A section heading; `size` is 1 (largest) to 6 (smallest).
	 *
	 * @param size - Relative font size; 1 is the largest and 6 the smallest.
	 * @returns A reference to the heading, whose `text` accepts the content.
	 * @since Bot API 10.2
	 */
	public heading(size: TT.InputRichBlockSectionHeading['size'] = 1): RichTextBlockRef<F> {
		return this._addSlot(
			new RichTextBlockRef<F>('heading', (text) => ({ type: 'heading', text, size })),
		);
	}

	/**
	 * A preformatted text block, optionally tagged with a programming language.
	 *
	 * @param options - Programming language of the block.
	 * @returns A reference to the block, whose `text` accepts the content.
	 * @since Bot API 10.2
	 */
	public preformatted(options: RichPreformattedOptions = {}): RichTextBlockRef<F> {
		return this._addSlot(
			new RichTextBlockRef<F>('pre', (text) => {
				const block: TT.InputRichBlockPreformatted = { type: 'pre', text };
				if (options.language !== undefined) {
					block.language = options.language;
				}
				return block;
			}),
		);
	}

	/**
	 * A footer, corresponding to the HTML tag `<footer>`.
	 *
	 * @returns A reference to the footer, whose `text` accepts the content.
	 * @since Bot API 10.2
	 */
	public footer(): RichTextBlockRef<F> {
		return this._addSlot(
			new RichTextBlockRef<F>('footer', (text) => ({ type: 'footer', text })),
		);
	}

	/**
	 * A divider, corresponding to the HTML tag `<hr/>`.
	 *
	 * @returns A reference to the divider, which holds no content.
	 * @since Bot API 10.2
	 */
	public divider(): RichLeafRef<F> {
		return this._addSlot(new RichLeafRef<F>({ type: 'divider' }));
	}

	/**
	 * A block holding a mathematical expression in LaTeX format.
	 *
	 * @param expression - The expression in LaTeX format.
	 * @returns A reference to the block, which holds no further content.
	 * @since Bot API 10.2
	 */
	public mathematicalExpression(expression: string): RichLeafRef<F> {
		return this._addSlot(
			new RichLeafRef<F>({ type: 'mathematical_expression', expression }),
		);
	}

	/**
	 * A block holding an anchor that can be linked to from within the message.
	 *
	 * @param name - Name under which the anchor or reference is defined.
	 * @returns A reference to the block, which holds no further content.
	 * @since Bot API 10.2
	 */
	public anchor(name: string): RichLeafRef<F> {
		return this._addSlot(new RichLeafRef<F>({ type: 'anchor', name }));
	}

	/**
	 * A list, ordered or unordered depending on the items.
	 *
	 * @returns A reference to the list, whose `items` accepts the content.
	 * @since Bot API 10.2
	 */
	public list(): RichListRef<F> {
		return this._addSlot(new RichListRef<F>());
	}

	/**
	 * A block quotation holding further blocks.
	 *
	 * @param options - Credit of the quotation.
	 * @returns A reference to the quotation, whose `blocks` accepts the content.
	 * @since Bot API 10.2
	 */
	public blockquote(options: RichBlockCreditOptions = {}): RichBlocksRef<F> {
		return this._addSlot(
			new RichBlocksRef<F>('blockquote', (blocks) => {
				const block: TT.InputRichBlockBlockQuotation<F> = { type: 'blockquote', blocks };
				if (options.credit !== undefined) {
					block.credit = unwrapRichText(options.credit);
				}
				return block;
			}),
		);
	}

	/**
	 * A collapsed-by-default block quotation holding inline text.
	 *
	 * @param options - Credit of the quotation.
	 * @returns A reference to the quotation, whose `text` accepts the content.
	 * @since Bot API 10.2
	 */
	public expandableBlockquote(options: RichBlockCreditOptions = {}): RichTextBlockRef<F> {
		return this._addSlot(
			new RichTextBlockRef<F>('expandable_blockquote', (text) => {
				const block: TT.InputRichBlockExpandableBlockQuotation = {
					type: 'expandable_blockquote',
					text,
				};
				if (options.credit !== undefined) {
					block.credit = unwrapRichText(options.credit);
				}
				return block;
			}),
		);
	}

	/**
	 * A quotation with centered text, loosely corresponding to the HTML tag `<aside>`.
	 *
	 * @param options - Credit of the quotation.
	 * @returns A reference to the quotation, whose `text` accepts the content.
	 * @since Bot API 10.2
	 */
	public pullquote(options: RichBlockCreditOptions = {}): RichTextBlockRef<F> {
		return this._addSlot(
			new RichTextBlockRef<F>('pullquote', (text) => {
				const block: TT.InputRichBlockPullQuotation = { type: 'pullquote', text };
				if (options.credit !== undefined) {
					block.credit = unwrapRichText(options.credit);
				}
				return block;
			}),
		);
	}

	/**
	 * A collage of media blocks.
	 *
	 * @param options - Caption and credit of the block.
	 * @returns A reference to the collage, whose `blocks` accepts the content.
	 * @since Bot API 10.2
	 */
	public collage(options?: RichBlockCaptionOptions): RichBlocksRef<F> {
		return this._addSlot(
			new RichBlocksRef<F>('collage', (blocks) => {
				const block: TT.InputRichBlockCollage<F> = { type: 'collage', blocks };
				const caption = unwrapCaption(options);
				if (caption) {
					block.caption = caption;
				}
				return block;
			}),
		);
	}

	/**
	 * A slideshow of media blocks.
	 *
	 * @param options - Caption and credit of the block.
	 * @returns A reference to the slideshow, whose `blocks` accepts the content.
	 * @since Bot API 10.2
	 */
	public slideshow(options?: RichBlockCaptionOptions): RichBlocksRef<F> {
		return this._addSlot(
			new RichBlocksRef<F>('slideshow', (blocks) => {
				const block: TT.InputRichBlockSlideshow<F> = { type: 'slideshow', blocks };
				const caption = unwrapCaption(options);
				if (caption) {
					block.caption = caption;
				}
				return block;
			}),
		);
	}

	/**
	 * A table, corresponding to the HTML tag `<table>`.
	 *
	 * Cells may be given as plain rich text; `align` defaults to `"left"` and `valign`
	 * to `"top"`, both of which the Bot API requires on every cell.
	 *
	 * @param cells - The rows of the table, each a list of cells.
	 * @param options - Borders, stripes, compact indents and the table caption.
	 * @returns A reference to the table, which holds no further content.
	 * @since Bot API 10.2
	 */
	public table(
		cells: ResolvableRichTableCell[][],
		options: RichTableOptions = {},
	): RichLeafRef<F> {
		const block: TT.InputRichBlockTable = {
			type: 'table',
			cells: cells.map((row) => row.map(unwrapTableCell)),
		};
		if (options.is_bordered) {
			block.is_bordered = true;
		}
		if (options.is_striped) {
			block.is_striped = true;
		}
		if (options.is_compact) {
			block.is_compact = true;
		}
		if (options.caption !== undefined) {
			block.caption = unwrapRichText(options.caption);
		}
		return this._addSlot(new RichLeafRef<F>(block));
	}

	/**
	 * An expandable block for details disclosure, corresponding to `<details>`.
	 *
	 * The summary may be given here or written through the reference afterwards. An
	 * empty summary is accepted by the Bot API, so it is not checked.
	 *
	 * @param summary - The part that stays visible when the block is collapsed.
	 * @param options - Whether the block starts out open.
	 * @returns A reference to the block, whose `summary` and `blocks` accept content.
	 * @since Bot API 10.2
	 */
	public details(
		summary?: ResolvableRichText,
		options: RichDetailsOptions = {},
	): RichDetailsRef<F> {
		const ref = this._addSlot(new RichDetailsRef<F>(options));
		if (summary !== undefined) {
			ref.summary.add(summary);
		}
		return ref;
	}

	/**
	 * A block with a map centered on the given location.
	 *
	 * @param location - Location the map is centred on.
	 * @param options - Zoom, size, caption and credit of the block.
	 * @returns A reference to the block, which holds no further content.
	 * @since Bot API 10.2
	 */
	public map(location: TT.Location, options: RichMapOptions): RichLeafRef<F> {
		const block: TT.InputRichBlockMap = {
			type: 'map',
			location,
			zoom: options.zoom,
			width: options.width,
			height: options.height,
		};
		const caption = unwrapCaption(options);
		if (caption) {
			block.caption = caption;
		}
		return this._addSlot(new RichLeafRef<F>(block));
	}

	/**
	 * A block with an animation (GIF or soundless H.264/MPEG-4 AVC video).
	 *
	 * @param animation - A file identifier or URL, or a full `InputMediaAnimation`
	 *   (which is also where `has_spoiler` lives).
	 * @param options - Caption and credit of the block.
	 * @returns A reference to the block, which holds no further content.
	 * @since Bot API 10.2
	 */
	public animation(
		animation: TT.InputMediaAnimation<F> | string,
		options?: RichBlockCaptionOptions,
	): RichLeafRef<F> {
		const block: TT.InputRichBlockAnimation<F> = {
			type: 'animation',
			animation: unwrapMedia('animation', animation),
		};
		const caption = unwrapCaption(options);
		if (caption) {
			block.caption = caption;
		}
		return this._addSlot(new RichLeafRef<F>(block));
	}

	/**
	 * A block with a music file.
	 *
	 * @param audio - A file identifier or URL, or a full `InputMediaAudio`.
	 * @param options - Caption and credit of the block.
	 * @returns A reference to the block, which holds no further content.
	 * @since Bot API 10.2
	 */
	public audio(
		audio: TT.InputMediaAudio<F> | string,
		options?: RichBlockCaptionOptions,
	): RichLeafRef<F> {
		const block: TT.InputRichBlockAudio<F> = {
			type: 'audio',
			audio: unwrapMedia('audio', audio),
		};
		const caption = unwrapCaption(options);
		if (caption) {
			block.caption = caption;
		}
		return this._addSlot(new RichLeafRef<F>(block));
	}

	/**
	 * A block with a general file.
	 *
	 * @param document - A file identifier or URL, or a full `InputMediaDocument`.
	 * @param options - Caption and credit of the block.
	 * @returns A reference to the block, which holds no further content.
	 * @since Bot API 10.3
	 */
	public document(
		document: TT.InputMediaDocument<F> | string,
		options?: RichBlockCaptionOptions,
	): RichLeafRef<F> {
		const block: TT.InputRichBlockDocument<F> = {
			type: 'document',
			document: unwrapMedia('document', document),
		};
		const caption = unwrapCaption(options);
		if (caption) {
			block.caption = caption;
		}
		return this._addSlot(new RichLeafRef<F>(block));
	}

	/**
	 * A block with a photo.
	 *
	 * @param photo - A file identifier or URL, or a full `InputMediaPhoto` (which is
	 *   also where `has_spoiler` lives).
	 * @param options - Caption and credit of the block.
	 * @returns A reference to the block, which holds no further content.
	 * @since Bot API 10.2
	 */
	public photo(
		photo: TT.InputMediaPhoto<F> | string,
		options?: RichBlockCaptionOptions,
	): RichLeafRef<F> {
		const block: TT.InputRichBlockPhoto<F> = {
			type: 'photo',
			photo: unwrapMedia('photo', photo),
		};
		const caption = unwrapCaption(options);
		if (caption) {
			block.caption = caption;
		}
		return this._addSlot(new RichLeafRef<F>(block));
	}

	/**
	 * A block with a video.
	 *
	 * @param video - A file identifier or URL, or a full `InputMediaVideo` (which is
	 *   also where `has_spoiler` lives).
	 * @param options - Caption and credit of the block.
	 * @returns A reference to the block, which holds no further content.
	 * @since Bot API 10.2
	 */
	public video(
		video: TT.InputMediaVideo<F> | string,
		options?: RichBlockCaptionOptions,
	): RichLeafRef<F> {
		const block: TT.InputRichBlockVideo<F> = {
			type: 'video',
			video: unwrapMedia('video', video),
		};
		const caption = unwrapCaption(options);
		if (caption) {
			block.caption = caption;
		}
		return this._addSlot(new RichLeafRef<F>(block));
	}

	/**
	 * A block with a voice note.
	 *
	 * @param voiceNote - A file identifier or URL, or a full `InputMediaVoiceNote`.
	 * @param options - Caption and credit of the block.
	 * @returns A reference to the block, which holds no further content.
	 * @since Bot API 10.2
	 */
	public voiceNote(
		voiceNote: TT.InputMediaVoiceNote<F> | string,
		options?: RichBlockCaptionOptions,
	): RichLeafRef<F> {
		const block: TT.InputRichBlockVoiceNote<F> = {
			type: 'voice_note',
			voice_note: unwrapMedia('voice_note', voiceNote),
		};
		const caption = unwrapCaption(options);
		if (caption) {
			block.caption = caption;
		}
		return this._addSlot(new RichLeafRef<F>(block));
	}

	/**
	 * A row of 1-8 buttons. See `button` for factory helpers.
	 *
	 * @param buttons - The buttons of the row; 1-8 of them.
	 * @param options - Horizontal alignment of the row.
	 * @returns A reference to the block, which holds no further content.
	 * @since Bot API 10.3
	 */
	public buttons(
		buttons: TT.RichMessageButton[],
		options: RichButtonsOptions = {},
	): RichLeafRef<F> {
		const block: TT.InputRichBlockButtons = { type: 'buttons', buttons };
		if (options.align !== undefined) {
			block.align = options.align;
		}
		return this._addSlot(new RichLeafRef<F>(block));
	}

	/**
	 * A "Thinking…" placeholder. Accepted by `sendRichMessageDraft` only.
	 *
	 * @returns A reference to the block, whose `text` accepts the content.
	 * @since Bot API 10.3
	 */
	public thinking(): RichTextBlockRef<F> {
		return this._addSlot(
			new RichTextBlockRef<F>('thinking', (text) => ({ type: 'thinking', text })),
		);
	}
}

/**
 * A reference to a block that was appended as a finished value and holds no further
 * content, such as a divider, a table or a media block.
 *
 * @typeParam F - The file type accepted by the Bot API client.
 *
 * @category Rich Message Builders
 * @since Bot API 10.2
 */
export class RichLeafRef<F = never> implements InternalRichBlockRef<F> {
	readonly #state = new RefState();
	readonly #block: TT.InputRichBlock<F>;

	/**
	 * Wraps a finished block.
	 *
	 * @param block - The block this reference points at.
	 */
	public constructor(block: TT.InputRichBlock<F>) {
		this.#block = block;
	}

	/** @inheritDoc */
	public get type(): string {
		return this.#block.type;
	}

	/** @inheritDoc */
	public get isFinished(): boolean {
		return this.#state.isFinished;
	}

	/** @inheritDoc */
	public get [kState](): RefState {
		return this.#state;
	}

	/** @inheritDoc */
	public finish(): void {
		this.#state.finish();
	}

	/**
	 * Produces the block this reference stands for.
	 *
	 * @returns The block, built from the content collected so far.
	 */
	public [kResolve](): TT.InputRichBlock<F> {
		return this.#block;
	}
}

/**
 * A reference to a block whose content is inline rich text, such as a paragraph, a
 * heading or a footer.
 *
 * The reference **is** the text builder, so its content is written straight onto it.
 *
 * @typeParam F - The file type accepted by the Bot API client.
 *
 * @category Rich Message Builders
 *
 * @example
 * ```typescript
 * const b = new RichBlockBuilder();
 * const info = b.paragraph();
 * info.bold('Name').add('：').code('debian.iso');
 * ```
 * @since Bot API 10.2
 */
export class RichTextBlockRef<F = never>
	extends RichTextBuilder
	implements InternalRichBlockRef<F>
{
	readonly #state = new RefState();
	readonly #type: string;
	readonly #make: (text: TT.RichText) => TT.InputRichBlock<F>;

	/**
	 * Creates a reference to a text-carrying block.
	 *
	 * @param type - Type of the block being pointed at.
	 * @param make - Builds the block out of the collected text.
	 */
	public constructor(type: string, make: (text: TT.RichText) => TT.InputRichBlock<F>) {
		super();
		this.#type = type;
		this.#make = make;
	}

	/** @inheritDoc */
	public get type(): string {
		return this.#type;
	}

	/** @inheritDoc */
	public get isFinished(): boolean {
		return this.#state.isFinished;
	}

	/** @inheritDoc */
	public get [kState](): RefState {
		return this.#state;
	}

	/** @inheritDoc */
	public finish(): void {
		this.#state.finish();
	}

	/** @inheritDoc */
	protected override _assertWritable(): void {
		this.#state.assertWritable();
	}

	/**
	 * Produces the block this reference stands for.
	 *
	 * @returns The block, built from the content collected so far.
	 */
	public [kResolve](): TT.InputRichBlock<F> {
		return this.#make(this.buildText());
	}
}

/**
 * A reference to a stretch of rich text that belongs to a block reference without being
 * a block of its own — at present only the summary of a `details` block.
 *
 * It is a reference rather than a bare {@link RichTextBuilder} so that the type keeps
 * saying what it is when it is passed around or stored: a plain builder is independent
 * and never refuses a write, while this one is frozen along with the block it belongs
 * to.
 *
 * @category Rich Message Builders
 *
 * @example
 * ```typescript
 * const files = new RichBlockBuilder().details();
 * files.summary.bold('File list');
 * files.summary.finish(); // freezes the summary alone, not the whole block
 * ```
 * @since Bot API 10.2
 */
export class RichTextRef extends RichTextBuilder implements RichRef {
	readonly #state = new RefState();

	/**
	 * Freeze state of this reference.
	 *
	 * @internal
	 */
	public get [kState](): RefState {
		return this.#state;
	}

	/** @inheritDoc */
	public get isFinished(): boolean {
		return this.#state.isFinished;
	}

	/** @inheritDoc */
	public finish(): void {
		this.#state.finish();
	}

	/** @inheritDoc */
	protected override _assertWritable(): void {
		this.#state.assertWritable();
	}
}

/**
 * A reference to a block whose content is a list of further blocks, such as a block
 * quotation, a collage or a slideshow.
 *
 * The reference **is** the block builder, so nested blocks are added straight onto it.
 *
 * @typeParam F - The file type accepted by the Bot API client.
 *
 * @category Rich Message Builders
 * @since Bot API 10.2
 */
export class RichBlocksRef<F = never>
	extends RichBlockBuilder<F>
	implements InternalRichBlockRef<F>
{
	readonly #type: string;
	readonly #make: (blocks: TT.InputRichBlock<F>[]) => TT.InputRichBlock<F>;

	/**
	 * Creates a reference to a block-carrying block.
	 *
	 * @param type - Type of the block being pointed at.
	 * @param make - Builds the block out of the collected blocks.
	 */
	public constructor(
		type: string,
		make: (blocks: TT.InputRichBlock<F>[]) => TT.InputRichBlock<F>,
	) {
		super();
		this.#type = type;
		this.#make = make;
	}

	/** @inheritDoc */
	public get type(): string {
		return this.#type;
	}

	/** @inheritDoc */
	public get isFinished(): boolean {
		return this[kState].isFinished;
	}

	/** @inheritDoc */
	public finish(): void {
		this[kState].finish();
	}

	/** @inheritDoc */
	protected override _assertWritable(): void {
		this[kState].assertWritable();
	}

	/**
	 * Produces the block this reference stands for.
	 *
	 * @returns The block, built from the content collected so far.
	 */
	public [kResolve](): TT.InputRichBlock<F> {
		return this.#make(this._resolve());
	}
}

/**
 * A reference to a `details` block.
 *
 * Unlike the other references this one has two containers: the reference itself is the
 * block list, and `summary` is a separate text builder sharing the same freeze state.
 *
 * @typeParam F - The file type accepted by the Bot API client.
 *
 * @category Rich Message Builders
 *
 * @example
 * ```typescript
 * const b = new RichBlockBuilder();
 * const files = b.details('File list', { is_open: true });
 * files.list().text('debian.iso');
 * ```
 * @since Bot API 10.2
 */
export class RichDetailsRef<F = never>
	extends RichBlockBuilder<F>
	implements InternalRichBlockRef<F>
{
	readonly #summary = new RichTextRef();
	readonly #options: RichDetailsOptions;

	/**
	 * Creates a reference to a `details` block.
	 *
	 * @param options - Whether the block starts out open.
	 */
	public constructor(options: RichDetailsOptions) {
		super();
		this.#options = options;
		// its own state, adopted here: finishing the block finishes the summary, while
		// finishing the summary leaves the block list writable
		this[kState].adopt(this.#summary[kState]);
	}

	/** @inheritDoc */
	public readonly type = 'details';

	/** @inheritDoc */
	public get isFinished(): boolean {
		return this[kState].isFinished;
	}

	/**
	 * The always-visible summary of the block, which is a reference of its own: `details`
	 * is the one block with two containers, and the reference itself is the block list.
	 */
	public get summary(): RichTextRef {
		return this.#summary;
	}

	/** @inheritDoc */
	public finish(): void {
		this[kState].finish();
	}

	/** @inheritDoc */
	protected override _assertWritable(): void {
		this[kState].assertWritable();
	}

	/**
	 * Produces the block this reference stands for.
	 *
	 * @returns The block, built from the content collected so far.
	 */
	public [kResolve](): TT.InputRichBlock<F> {
		const block: TT.InputRichBlockDetails<F> = {
			type: 'details',
			summary: this.#summary.buildText(),
			blocks: this._resolve(),
		};
		if (this.#options.is_open) {
			block.is_open = true;
		}
		return block;
	}
}

/**
 * A reference to a `list` block.
 *
 * The reference **is** the item builder, so items are added straight onto it.
 *
 * @typeParam F - The file type accepted by the Bot API client.
 *
 * @category Rich Message Builders
 * @since Bot API 10.2
 */
export class RichListRef<F = never>
	extends RichListBuilder<F>
	implements InternalRichBlockRef<F>
{
	readonly #state = new RefState();

	/** @inheritDoc */
	public readonly type = 'list';

	/** @inheritDoc */
	public get isFinished(): boolean {
		return this.#state.isFinished;
	}

	/** @inheritDoc */
	public get [kState](): RefState {
		return this.#state;
	}

	/** @inheritDoc */
	public finish(): void {
		this.#state.finish();
	}

	/** @inheritDoc */
	protected override _assertWritable(): void {
		this.#state.assertWritable();
	}

	/**
	 * Produces the block this reference stands for.
	 *
	 * @returns The block, built from the content collected so far.
	 */
	public [kResolve](): TT.InputRichBlock<F> {
		return { type: 'list', items: this.build() };
	}
}
