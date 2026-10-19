import type * as TT from '@grammyjs/types';

import { type ResolvableRichText, RichTextBuilder, unwrapRichText } from './text.ts';

/**
 * A resolvable rich block, which can be a raw Telegram
 * `InputRichBlock`, a {@link RichBlockBuilder}, or an array
 * of resolvables.
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
	| ResolvableRichBlocks<F>[];

/**
 * Unwraps {@link ResolvableRichBlocks} into a flat array of
 * `InputRichBlock`.
 *
 * @param blocks - The resolvable blocks.
 * @returns A flat array of input blocks.
 *
 * @example
 * ```typescript
 * unwrapRichBlocks([{ type: 'divider' }, new RichBlockBuilder().paragraph('x')]);
 * // [{ type: "divider" }, { type: "paragraph", text: "x" }]
 * ```
 *
 * @category Rich Message Functions
 * @since Bot API 10.2
 */
export function unwrapRichBlocks<F = never>(
	blocks: ResolvableRichBlocks<F>,
): TT.InputRichBlock<F>[] {
	if (blocks instanceof RichBlockBuilder) {
		return blocks.build();
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
 * Builds a `RichBlockCaption`, or `undefined` when neither
 * a caption nor a credit was given.
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
 * new RichBlockBuilder().list((list) => {
 * 	list.text('First');
 * 	list.text('Second', { is_checked: true });
 * });
 * ```
 * @since Bot API 10.2
 */
export class RichListBuilder<F = never> {
	#items: TT.InputRichBlockListItem<F>[] = [];

	/**
	 * Adds an item holding arbitrary blocks.
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
		this.#items.push(item);
		return this;
	}

	/**
	 * Adds an item holding a single paragraph of rich text.
	 */
	public text(text: ResolvableRichText, options: RichListItemOptions = {}): this {
		return this.item({ type: 'paragraph', text: unwrapRichText(text) }, options);
	}

	/**
	 * Returns a snapshot of the items collected so far.
	 *
	 * @returns The items, as a fresh array that the builder no longer owns.
	 */
	public build(): TT.InputRichBlockListItem<F>[] {
		return [...this.#items];
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
 * A builder for the block list of a Telegram rich message.
 *
 * Every method appends one `InputRichBlock`, which is what
 * `sendRichMessage` consumes directly — no HTML or Markdown serialization is involved.
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
 * import { RichBlockBuilder } from "@sunafterrainwm/telegram-entities-builder";
 *
 * const blocks = new RichBlockBuilder()
 * 	.heading('Release notes', 2)
 * 	.paragraph('Everything is new.')
 * 	.build();
 * ```
 * @since Bot API 10.2
 */
export class RichBlockBuilder<F = never> {
	protected _blocks: TT.InputRichBlock<F>[] = [];
	protected _parent?: RichBlockBuilder<F>;

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
		return this._blocks.length === 0;
	}

	/**
	 * A snapshot of the blocks collected so far.
	 */
	public get blocks(): TT.InputRichBlock<F>[] {
		return [...this._blocks];
	}

	/**
	 * Creates a child builder whose blocks can later be merged back into this one.
	 *
	 * @returns A new builder whose `merge()` appends its blocks here.
	 */
	public fork(): RichBlockBuilder<F> {
		const child = new RichBlockBuilder<F>();
		child._parent = this;
		return child;
	}

	/**
	 * Appends this fork's blocks to its parent and detaches it.
	 *
	 * @throws {TypeError} If this builder is not a fork, or was merged already.
	 */
	public merge(): void {
		if (!this._parent) {
			throw new TypeError(
				'Cannot merge: This builder is not a fork or has already been merged.',
			);
		}
		this._parent.addBlocks(...this._blocks);
		this._parent = undefined;
	}

	/**
	 * Creates an independent copy of this builder. The copy is never a fork.
	 *
	 * The block list is copied, but the blocks themselves are shared: they may hold
	 * file handles that cannot be cloned, so treat built blocks as immutable.
	 *
	 * @returns A new builder holding the same blocks.
	 */
	public clone(): RichBlockBuilder<F> {
		const instance = new RichBlockBuilder<F>();
		instance._blocks = [...this._blocks];
		return instance;
	}

	/**
	 * Returns a snapshot of the blocks collected so far.
	 *
	 * @returns The blocks, as a fresh array that the builder no longer owns.
	 */
	public build(): TT.InputRichBlock<F>[] {
		return [...this._blocks];
	}

	/**
	 * Appends a raw input block.
	 */
	public addBlock(block: TT.InputRichBlock<F>): this {
		this._blocks.push(block);
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
		this._blocks.push(...blocks);
		return this;
	}

	/**
	 * Appends resolvable rich blocks.
	 */
	public add(blocks: ResolvableRichBlocks<F>): this {
		this._blocks.push(...unwrapRichBlocks<F>(blocks));
		return this;
	}

	/**
	 * A text paragraph, corresponding to the HTML tag `<p>`.
	 *
	 * @param text - The content to format.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 10.2
	 */
	public paragraph(text: ResolvableRichText): this {
		return this.addBlock({ type: 'paragraph', text: unwrapRichText(text) });
	}

	/**
	 * A section heading; `size` is 1 (largest) to 6 (smallest).
	 *
	 * @param text - The content to format.
	 * @param size - Relative font size; 1 is the largest and 6 the smallest.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 10.2
	 */
	public heading(
		text: ResolvableRichText,
		size: TT.InputRichBlockSectionHeading['size'] = 1,
	): this {
		return this.addBlock({ type: 'heading', text: unwrapRichText(text), size });
	}

	/**
	 * A preformatted text block, optionally tagged with a programming language.
	 *
	 * @param text - The content to format.
	 * @param language - Programming language of the block; omitted when not given.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 10.2
	 */
	public preformatted(text: ResolvableRichText, language?: string): this {
		const block: TT.InputRichBlockPreformatted = {
			type: 'pre',
			text: unwrapRichText(text),
		};
		if (language !== undefined) {
			block.language = language;
		}
		return this.addBlock(block);
	}

	/**
	 * A footer, corresponding to the HTML tag `<footer>`.
	 *
	 * @param text - The content to format.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 10.2
	 */
	public footer(text: ResolvableRichText): this {
		return this.addBlock({ type: 'footer', text: unwrapRichText(text) });
	}

	/**
	 * A divider, corresponding to the HTML tag `<hr/>`.
	 *
	 * @returns The current builder instance for chaining.
	 * @since Bot API 10.2
	 */
	public divider(): this {
		return this.addBlock({ type: 'divider' });
	}

	/**
	 * A block holding a mathematical expression in LaTeX format.
	 *
	 * @param expression - The expression in LaTeX format.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 10.2
	 */
	public mathematicalExpression(expression: string): this {
		return this.addBlock({ type: 'mathematical_expression', expression });
	}

	/**
	 * A block holding an anchor that can be linked to from within the message.
	 *
	 * @param name - Name under which the anchor or reference is defined.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 10.2
	 */
	public anchor(name: string): this {
		return this.addBlock({ type: 'anchor', name });
	}

	/**
	 * A list of blocks, corresponding to the HTML tags `<ul>` or `<ol>`.
	 *
	 * @param items - The items, either ready-made or assembled through a callback.
	 */
	public list(
		items:
			| TT.InputRichBlockListItem<F>[]
			| RichListBuilder<F>
			| ((list: RichListBuilder<F>) => void),
	): this {
		let resolved: TT.InputRichBlockListItem<F>[];
		if (typeof items === 'function') {
			const list = new RichListBuilder<F>();
			items(list);
			resolved = list.build();
		} else if (items instanceof RichListBuilder) {
			resolved = items.build();
		} else {
			resolved = items;
		}
		return this.addBlock({ type: 'list', items: resolved });
	}

	/** A block quotation holding further blocks. */
	public blockquote(
		blocks: ResolvableRichBlocks<F>,
		options: RichBlockCreditOptions = {},
	): this {
		const block: TT.InputRichBlockBlockQuotation<F> = {
			type: 'blockquote',
			blocks: unwrapRichBlocks<F>(blocks),
		};
		if (options.credit !== undefined) {
			block.credit = unwrapRichText(options.credit);
		}
		return this.addBlock(block);
	}

	/** A collapsed-by-default block quotation holding inline text. */
	public expandableBlockquote(
		text: ResolvableRichText,
		options: RichBlockCreditOptions = {},
	): this {
		const block: TT.InputRichBlockExpandableBlockQuotation = {
			type: 'expandable_blockquote',
			text: unwrapRichText(text),
		};
		if (options.credit !== undefined) {
			block.credit = unwrapRichText(options.credit);
		}
		return this.addBlock(block);
	}

	/** A quotation with centered text, loosely corresponding to the HTML tag `<aside>`. */
	public pullquote(text: ResolvableRichText, options: RichBlockCreditOptions = {}): this {
		const block: TT.InputRichBlockPullQuotation = {
			type: 'pullquote',
			text: unwrapRichText(text),
		};
		if (options.credit !== undefined) {
			block.credit = unwrapRichText(options.credit);
		}
		return this.addBlock(block);
	}

	/**
	 * A collage of media blocks.
	 *
	 * @param blocks - The blocks nested in this one.
	 * @param options - Optional fields of the block.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 10.2
	 */
	public collage(
		blocks: ResolvableRichBlocks<F>,
		options?: RichBlockCaptionOptions,
	): this {
		const block: TT.InputRichBlockCollage<F> = {
			type: 'collage',
			blocks: unwrapRichBlocks<F>(blocks),
		};
		const caption = unwrapCaption(options);
		if (caption) {
			block.caption = caption;
		}
		return this.addBlock(block);
	}

	/**
	 * A slideshow of media blocks.
	 *
	 * @param blocks - The blocks nested in this one.
	 * @param options - Optional fields of the block.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 10.2
	 */
	public slideshow(
		blocks: ResolvableRichBlocks<F>,
		options?: RichBlockCaptionOptions,
	): this {
		const block: TT.InputRichBlockSlideshow<F> = {
			type: 'slideshow',
			blocks: unwrapRichBlocks<F>(blocks),
		};
		const caption = unwrapCaption(options);
		if (caption) {
			block.caption = caption;
		}
		return this.addBlock(block);
	}

	/**
	 * A table, corresponding to the HTML tag `<table>`.
	 *
	 * Cells may be given as plain rich text; `align` defaults to `"left"` and `valign`
	 * to `"top"`, both of which the Bot API requires on every cell.
	 *
	 * @param cells - The rows of the table, each a list of cells.
	 * @param options - Borders, stripes, compact indents and the table caption.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 10.2
	 */
	public table(cells: ResolvableRichTableCell[][], options: RichTableOptions = {}): this {
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
		return this.addBlock(block);
	}

	/**
	 * An expandable block for details disclosure, corresponding to `<details>`.
	 *
	 * @param summary - The part that stays visible when the block is collapsed.
	 * @param blocks - The blocks revealed when it is expanded.
	 * @param options - Whether the block starts out open.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 10.2
	 */
	public details(
		summary: ResolvableRichText,
		blocks: ResolvableRichBlocks<F>,
		options: RichDetailsOptions = {},
	): this {
		const block: TT.InputRichBlockDetails<F> = {
			type: 'details',
			summary: unwrapRichText(summary),
			blocks: unwrapRichBlocks<F>(blocks),
		};
		if (options.is_open) {
			block.is_open = true;
		}
		return this.addBlock(block);
	}

	/**
	 * A block with a map centered on the given location.
	 *
	 * @param location - Location the map is centred on.
	 * @param options - Optional fields of the block.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 10.2
	 */
	public map(location: TT.Location, options: RichMapOptions): this {
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
		return this.addBlock(block);
	}

	/**
	 * A block with an animation (GIF or soundless H.264/MPEG-4 AVC video).
	 *
	 * @param animation - A file identifier or URL, or a full `InputMediaAnimation`
	 *   (which is also where `has_spoiler` lives).
	 */
	public animation(
		animation: TT.InputMediaAnimation<F> | string,
		options?: RichBlockCaptionOptions,
	): this {
		const block: TT.InputRichBlockAnimation<F> = {
			type: 'animation',
			animation: unwrapMedia('animation', animation),
		};
		const caption = unwrapCaption(options);
		if (caption) {
			block.caption = caption;
		}
		return this.addBlock(block);
	}

	/**
	 * A block with a music file.
	 *
	 * @param audio - A file identifier or URL, or a full `InputMediaAudio`.
	 * @param options - Optional fields of the block.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 10.2
	 */
	public audio(
		audio: TT.InputMediaAudio<F> | string,
		options?: RichBlockCaptionOptions,
	): this {
		const block: TT.InputRichBlockAudio<F> = {
			type: 'audio',
			audio: unwrapMedia('audio', audio),
		};
		const caption = unwrapCaption(options);
		if (caption) {
			block.caption = caption;
		}
		return this.addBlock(block);
	}

	/**
	 * A block with a general file.
	 *
	 * @param document - A file identifier or URL, or a full `InputMediaDocument`.
	 * @param options - Optional fields of the block.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 10.3
	 */
	public document(
		document: TT.InputMediaDocument<F> | string,
		options?: RichBlockCaptionOptions,
	): this {
		const block: TT.InputRichBlockDocument<F> = {
			type: 'document',
			document: unwrapMedia('document', document),
		};
		const caption = unwrapCaption(options);
		if (caption) {
			block.caption = caption;
		}
		return this.addBlock(block);
	}

	/**
	 * A block with a photo.
	 *
	 * @param photo - A file identifier or URL, or a full `InputMediaPhoto` (which is
	 *   also where `has_spoiler` lives).
	 */
	public photo(
		photo: TT.InputMediaPhoto<F> | string,
		options?: RichBlockCaptionOptions,
	): this {
		const block: TT.InputRichBlockPhoto<F> = {
			type: 'photo',
			photo: unwrapMedia('photo', photo),
		};
		const caption = unwrapCaption(options);
		if (caption) {
			block.caption = caption;
		}
		return this.addBlock(block);
	}

	/**
	 * A block with a video.
	 *
	 * @param video - A file identifier or URL, or a full `InputMediaVideo` (which is
	 *   also where `has_spoiler` lives).
	 */
	public video(
		video: TT.InputMediaVideo<F> | string,
		options?: RichBlockCaptionOptions,
	): this {
		const block: TT.InputRichBlockVideo<F> = {
			type: 'video',
			video: unwrapMedia('video', video),
		};
		const caption = unwrapCaption(options);
		if (caption) {
			block.caption = caption;
		}
		return this.addBlock(block);
	}

	/**
	 * A block with a voice note.
	 *
	 * @param voiceNote - A file identifier or URL, or a full `InputMediaVoiceNote`.
	 * @param options - Optional fields of the block.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 10.2
	 */
	public voiceNote(
		voiceNote: TT.InputMediaVoiceNote<F> | string,
		options?: RichBlockCaptionOptions,
	): this {
		const block: TT.InputRichBlockVoiceNote<F> = {
			type: 'voice_note',
			voice_note: unwrapMedia('voice_note', voiceNote),
		};
		const caption = unwrapCaption(options);
		if (caption) {
			block.caption = caption;
		}
		return this.addBlock(block);
	}

	/**
	 * A row of 1-8 buttons. See `button` for factory helpers.
	 *
	 * @param buttons - The buttons of the row; 1-8 of them.
	 * @param options - Horizontal alignment of the row.
	 * @returns The current builder instance for chaining.
	 * @since Bot API 10.3
	 */
	public buttons(
		buttons: TT.RichMessageButton[],
		options: RichButtonsOptions = {},
	): this {
		const block: TT.InputRichBlockButtons = { type: 'buttons', buttons };
		if (options.align !== undefined) {
			block.align = options.align;
		}
		return this.addBlock(block);
	}

	/**
	 * A "Thinking…" placeholder. Accepted by `sendRichMessageDraft` only.
	 */
	public thinking(text: ResolvableRichText): this {
		return this.addBlock({ type: 'thinking', text: unwrapRichText(text) });
	}
}
