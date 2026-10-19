import type * as TT from '@grammyjs/types';

import { type HtmlElementNode, type HtmlNode, parseHtmlTree } from './html-tree.ts';
import {
	ParseError,
	getLinkCustomEmojiId,
	getLinkUserId,
	mentionedUser,
	normalizeDateTimeFormat,
} from './internal.ts';
import {
	type HtmlTagMatch,
	HtmlTransform,
	type HtmlTransformOptions,
} from './transform.ts';

/**
 * Width used for a `<tg-map>` that does not carry a `width` attribute.
 *
 * Rich HTML omits the map size, but `InputRichBlockMap` requires it, so a 3:2 default is
 * applied and can be overridden with `width`/`height` attributes.
 *
 * @category Parsing
 */
export const DEFAULT_MAP_WIDTH = 600;

/**
 * Height used for a `<tg-map>` that does not carry a `height` attribute.
 *
 * @category Parsing
 */
export const DEFAULT_MAP_HEIGHT = 400;

/** @internal */
type Block = TT.InputRichBlock<never>;

/**
 * What a {@link RichTagHandler} returns.
 *
 * Blocks and rich text are both arrays of objects with a `type`, so the result says
 * which of the two it is rather than leaving the parser to guess. Returning nothing
 * drops the element.
 *
 * @category Parsing
 */
export type RichTagResult =
	| { blocks: TT.InputRichBlock<never>[]; text?: never }
	| { text: TT.RichText; blocks?: never }
	| undefined
	// `void` is what lets a handler body simply end without returning, which is the
	// usual shape of an event-handler-like callback.
	// eslint-disable-next-line @typescript-eslint/no-invalid-void-type
	| void;

/**
 * What a {@link RichTagHandler} is given.
 *
 * @category Parsing
 */
export interface RichTagContext {
	/** The element being rewritten. */
	element: HtmlElementNode;
	/** The element it is nested in, absent at the top level. */
	parent?: HtmlElementNode;
	/** How many element siblings precede it inside the same parent. */
	index: number;
	/** Whether the parser is collecting blocks or inline text here. */
	position: 'block' | 'inline';
	/** Parses the element's children as blocks. */
	blocks: () => TT.InputRichBlock<never>[];
	/** Parses the element's children as rich text. */
	text: () => TT.RichText;
}

/**
 * A handler that rewrites one element for {@link parseRichHtml}.
 *
 * Returning `{ blocks: context.blocks() }` makes an element transparent, returning
 * `{ text: … }` puts inline content in its place, and returning nothing drops it. Blocks
 * are only accepted where the parser is collecting blocks.
 *
 * A handler fires for the elements the parser walks as nodes, which leaves out the
 * structural children a block reads itself: `<li>`, `<tr>`, `<td>`, `<th>`, `<caption>`,
 * `<summary>`, `<figcaption>` and `<cite>` never reach one. Those shapes already have a
 * block of their own, so rewrite the enclosing `<ul>`, `<table>` or `<figure>` instead.
 *
 * @category Parsing
 */
export type RichTagHandler = (context: RichTagContext) => RichTagResult;

/**
 * The options {@link parseRichHtml} accepts inline.
 *
 * @category Parsing
 */
export interface RichTransformOptions extends HtmlTransformOptions<RichTagHandler> {
	/** Pass `true` if the rich message must be shown right-to-left. */
	is_rtl?: boolean;
	/** Pass `true` to skip automatic detection of entities. */
	skip_entity_detection?: boolean;
}

/**
 * A reusable {@link parseRichHtml} configuration.
 *
 * @example
 * ```typescript
 * import { parseRichHtml, RichTransform } from "@sunafterrainwm/telegram-entities-builder";
 *
 * const webPage = new RichTransform({
 * 	weak: true,
 * 	on: {
 * 		// Unwrap layout elements, keeping the blocks inside.
 * 		'div, section, article': (context) => ({ blocks: context.blocks() }),
 * 		// Map an unsupported inline tag onto one that exists.
 * 		'kbd': (context) => ({ text: { type: 'code', text: context.text() } }),
 * 		'nav': () => undefined,
 * 	},
 * });
 *
 * parseRichHtml(messyHtml, webPage);
 * ```
 *
 * @category Parsing
 */
export class RichTransform extends HtmlTransform<RichTagHandler> {
	/**
	 * @param options - The options to compile.
	 */
	public constructor(options: HtmlTransformOptions<RichTagHandler> = {}) {
		super(options);
	}
}

/**
 * The options {@link parseRichHtml} accepts, either inline or as a reusable
 * {@link RichTransform}.
 *
 * @category Parsing
 */
export type ParseRichOptions = RichTransformOptions | RichTransform;

/** @internal */
interface Context {
	/** Names defined by `<tg-reference name="…">`, used to tell references from anchors. */
	references: Set<string>;
	/** Whether to drop what cannot be represented instead of raising. */
	weak: boolean;
	/** The compiled handler table. */
	transform: RichTransform;
	/** Whether any handler is registered, so the lookup can be skipped. */
	useHandlers: boolean;
}

/**
 * Resolves the parse options into a transform and the message-level flags.
 *
 * @internal
 */
function resolveRichOptions(options?: ParseRichOptions): {
	transform: RichTransform;
	is_rtl?: boolean;
	skip_entity_detection?: boolean;
} {
	if (options instanceof RichTransform) {
		return { transform: options };
	}
	const { weak, on, is_rtl, skip_entity_detection } = options ?? {};
	return { transform: new RichTransform({ weak, on }), is_rtl, skip_entity_detection };
}

/**
 * Builds the parse context for one run.
 *
 * @internal
 */
function createContext(nodes: HtmlNode[], transform: RichTransform): Context {
	const ctx: Context = {
		references: new Set(),
		weak: transform.weak,
		transform,
		useHandlers: transform.hasHandlers,
	};
	collectReferences(nodes, ctx.references);
	return ctx;
}

/**
 * Runs the handler registered for an element, if any.
 *
 * @returns The handler's result, or `false` when no handler matched.
 * @internal
 */
function runHandler(
	node: HtmlElementNode,
	ctx: Context,
	position: 'block' | 'inline',
): RichTagResult | false {
	if (!ctx.useHandlers) {
		return false;
	}
	const match: HtmlTagMatch = { tag: node.tag, attrs: node.attrs };
	const handler = ctx.transform.handlerFor(match);
	if (!handler) {
		return false;
	}
	return handler({
		element: node,
		parent: node.parent,
		index: node.index,
		position,
		blocks: () => parseBlocks(node.children, ctx),
		text: () => collapse(parseInline(node.children, ctx)),
	});
}

/**
 * Inline tags that wrap their content in a rich text node of the given type.
 *
 * @internal
 */
const INLINE_WRAPPERS: Record<string, string | undefined> = {
	b: 'bold',
	strong: 'bold',
	i: 'italic',
	em: 'italic',
	u: 'underline',
	ins: 'underline',
	s: 'strikethrough',
	strike: 'strikethrough',
	del: 'strikethrough',
	code: 'code',
	mark: 'marked',
	sub: 'subscript',
	sup: 'superscript',
	'tg-spoiler': 'spoiler',
};

/**
 * Tags `parseInline` knows, so that an unknown one can be unwrapped at block level
 * instead of being folded into a paragraph.
 *
 * @internal
 */
const INLINE_TAGS = new Set([
	...Object.keys(INLINE_WRAPPERS),
	'br',
	'a',
	'tg-reference',
	'tg-emoji',
	'img',
	'tg-time',
	'tg-math',
	'tg-button',
	'cite',
	'figcaption',
	'summary',
]);

/** @internal */
const BLOCK_TAGS = new Set([
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'p',
	'pre',
	'footer',
	'hr',
	'ul',
	'ol',
	'blockquote',
	'aside',
	'figure',
	'img',
	'video',
	'audio',
	'tg-document',
	'tg-map',
	'tg-collage',
	'tg-slideshow',
	'table',
	'details',
	'tg-math-block',
	'tg-button-row',
]);

/**
 * Collapses a node list into the most compact `RichText`.
 *
 * @internal
 */
function collapse(nodes: TT.RichText[]): TT.RichText {
	if (nodes.length === 0) {
		return '';
	}

	return nodes.length === 1 ? nodes[0] : nodes;
}

/**
 * Whitespace for the purpose of trimming blocks. A no-break space is content, not
 * layout, so it is deliberately excluded.
 *
 * @internal
 */
const LEADING_SPACE = /^[ \t\n\r\f\v]+/;

/** @internal */
const TRAILING_SPACE = /[ \t\n\r\f\v]+$/;

/**
 * Trims the whitespace that surrounds a block's inline content.
 *
 * @internal
 */
function trimNodes(nodes: TT.RichText[]): TT.RichText[] {
	const result = [...nodes];
	if (typeof result[0] === 'string') {
		result[0] = result[0].replace(LEADING_SPACE, '');
		if (result[0] === '') {
			result.shift();
		}
	}
	const lastIndex = result.length - 1;
	const last = result[lastIndex];
	if (typeof last === 'string') {
		const trimmed = last.replace(TRAILING_SPACE, '');
		if (trimmed === '') {
			result.pop();
		} else {
			result[lastIndex] = trimmed;
		}
	}
	return result;
}

/** @internal */
function isElement(node: HtmlNode): node is HtmlElementNode {
	return node.kind === 'element';
}

/** @internal */
function isBlank(node: HtmlNode): boolean {
	return (
		node.kind === 'text' &&
		node.text.replace(LEADING_SPACE, '').replace(TRAILING_SPACE, '') === ''
	);
}

/** @internal */
function textContent(nodes: HtmlNode[]): string {
	return nodes
		.map((node) => (node.kind === 'text' ? node.text : textContent(node.children)))
		.join('');
}

/** @internal */
function findChild(node: HtmlElementNode, tag: string): HtmlElementNode | undefined {
	return node.children.filter(isElement).find((child) => child.tag === tag);
}

/**
 * Reads an attribute, treating both a missing one and an empty value as absent.
 *
 * A valueless attribute is stored as `''`, which for `align`, `type` and friends means
 * "not specified" rather than "the empty string".
 *
 * @internal
 */
function attr(element: HtmlElementNode, name: string): string | undefined {
	const value = element.attrs[name];
	return value === undefined || value === '' ? undefined : value;
}

/** @internal */
function numberAttr(element: HtmlElementNode, name: string): number | undefined {
	const raw = element.attrs[name];
	if (raw === undefined || raw.trim() === '') {
		return undefined;
	}
	const value = Number(raw);
	return Number.isFinite(value) ? value : undefined;
}

/**
 * Collects every `<tg-reference name="…">` so that `<a href="#…">` can be resolved to a
 * reference link rather than an anchor link.
 *
 * @internal
 */
function collectReferences(nodes: HtmlNode[], into: Set<string>): void {
	for (const node of nodes) {
		if (!isElement(node)) {
			continue;
		}
		if (node.tag === 'tg-reference' && node.attrs.name) {
			into.add(node.attrs.name);
		}
		collectReferences(node.children, into);
	}
}

/**
 * Converts inline HTML nodes into rich text.
 *
 * @internal
 */
function parseInline(nodes: HtmlNode[], ctx: Context): TT.RichText[] {
	const result: TT.RichText[] = [];

	const push = (node: TT.RichText): void => {
		if (node === '') {
			return;
		}
		const last = result[result.length - 1];
		if (typeof node === 'string' && typeof last === 'string') {
			result[result.length - 1] = last + node;
		} else {
			result.push(node);
		}
	};

	for (const node of nodes) {
		if (node.kind === 'text') {
			push(node.text);
			continue;
		}

		const handled = runHandler(node, ctx, 'inline');
		if (handled !== false) {
			if (handled === undefined || handled === null) {
				continue;
			}
			if (handled.text !== undefined) {
				const replacement = handled.text;
				if (Array.isArray(replacement)) {
					for (const child of replacement) {
						push(child);
					}
				} else {
					push(replacement);
				}
				continue;
			}
			if (!ctx.weak) {
				throw new ParseError(
					`The handler for "${node.tag}" returned blocks where only text fits`,
					node.position,
				);
			}
			continue;
		}

		const wrapper = INLINE_WRAPPERS[node.tag];
		if (wrapper !== undefined) {
			push({
				type: wrapper,
				text: collapse(parseInline(node.children, ctx)),
			} as TT.RichText);
			continue;
		}

		switch (node.tag) {
			case 'br':
				push('\n');
				break;
			case 'a': {
				const href = node.attrs.href;
				const name = node.attrs.name;
				if (href === undefined) {
					if (name !== undefined) {
						push({ type: 'anchor', name });
						for (const child of parseInline(node.children, ctx)) {
							push(child);
						}
					} else {
						for (const child of parseInline(node.children, ctx)) {
							push(child);
						}
					}
					break;
				}

				const text = collapse(parseInline(node.children, ctx));
				if (href.startsWith('#')) {
					const target = href.slice(1);
					if (ctx.references.has(target)) {
						push({ type: 'reference_link', text, reference_name: target });
					} else {
						push({ type: 'anchor_link', text, anchor_name: target });
					}
					break;
				}
				if (href.toLowerCase().startsWith('mailto:')) {
					push({ type: 'email_address', text, email_address: href.slice(7) });
					break;
				}
				if (href.toLowerCase().startsWith('tel:')) {
					push({ type: 'phone_number', text, phone_number: href.slice(4) });
					break;
				}
				const userId = getLinkUserId(href);
				if (userId !== undefined) {
					push({ type: 'text_mention', text, user: mentionedUser(userId) });
					break;
				}
				push({ type: 'url', text, url: href });
				break;
			}
			case 'tg-reference': {
				const name = node.attrs.name;
				if (name === undefined) {
					if (!ctx.weak) {
						throw new ParseError('Tag "tg-reference" must have a name', node.position);
					}
					for (const child of parseInline(node.children, ctx)) {
						push(child);
					}
					break;
				}
				push({
					type: 'reference',
					text: collapse(parseInline(node.children, ctx)),
					name,
				});
				break;
			}
			case 'tg-emoji': {
				const id = node.attrs['emoji-id'];
				if (id === undefined || !/^[1-9]\d*$/.test(id)) {
					if (!ctx.weak) {
						throw new ParseError(
							'Invalid custom emoji identifier specified',
							node.position,
						);
					}
					push(textContent(node.children));
					break;
				}
				push({
					type: 'custom_emoji',
					custom_emoji_id: id,
					alternative_text: textContent(node.children),
				});
				break;
			}
			case 'img': {
				// An inline <img src="tg://emoji?id=…" alt="…"/> is a custom emoji.
				const id = getLinkCustomEmojiId(node.attrs.src ?? '');
				if (id === undefined) {
					if (!ctx.weak) {
						throw new ParseError(
							'An inline <img> must reference a tg://emoji URL; media belongs in its own block',
							node.position,
						);
					}
					break;
				}
				push({
					type: 'custom_emoji',
					custom_emoji_id: id,
					alternative_text: node.attrs.alt ?? '',
				});
				break;
			}
			case 'tg-time': {
				const unix = numberAttr(node, 'unix');
				const format = normalizeDateTimeFormat(node.attrs.format ?? '');
				if (format === undefined || unix === undefined || unix <= 0) {
					if (!ctx.weak) {
						throw new ParseError(
							format === undefined
								? 'Invalid date format used'
								: 'Invalid Unix time specified',
							node.position,
						);
					}
					for (const child of parseInline(node.children, ctx)) {
						push(child);
					}
					break;
				}
				push({
					type: 'date_time',
					text: collapse(parseInline(node.children, ctx)),
					unix_time: unix,
					date_time_format: format,
				});
				break;
			}
			case 'tg-math':
				push({
					type: 'mathematical_expression',
					expression: textContent(node.children),
				});
				break;
			case 'tg-button': {
				const button = parseButton(node, ctx);
				if (button) {
					push({ type: 'button', button });
				}
				break;
			}
			case 'cite':
			case 'figcaption':
			case 'summary':
				// Handled by the enclosing block; ignored if it turns up inline.
				break;
			default:
				if (!ctx.weak) {
					throw new ParseError(`Unsupported tag "${node.tag}"`, node.position);
				}
				// Weak mode keeps the content of a tag it cannot represent.
				for (const child of parseInline(node.children, ctx)) {
					push(child);
				}
				break;
		}
	}

	return result;
}

/**
 * Converts a `<tg-button>` element into a rich message button.
 *
 * @internal
 */
function parseButton(
	node: HtmlElementNode,
	ctx: Context,
): TT.RichMessageButton | undefined {
	const text = collapse(trimNodes(parseInline(node.children, ctx)));
	const style = attr(node, 'style') as
		| NonNullable<TT.RichMessageButton['style']>
		| undefined;
	const withStyle = <B extends TT.RichMessageButton>(button: B): B =>
		style === undefined ? button : { ...button, style };

	const type = node.attrs.type;
	const url = node.attrs.url ?? '';
	const query = node.attrs.query ?? '';

	switch (type) {
		case 'url':
			return withStyle({ text, url });
		case 'callback_data':
			return withStyle({ text, callback_data: node.attrs.data ?? '' });
		case 'web_app':
			return withStyle({ text, web_app: { url } });
		case 'login_url': {
			const loginUrl: Omit<TT.LoginUrl, 'bot_username'> = { url };
			if (node.attrs['forward-text'] !== undefined) {
				loginUrl.forward_text = node.attrs['forward-text'];
			}
			if (node.attrs['request-write-access'] !== undefined) {
				loginUrl.request_write_access = true;
			}
			return withStyle({ text, login_url: loginUrl });
		}
		case 'switch_inline_query':
			return withStyle({ text, switch_inline_query: query });
		case 'switch_inline_query_current_chat':
			return withStyle({ text, switch_inline_query_current_chat: query });
		case 'switch_inline_query_chosen_chat': {
			const chosenChat: TT.SwitchInlineQueryChosenChat = {};
			if (query !== '') {
				chosenChat.query = query;
			}
			for (const [attribute, key] of [
				['allow-user-chats', 'allow_user_chats'],
				['allow-bot-chats', 'allow_bot_chats'],
				['allow-group-chats', 'allow_group_chats'],
				['allow-channel-chats', 'allow_channel_chats'],
			] as const) {
				if (node.attrs[attribute] !== undefined) {
					chosenChat[key] = true;
				}
			}
			return withStyle({ text, switch_inline_query_chosen_chat: chosenChat });
		}
		case 'copy_text':
			return withStyle({ text, copy_text: { text: node.attrs.text ?? '' } });
		case 'disabled':
			return withStyle({ text, disabled: {} });
		default:
			if (!ctx.weak) {
				throw new ParseError(`Unsupported button type "${type ?? ''}"`, node.position);
			}
			return undefined;
	}
}

/**
 * Reads the caption and credit of a `<figcaption>`.
 *
 * @internal
 */
function parseCaption(
	element: HtmlElementNode | undefined,
	ctx: Context,
): TT.RichBlockCaption | undefined {
	if (!element) {
		return undefined;
	}
	const cite = findChild(element, 'cite');
	const body = element.children.filter((child) => child !== cite);
	const caption: TT.RichBlockCaption = {
		text: collapse(trimNodes(parseInline(body, ctx))),
	};
	if (cite) {
		caption.credit = collapse(trimNodes(parseInline(cite.children, ctx)));
	}
	return caption;
}

/**
 * The file extension of a media URL, lower-cased and without the dot.
 *
 * @internal
 */
function extensionOf(url: string): string {
	const path = url.split(/[?#]/, 1)[0] ?? '';
	const dot = path.lastIndexOf('.');
	const slash = path.lastIndexOf('/');
	return dot > slash ? path.slice(dot + 1).toLowerCase() : '';
}

/**
 * Turns a media element into its block, choosing the block type from the tag and the
 * file extension the way the Bot API documents.
 *
 * @internal
 */
function parseMediaBlock(
	node: HtmlElementNode,
	caption: TT.RichBlockCaption | undefined,
	weak: boolean,
): Block | undefined {
	const src = node.attrs.src;
	if (src === undefined || src === '') {
		if (!weak) {
			throw new ParseError(`Tag "${node.tag}" must have a src`, node.position);
		}
		return undefined;
	}
	const hasSpoiler = node.attrs['tg-spoiler'] !== undefined;
	const extension = extensionOf(src);

	let block: Block;
	switch (node.tag) {
		case 'img':
			block = {
				type: 'photo',
				photo: hasSpoiler
					? { type: 'photo', media: src, has_spoiler: true }
					: { type: 'photo', media: src },
			};
			break;
		case 'video':
			if (extension === 'gif') {
				block = {
					type: 'animation',
					animation: hasSpoiler
						? { type: 'animation', media: src, has_spoiler: true }
						: { type: 'animation', media: src },
				};
			} else {
				block = {
					type: 'video',
					video: hasSpoiler
						? { type: 'video', media: src, has_spoiler: true }
						: { type: 'video', media: src },
				};
			}
			break;
		case 'audio':
			if (extension === 'ogg' || extension === 'oga' || extension === 'opus') {
				block = { type: 'voice_note', voice_note: { type: 'voice_note', media: src } };
			} else {
				block = { type: 'audio', audio: { type: 'audio', media: src } };
			}
			break;
		case 'tg-document':
			block = { type: 'document', document: { type: 'document', media: src } };
			break;
		default:
			if (!weak) {
				throw new ParseError(`Unsupported media tag "${node.tag}"`, node.position);
			}
			return undefined;
	}

	if (caption) {
		(block as { caption?: TT.RichBlockCaption }).caption = caption;
	}
	return block;
}

/**
 * Builds a map block.
 *
 * @internal
 */
function parseMapBlock(
	node: HtmlElementNode,
	caption: TT.RichBlockCaption | undefined,
	weak: boolean,
): Block | undefined {
	const latitude = numberAttr(node, 'lat');
	const longitude = numberAttr(node, 'long');
	if (latitude === undefined || longitude === undefined) {
		if (!weak) {
			throw new ParseError('Tag "tg-map" must have lat and long', node.position);
		}
		return undefined;
	}
	const block: TT.InputRichBlockMap = {
		type: 'map',
		location: { latitude, longitude },
		zoom: numberAttr(node, 'zoom') ?? 13,
		width: numberAttr(node, 'width') ?? DEFAULT_MAP_WIDTH,
		height: numberAttr(node, 'height') ?? DEFAULT_MAP_HEIGHT,
	};
	if (caption) {
		block.caption = caption;
	}
	return block;
}

/**
 * Builds the items of a `<ul>` or `<ol>`.
 *
 * @internal
 */
function parseListItems(
	list: HtmlElementNode,
	ctx: Context,
): TT.InputRichBlockListItem<never>[] {
	const ordered = list.tag === 'ol';
	const listType = attr(list, 'type') as TT.InputRichBlockListItem<never>['type'];
	const start = numberAttr(list, 'start');
	const reversed = list.attrs.reversed !== undefined;
	const entries = list.children.filter(isElement).filter((child) => child.tag === 'li');

	let counter = start ?? (reversed ? entries.length : 1);

	return entries.map((item) => {
		const children = [...item.children];
		let hasCheckbox = false;
		let isChecked = false;

		const checkbox = children
			.filter(isElement)
			.find((child) => child.tag === 'input' && child.attrs.type === 'checkbox');
		if (checkbox) {
			hasCheckbox = true;
			isChecked = checkbox.attrs.checked !== undefined;
			children.splice(children.indexOf(checkbox), 1);
		}

		const result: TT.InputRichBlockListItem<never> = {
			blocks: parseBlocks(children, ctx, true),
		};
		if (hasCheckbox) {
			result.has_checkbox = true;
			if (isChecked) {
				result.is_checked = true;
			}
		}
		if (ordered) {
			const explicitValue = numberAttr(item, 'value');
			if (explicitValue !== undefined) {
				counter = explicitValue;
			}
			result.value = counter;
			counter += reversed ? -1 : 1;
			result.type = (attr(item, 'type') ?? listType ?? '1') as typeof result.type;
		} else {
			const itemType = attr(item, 'type');
			if (itemType !== undefined) {
				result.type = itemType as typeof result.type;
			}
		}
		return result;
	});
}

/**
 * Builds a table block.
 *
 * @internal
 */
function parseTableBlock(node: HtmlElementNode, ctx: Context): Block {
	const caption = findChild(node, 'caption');
	const rows = node.children
		.filter(isElement)
		.flatMap((child) =>
			child.tag === 'tr'
				? [child]
				: child.tag === 'thead' || child.tag === 'tbody' || child.tag === 'tfoot'
					? child.children.filter(isElement).filter((row) => row.tag === 'tr')
					: [],
		);

	const cells = rows.map((row) =>
		row.children
			.filter(isElement)
			.filter((cell) => cell.tag === 'td' || cell.tag === 'th')
			.map((cell) => {
				const result: TT.RichBlockTableCell = {
					align: (attr(cell, 'align') ?? 'left') as TT.RichBlockTableCell['align'],
					valign: (attr(cell, 'valign') ?? 'top') as TT.RichBlockTableCell['valign'],
				};
				const text = trimNodes(parseInline(cell.children, ctx));
				if (text.length > 0) {
					result.text = collapse(text);
				}
				if (cell.tag === 'th') {
					result.is_header = true;
				}
				const colspan = numberAttr(cell, 'colspan');
				if (colspan !== undefined && colspan > 1) {
					result.colspan = colspan;
				}
				const rowspan = numberAttr(cell, 'rowspan');
				if (rowspan !== undefined && rowspan > 1) {
					result.rowspan = rowspan;
				}
				return result;
			}),
	);

	const block: TT.InputRichBlockTable = { type: 'table', cells };
	if (node.attrs.bordered !== undefined) {
		block.is_bordered = true;
	}
	if (node.attrs.striped !== undefined) {
		block.is_striped = true;
	}
	if (node.attrs.compact !== undefined) {
		block.is_compact = true;
	}
	if (caption) {
		block.caption = collapse(trimNodes(parseInline(caption.children, ctx)));
	}
	return block;
}

/**
 * Converts HTML nodes into rich message blocks, wrapping loose inline content in
 * paragraphs.
 *
 * @internal
 */
function parseBlocks(nodes: HtmlNode[], ctx: Context, inList = false): Block[] {
	const blocks: Block[] = [];
	let pending: TT.RichText[] = [];

	/** Appends inline content, merging a leading text run with the pending one. */
	const pushPending = (nodes: TT.RichText[]): void => {
		for (const node of nodes) {
			const last = pending[pending.length - 1];
			if (typeof node === 'string' && typeof last === 'string') {
				pending[pending.length - 1] = last + node;
			} else {
				pending.push(node);
			}
		}
	};

	const flush = (): void => {
		const trimmed = trimNodes(pending);
		pending = [];
		if (trimmed.length === 0) {
			return;
		}
		blocks.push({ type: 'paragraph', text: collapse(trimmed) });
	};

	for (const node of nodes) {
		if (!isElement(node)) {
			if (pending.length === 0 && isBlank(node)) {
				continue;
			}
			pushPending(parseInline([node], ctx));
			continue;
		}

		const handled = runHandler(node, ctx, 'block');
		if (handled !== false) {
			if (handled === undefined || handled === null) {
				flush();
				continue;
			}
			if (handled.blocks !== undefined) {
				flush();
				blocks.push(...handled.blocks);
				continue;
			}
			const replacement = handled.text;
			pushPending(Array.isArray(replacement) ? replacement : [replacement]);
			continue;
		}

		// A lone <a name="…"></a> is a block-level anchor.
		if (
			node.tag === 'a' &&
			node.attrs.href === undefined &&
			node.attrs.name !== undefined &&
			textContent(node.children).trim() === ''
		) {
			flush();
			blocks.push({ type: 'anchor', name: node.attrs.name });
			continue;
		}

		if (!BLOCK_TAGS.has(node.tag)) {
			if (ctx.weak && !INLINE_TAGS.has(node.tag)) {
				// An unknown tag at block level is unwrapped, so the blocks inside survive.
				flush();
				blocks.push(...parseBlocks(node.children, ctx, inList));
				continue;
			}
			pushPending(parseInline([node], ctx));
			continue;
		}

		flush();

		switch (node.tag) {
			case 'h1':
			case 'h2':
			case 'h3':
			case 'h4':
			case 'h5':
			case 'h6':
				blocks.push({
					type: 'heading',
					text: collapse(trimNodes(parseInline(node.children, ctx))),
					size: Number(node.tag[1]) as TT.InputRichBlockSectionHeading['size'],
				});
				break;
			case 'p':
				blocks.push(...parseBlocks(node.children, ctx, inList));
				break;
			case 'pre': {
				const code = findChild(node, 'code');
				const source = code ?? node;
				const block: TT.InputRichBlockPreformatted = {
					type: 'pre',
					text: textContent(source.children),
				};
				const className = code?.attrs.class ?? '';
				if (className.startsWith('language-')) {
					block.language = className.slice('language-'.length);
				}
				blocks.push(block);
				break;
			}
			case 'footer':
				blocks.push({
					type: 'footer',
					text: collapse(trimNodes(parseInline(node.children, ctx))),
				});
				break;
			case 'hr':
				blocks.push({ type: 'divider' });
				break;
			case 'ul':
			case 'ol':
				blocks.push({ type: 'list', items: parseListItems(node, ctx) });
				break;
			case 'blockquote': {
				const cite = findChild(node, 'cite');
				const body = node.children.filter((child) => child !== cite);
				const credit = cite
					? collapse(trimNodes(parseInline(cite.children, ctx)))
					: undefined;
				if (node.attrs.expandable !== undefined) {
					const block: TT.InputRichBlockExpandableBlockQuotation = {
						type: 'expandable_blockquote',
						text: collapse(trimNodes(parseInline(body, ctx))),
					};
					if (credit !== undefined) {
						block.credit = credit;
					}
					blocks.push(block);
				} else {
					const block: TT.InputRichBlockBlockQuotation<never> = {
						type: 'blockquote',
						blocks: parseBlocks(body, ctx, inList),
					};
					if (credit !== undefined) {
						block.credit = credit;
					}
					blocks.push(block);
				}
				break;
			}
			case 'aside': {
				const cite = findChild(node, 'cite');
				const body = node.children.filter((child) => child !== cite);
				const block: TT.InputRichBlockPullQuotation = {
					type: 'pullquote',
					text: collapse(trimNodes(parseInline(body, ctx))),
				};
				if (cite) {
					block.credit = collapse(trimNodes(parseInline(cite.children, ctx)));
				}
				blocks.push(block);
				break;
			}
			case 'figure': {
				const caption = parseCaption(findChild(node, 'figcaption'), ctx);
				const media = node.children
					.filter(isElement)
					.find((child) => child.tag !== 'figcaption');
				if (!media) {
					if (!ctx.weak) {
						throw new ParseError(
							'Tag "figure" must contain a media block',
							node.position,
						);
					}
					break;
				}
				const block =
					media.tag === 'tg-map'
						? parseMapBlock(media, caption, ctx.weak)
						: parseMediaBlock(media, caption, ctx.weak);
				if (block) {
					blocks.push(block);
				}
				break;
			}
			case 'img':
			case 'video':
			case 'audio':
			case 'tg-document': {
				const block = parseMediaBlock(node, undefined, ctx.weak);
				if (block) {
					blocks.push(block);
				}
				break;
			}
			case 'tg-map': {
				const block = parseMapBlock(node, undefined, ctx.weak);
				if (block) {
					blocks.push(block);
				}
				break;
			}
			case 'tg-collage':
			case 'tg-slideshow': {
				const caption = parseCaption(findChild(node, 'figcaption'), ctx);
				const inner = node.children.filter(
					(child) => !isElement(child) || child.tag !== 'figcaption',
				);
				const block: TT.InputRichBlockCollage<never> | TT.InputRichBlockSlideshow<never> =
					{
						type: node.tag === 'tg-collage' ? 'collage' : 'slideshow',
						blocks: parseBlocks(inner, ctx, inList),
					};
				if (caption) {
					block.caption = caption;
				}
				blocks.push(block);
				break;
			}
			case 'table':
				blocks.push(parseTableBlock(node, ctx));
				break;
			case 'details': {
				const summary = findChild(node, 'summary');
				const body = node.children.filter((child) => child !== summary);
				const block: TT.InputRichBlockDetails<never> = {
					type: 'details',
					summary: summary ? collapse(trimNodes(parseInline(summary.children, ctx))) : '',
					blocks: parseBlocks(body, ctx, inList),
				};
				if (node.attrs.open !== undefined) {
					block.is_open = true;
				}
				blocks.push(block);
				break;
			}
			case 'tg-math-block':
				blocks.push({
					type: 'mathematical_expression',
					expression: textContent(node.children),
				});
				break;
			case 'tg-button-row': {
				const block: TT.InputRichBlockButtons = {
					type: 'buttons',
					buttons: node.children
						.filter(isElement)
						.filter((child) => child.tag === 'tg-button')
						.map((child) => parseButton(child, ctx))
						.filter((button): button is TT.RichMessageButton => button !== undefined),
				};
				const align = node.attrs.align;
				if (align === 'left' || align === 'center' || align === 'right') {
					block.align = align;
				}
				blocks.push(block);
				break;
			}
			default:
				if (!ctx.weak) {
					throw new ParseError(`Unsupported tag "${node.tag}"`, node.position);
				}
				blocks.push(...parseBlocks(node.children, ctx, inList));
				break;
		}
	}

	flush();
	return blocks;
}

/**
 * Parses rich message HTML into the blocks of an `InputRichMessage`.
 *
 * The accepted tag set is the one the Bot API documents for the `html` field of
 * `InputRichMessage`. Loose inline content between blocks is wrapped in a paragraph, the
 * same way the clients render it.
 *
 * Telegram parses the `html` field server-side, so this exists for the cases where the
 * blocks themselves are needed locally — to inspect, edit or re-assemble a message
 * before sending it as `blocks`.
 *
 * Pass `weak` to keep what can be represented and drop the rest, or `on` to rewrite the
 * tags the Bot API has no block for.
 *
 * @param html - The rich message HTML.
 * @param options - Message-level options, weak mode and element handlers; see
 *   {@link ParseRichOptions}.
 * @returns An `InputRichMessage` carrying the parsed blocks.
 * @throws {ParseError} If the markup is malformed or uses an unsupported tag and `weak`
 *   is not set.
 *
 * @example
 * ```typescript
 * import { parseRichHtml } from "@sunafterrainwm/telegram-entities-builder";
 *
 * parseRichHtml('<h1>Title</h1><p>Body with <b>bold</b>.</p>');
 * // { blocks: [ { type: "heading", text: "Title", size: 1 }, { type: "paragraph", … } ] }
 *
 * parseRichHtml('<div><p>kept</p></div>', { weak: true });
 * // { blocks: [ { type: "paragraph", text: "kept" } ] }
 * ```
 *
 * @category Parsing
 * @useWhen - You hold rich HTML and need the structured blocks, for example to edit or merge them.
 * @avoidWhen - You can send the HTML as `rich_message.html` and let Telegram parse it.
 * @never - NEVER assume byte-for-byte agreement with the server parser; `agents/rich-parsers.md` lists the known gaps.
 */
export function parseRichHtml(
	html: string,
	options?: ParseRichOptions,
): TT.InputRichMessage<never> {
	const { transform, is_rtl, skip_entity_detection } = resolveRichOptions(options);
	const nodes = parseHtmlTree(html, transform.weak);
	const ctx = createContext(nodes, transform);

	const message: TT.InputRichMessage<never> = { blocks: parseBlocks(nodes, ctx) };
	if (is_rtl !== undefined) {
		message.is_rtl = is_rtl;
	}
	if (skip_entity_detection !== undefined) {
		message.skip_entity_detection = skip_entity_detection;
	}
	return message;
}

/**
 * Parses an inline fragment of rich message HTML into rich text.
 *
 * @param html - The fragment to parse.
 * @param options - Weak mode and element handlers; see {@link ParseRichOptions}.
 * @returns The equivalent `RichText`.
 * @throws {ParseError} If the markup is malformed or uses a block-level tag and `weak`
 *   is not set.
 *
 * @example
 * ```typescript
 * import { parseRichText } from "@sunafterrainwm/telegram-entities-builder";
 *
 * parseRichText('a <b>bold</b> word');
 * // ["a ", { type: "bold", text: "bold" }, " word"]
 * ```
 *
 * @category Parsing
 */
export function parseRichText(html: string, options?: ParseRichOptions): TT.RichText {
	const { transform } = resolveRichOptions(options);
	const nodes = parseHtmlTree(html, transform.weak);
	const ctx = createContext(nodes, transform);
	return collapse(trimNodes(parseInline(nodes, ctx)));
}
