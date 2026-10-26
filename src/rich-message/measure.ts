import type * as TT from '@grammyjs/types';

/**
 * The limits the Bot API enforces on a rich message, as measured against Bot API 10.3
 * on 2026-10-21.
 *
 * Each number is a server limit that was bisected, not a figure read off the
 * documentation — two of the documented ones disagree with the server. See
 * `agents/rich-limit.md` for the measurements, the exact error strings, and the list of
 * limits that were **not** measured and so are absent here.
 *
 * @category Rich Message Types
 * @since Bot API 10.2
 */
export const richMessageLimits = {
	/** Largest accepted total number of Unicode code points, over the whole message. */
	characters: 32768,
	/** Largest accepted length of the top-level block list. Nesting is not counted. */
	topLevelBlocks: 500,
	/** Largest accepted block nesting depth, counting the innermost block as a level. */
	depth: 16,
} as const;

/**
 * The size of a rich message, in the three units the Bot API actually counts.
 *
 * @category Rich Message Types
 * @since Bot API 10.2
 */
export interface RichBlockMeasurement {
	/**
	 * Total number of Unicode code points, summed over every block including nested
	 * ones. This is the unit the Bot API counts; note that it is **not** the UTF-16 code
	 * unit used by `MessageEntity.offset` on the classic side of this package.
	 */
	characters: number;
	/**
	 * Length of the top-level block list. The Bot API's 500-block limit applies to this
	 * number only — blocks nested in lists, details and quotations are not counted.
	 */
	topLevelBlocks: number;
	/**
	 * Total number of blocks, nested ones included. This corresponds to **no** server
	 * limit and is reported for information only; budget against
	 * {@link RichBlockMeasurement.topLevelBlocks} instead.
	 */
	totalBlocks: number;
	/** Deepest block nesting, counting the innermost block as a level. */
	depth: number;
	/** Number of media attachments, nested ones included. */
	media: number;
}

/**
 * Block types that carry a media attachment.
 *
 * @internal
 */
const MEDIA_TYPES = new Set([
	'animation',
	'audio',
	'document',
	'photo',
	'video',
	'voice_note',
]);

/**
 * Counts the Unicode code points of a string.
 *
 * `String.prototype.length` counts UTF-16 code units, which the Bot API does not: a
 * message of 16385 astral characters is 32770 code units and is accepted, while 32769
 * ASCII characters are rejected.
 *
 * @internal
 */
function countCodePoints(text: string): number {
	let count = text.length;
	for (let i = 0; i < text.length - 1; i++) {
		const high = text.charCodeAt(i);
		if (high < 0xd800 || high > 0xdbff) {
			continue;
		}
		const low = text.charCodeAt(i + 1);
		if (low >= 0xdc00 && low <= 0xdfff) {
			// a surrogate pair is two code units but one code point
			count--;
			i++;
		}
	}
	return count;
}

/**
 * Counts the Unicode code points of a `RichText` tree.
 *
 * Custom emoji alternative text and the LaTeX source of a mathematical expression are
 * counted, because the Bot API documents them as counting. That part is documented
 * rather than measured — see `agents/rich-limit.md`.
 *
 * @param text - The rich text to measure.
 * @returns The number of code points it contributes to the message.
 *
 * @internal
 */
export function measureRichText(text: TT.RichText): number {
	if (typeof text === 'string') {
		return countCodePoints(text);
	}
	if (Array.isArray(text)) {
		let total = 0;
		for (const node of text) {
			total += measureRichText(node);
		}
		return total;
	}
	if ('text' in text) {
		return measureRichText(text.text);
	}
	if (text.type === 'custom_emoji') {
		return countCodePoints(text.alternative_text);
	}
	if (text.type === 'mathematical_expression') {
		return countCodePoints(text.expression);
	}
	// anchor carries a name that is never rendered, and a button carries its own label.
	return 0;
}

/**
 * The rich text fields a block may carry.
 *
 * @internal
 */
const TEXT_KEYS = ['text', 'summary', 'caption', 'credit'] as const;

/**
 * Accumulator threaded through {@link measureRichBlocks}.
 *
 * @internal
 */
interface Accumulator {
	characters: number;
	totalBlocks: number;
	depth: number;
	media: number;
}

/**
 * Measures one block, recursing into whatever it nests.
 *
 * @internal
 */
function walkBlock<F>(
	block: TT.InputRichBlock<F>,
	level: number,
	acc: Accumulator,
): void {
	acc.totalBlocks++;
	acc.depth = Math.max(acc.depth, level);

	const record = block as unknown as Record<string, unknown>;
	for (const key of TEXT_KEYS) {
		if (key in record && record[key] !== undefined) {
			acc.characters += measureRichText(record[key] as TT.RichText);
		}
	}
	if (block.type === 'mathematical_expression') {
		acc.characters += countCodePoints(block.expression);
	}
	if (MEDIA_TYPES.has(block.type)) {
		acc.media++;
	}

	if ('blocks' in record) {
		for (const nested of record.blocks as TT.InputRichBlock<F>[]) {
			walkBlock(nested, level + 1, acc);
		}
	}
	if ('items' in record) {
		for (const item of record.items as TT.InputRichBlockListItem<F>[]) {
			for (const nested of item.blocks) {
				walkBlock(nested, level + 1, acc);
			}
		}
	}
	if ('cells' in record) {
		for (const row of record.cells as TT.RichBlockTableCell[][]) {
			for (const cell of row) {
				if (cell.text !== undefined) {
					acc.characters += measureRichText(cell.text);
				}
			}
		}
	}
}

/**
 * Measures a top-level block list against the units the Bot API counts.
 *
 * Deliberately independent of any builder, so that hand-assembled blocks can be
 * measured too, and so that a builder can measure itself without going through
 * `build()` — which validates, and would therefore refuse a tree that is still being
 * filled in.
 *
 * @param blocks - The top-level block list to measure.
 * @returns The size of the message in each counted unit.
 *
 * @internal
 */
export function measureRichBlocks<F>(
	blocks: TT.InputRichBlock<F>[],
): RichBlockMeasurement {
	const acc: Accumulator = { characters: 0, totalBlocks: 0, depth: 0, media: 0 };
	for (const block of blocks) {
		walkBlock(block, 1, acc);
	}
	return {
		characters: acc.characters,
		topLevelBlocks: blocks.length,
		totalBlocks: acc.totalBlocks,
		depth: acc.depth,
		media: acc.media,
	};
}
