import type * as TT from '@grammyjs/types';

import type { AnyDraftEntity } from '../message.ts';

import {
	ParseError,
	at,
	checkLink,
	decodeHtmlReference,
	getLinkCustomEmojiId,
	getLinkFormattedDate,
	getLinkUserId,
	isAlnum,
	isSpace,
	mentionedUser,
	normalizeDateTimeFormat,
	sortEntities,
} from './internal.ts';
import {
	type HtmlTagMatch,
	HtmlTransform,
	type HtmlTransformOptions,
} from './transform.ts';

export { ParseError } from './internal.ts';

/**
 * A plain message text together with the entities that apply to it, ready to be spread
 * into `sendMessage` or handed to `EntityBuilder.addTextSegmentList`.
 *
 * @category Parsing
 */
export interface ParsedText {
	/** The text with all markup removed. */
	text: string;
	/** The entities, ordered by offset and then by descending length. */
	entities: TT.MessageEntity[];
}

/**
 * An entity under construction, before `code`/`pre` are reconciled.
 *
 * tdlib keeps a single generic `argument` field per entity; the fields here stand in for
 * it, and `language` on a `code` entity marks the "might still become a `pre`" state.
 *
 * @internal
 */
interface DraftEntity {
	type: string;
	offset: number;
	length: number;
	url?: string;
	user?: TT.User;
	custom_emoji_id?: string;
	language?: string;
	unix_time?: number;
	date_time_format?: TT.RichTextDateTime['date_time_format'];
}

/**
 * Drops the leftover language of `code` entities that never became `pre`, and strips
 * absent fields.
 *
 * @internal
 */
function finishEntities(entities: DraftEntity[]): TT.MessageEntity[] {
	for (const entity of entities) {
		if (entity.type === 'code') {
			delete entity.language;
		}
	}

	return sortEntities(entities).map((entity) => {
		const result: Record<string, unknown> = {
			type: entity.type,
			offset: entity.offset,
			length: entity.length,
		};
		for (const key of [
			'url',
			'user',
			'custom_emoji_id',
			'language',
			'unix_time',
			'date_time_format',
		] as const) {
			if (entity[key] !== undefined) {
				result[key] = entity[key];
			}
		}
		return result as unknown as TT.MessageEntity;
	});
}

/**
 * The tags the classic HTML parse mode understands.
 *
 * @internal
 */
const HTML_TAGS = new Set([
	'a',
	'b',
	'strong',
	'i',
	'em',
	's',
	'strike',
	'del',
	'u',
	'ins',
	'tg-spoiler',
	'tg-emoji',
	'tg-time',
	'span',
	'pre',
	'code',
	'blockquote',
]);

/**
 * How a handler rewrites an element the classic HTML parse mode has no entity for.
 *
 * `before` and `after` are plain text placed outside `entities`, which cover only what
 * the element's own children contributed. That way ``{ entities: [{ type: 'bold' }],
 * after: '\n\n' }`` makes a heading bold without the blank line joining the entity.
 *
 * @category Parsing
 */
export interface HtmlTagRewrite {
	/** Text inserted where the start tag was. */
	before?: string;
	/** Text inserted where the end tag was. */
	after?: string;
	/** Entities applied to the element's children. */
	entities?: AnyDraftEntity[];
	/** Pass `true` to drop the element and everything inside it. */
	drop?: boolean;
	/**
	 * Pass `true` if the element carries no content and has no end tag, the way `<br>`
	 * and `<input>` do. A tag written `<x/>` is detected on its own.
	 */
	selfClosing?: boolean;
}

/**
 * The element an {@link EntityTagHandler} is called with.
 *
 * The classic parser is a single-pass scanner, so a handler cannot look at the content
 * ahead of it; `parent` and `index` are what it gets instead, and they are enough to
 * number the items of an ordered list or to tell `<li>` in a `<ul>` from one in an
 * `<ol>`.
 *
 * @category Parsing
 */
export interface EntityTagElement extends HtmlTagMatch {
	/** The element this one is nested in, absent at the top level. */
	parent?: HtmlTagMatch;
	/** How many element siblings precede this one inside the same parent. */
	index: number;
}

/**
 * A handler that rewrites one element for {@link parseHtml}.
 *
 * It runs on the start tag, so it sees the tag name, the attributes and its place among
 * its siblings, but not yet the content; what it returns is applied around the children.
 * Returning nothing leaves the element transparent: the children are kept and the tag
 * itself contributes nothing.
 *
 * @category Parsing
 */
export type EntityTagHandler = (
	element: EntityTagElement,
	// `void` is what lets a handler body simply end without returning, which is the
	// usual shape of an event-handler-like callback.
	// eslint-disable-next-line @typescript-eslint/no-invalid-void-type
) => HtmlTagRewrite | void;

/**
 * A reusable {@link parseHtml} configuration.
 *
 * @example
 * ```typescript
 * import { EntityTransform, parseHtml } from "@sunafterrainwm/telegram-entities-builder";
 *
 * const webPage = new EntityTransform({
 * 	weak: true,
 * 	on: {
 * 		'p, div': () => ({ after: '\n\n' }),
 * 		'h1, h2, h3': () => ({ entities: [{ type: 'bold' }], after: '\n\n' }),
 * 		'script, style': () => ({ drop: true }),
 * 		'br': () => ({ before: '\n', selfClosing: true }),
 * 		// An ordered list numbers itself out of `parent` and `index`; `<li value="…">`
 * 		// and `<ol start="…">` are honoured the way a browser would.
 * 		'li': ({ attrs, index, parent }) => {
 * 			if (parent?.tag !== 'ol') {
 * 				return { before: '• ', after: '\n' };
 * 			}
 * 			const start = Number(parent.attrs.start ?? '1');
 * 			const value = attrs.value === undefined ? start + index : Number(attrs.value);
 * 			return { before: `${value}. `, after: '\n' };
 * 		},
 * 	},
 * });
 *
 * parseHtml('<ol><li>one</li><li>two</li></ol>', webPage);
 * // { text: "1. one\n2. two\n", entities: [] }
 * ```
 *
 * @category Parsing
 */
export class EntityTransform extends HtmlTransform<EntityTagHandler> {
	/**
	 * @param options - The options to compile.
	 */
	public constructor(options: HtmlTransformOptions<EntityTagHandler> = {}) {
		super(options);
	}
}

/**
 * The options {@link parseHtml} accepts, either inline or as a reusable
 * {@link EntityTransform}.
 *
 * @category Parsing
 */
export type ParseHtmlOptions = HtmlTransformOptions<EntityTagHandler> | EntityTransform;

/**
 * One open tag of the classic HTML parser.
 *
 * `rewrite` is `undefined` for a tag the parser handles itself, an object for one a
 * handler rewrote, and `null` for one weak mode is keeping the text of but ignoring.
 *
 * @internal
 */
interface OpenTag {
	tagName: string;
	argument: string;
	date: number;
	offset: number;
	rewrite?: HtmlTagRewrite | null;
	/** What a handler matches on, kept so children can be told their parent. */
	match: HtmlTagMatch;
	/** How many element children have been opened inside this one so far. */
	childElements: number;
}

/**
 * Advances to the `>` that ends a tag, skipping over quoted attribute values.
 *
 * @returns The index of the `>`, or the input length when there is none.
 * @internal
 */
function skipTag(html: string, from: number): number {
	let quote = '';
	for (let i = from; i < html.length; i++) {
		const c = html[i];
		if (quote !== '') {
			if (c === quote) {
				quote = '';
			}
			continue;
		}
		if (c === '"' || c === "'") {
			quote = c;
			continue;
		}
		if (c === '>') {
			return i;
		}
	}
	return html.length;
}

/**
 * Advances past the end tag matching an element that has just been opened, so that the
 * element and its content can be dropped.
 *
 * @returns The index of the matching `>`, or the input length when there is none.
 * @internal
 */
function skipElement(html: string, from: number, tagName: string): number {
	let depth = 1;
	let i = from;

	while (i < html.length) {
		const open = html.indexOf('<', i);
		if (open === -1) {
			return html.length;
		}
		let cursor = open + 1;
		const closing = at(html, cursor) === '/';
		if (closing) {
			cursor++;
		}
		const nameBegin = cursor;
		while (
			!isSpace(at(html, cursor)) &&
			at(html, cursor) !== '>' &&
			at(html, cursor) !== '/'
		) {
			cursor++;
		}
		const name = html.slice(nameBegin, cursor).toLowerCase();
		if (name.length === 0) {
			// A bare `<` in the content, as in `a < b`; not a tag at all.
			i = open + 1;
			continue;
		}
		const end = skipTag(html, cursor);

		if (name === tagName) {
			if (closing) {
				depth--;
				if (depth === 0) {
					return end;
				}
			} else if (at(html, end - 1) !== '/') {
				depth++;
			}
		}
		i = end + 1;
	}

	return html.length;
}

/**
 * Parses text formatted with `parse_mode: "HTML"` into text plus entities.
 *
 * This is a port of tdlib's `parse_html`, so by default it accepts exactly the tag set
 * the Bot API documents and rejects the same inputs — unsupported or unbalanced tags
 * raise a {@link ParseError} rather than being silently ignored. Pass `weak` to keep what
 * can be represented and drop the rest, or `on` to rewrite the tags that have no entity.
 *
 * A `tg://user?id=…` link becomes a `text_mention` whose `user` carries only `id`; that
 * is the only field such a link encodes, and the only one the Bot API reads back.
 *
 * @param html - The HTML-formatted text.
 * @param options - Weak mode and element handlers; see {@link ParseHtmlOptions}.
 * @returns The plain text and its entities.
 * @throws {ParseError} If the markup is not valid Telegram HTML and `weak` is not set.
 *
 * @example
 * ```typescript
 * import { parseHtml } from "@sunafterrainwm/telegram-entities-builder";
 *
 * parseHtml('Hello <b>world</b>');
 * // { text: "Hello world", entities: [{ type: "bold", offset: 6, length: 5 }] }
 *
 * parseHtml('<div>kept</div>', { weak: true });
 * // { text: "kept", entities: [] }
 *
 * parseHtml('<ul><li>one</li><li>two</li></ul>', {
 * 	weak: true,
 * 	on: { 'li': () => ({ before: '• ', after: '\n' }) },
 * });
 * // { text: "• one\n• two\n", entities: [] }
 * ```
 *
 * @category Parsing
 * @useWhen - You received or stored HTML and need `entities` instead, for example to slice the text.
 * @avoidWhen - You can hand the HTML to the Bot API directly with `parse_mode: "HTML"`.
 * @never - NEVER feed arbitrary web HTML to the strict parser; use `weak`, and `on` for the tags you care about.
 */
export function parseHtml(html: string, options?: ParseHtmlOptions): ParsedText {
	const transform =
		options instanceof EntityTransform ? options : new EntityTransform(options);
	const weak = transform.weak;
	const useHandlers = transform.hasHandlers;

	let text = '';
	let rootElements = 0;
	const entities: DraftEntity[] = [];
	const nested: OpenTag[] = [];

	/** Builds the entity of one element that has just ended, and emits its `after`. */
	const close = (open: OpenTag, position: number): void => {
		const offset = open.offset;
		const length = text.length - offset;

		if (open.rewrite === null) {
			// Weak mode keeps the text of an element it cannot represent.
			return;
		}

		if (open.rewrite !== undefined) {
			if (length > 0) {
				for (const entity of open.rewrite.entities ?? []) {
					entities.push({ ...entity, offset, length } as DraftEntity);
				}
			}
			if (open.rewrite.after !== undefined) {
				text += open.rewrite.after;
			}
			return;
		}

		if (length === 0) {
			return;
		}

		const last = entities.length > 0 ? entities[entities.length - 1] : undefined;
		const { tagName } = open;

		switch (tagName) {
			case 'i':
			case 'em':
				entities.push({ type: 'italic', offset, length });
				break;
			case 'b':
			case 'strong':
				entities.push({ type: 'bold', offset, length });
				break;
			case 's':
			case 'strike':
			case 'del':
				entities.push({ type: 'strikethrough', offset, length });
				break;
			case 'u':
			case 'ins':
				entities.push({ type: 'underline', offset, length });
				break;
			case 'tg-spoiler':
			case 'span':
				entities.push({ type: 'spoiler', offset, length });
				break;
			case 'tg-emoji': {
				if (!/^\d+$/.test(open.argument) || /^0+$/.test(open.argument)) {
					if (!weak) {
						throw new ParseError('Invalid custom emoji identifier specified', position);
					}
					break;
				}
				entities.push({
					type: 'custom_emoji',
					offset,
					length,
					custom_emoji_id: open.argument,
				});
				break;
			}
			case 'tg-time': {
				const format = normalizeDateTimeFormat(open.argument);
				if (format === undefined) {
					if (!weak) {
						throw new ParseError('Invalid date format used', position);
					}
					break;
				}
				if (open.date > 0) {
					entities.push({
						type: 'date_time',
						offset,
						length,
						unix_time: open.date,
						date_time_format: format,
					});
				}
				break;
			}
			case 'a': {
				const url = open.argument.length > 0 ? open.argument : text.slice(offset);
				const userId = getLinkUserId(url);
				if (userId !== undefined) {
					entities.push({
						type: 'text_mention',
						offset,
						length,
						user: mentionedUser(userId),
					});
				} else {
					const checked = checkLink(url);
					if (checked.length > 0) {
						entities.push({ type: 'text_link', offset, length, url: checked });
					}
				}
				break;
			}
			case 'pre': {
				if (
					last &&
					last.type === 'code' &&
					last.offset === offset &&
					last.length === length &&
					last.language !== undefined &&
					last.language.length > 0
				) {
					last.type = 'pre';
				} else {
					entities.push({ type: 'pre', offset, length });
				}
				break;
			}
			case 'code': {
				if (
					last &&
					last.type === 'pre' &&
					last.offset === offset &&
					last.length === length &&
					open.argument.length > 0
				) {
					last.language = open.argument;
				} else {
					entities.push({
						type: 'code',
						offset,
						length,
						language: open.argument.length > 0 ? open.argument : undefined,
					});
				}
				break;
			}
			case 'blockquote':
				entities.push({
					type: open.argument.length > 0 ? 'expandable_blockquote' : 'blockquote',
					offset,
					length,
				});
				break;
			default:
				break;
		}
	};

	for (let i = 0; i < html.length; i++) {
		const c = html[i];

		if (c === '&') {
			const decoded = decodeHtmlReference(html, i, false);
			if (decoded) {
				text += decoded.text;
				i = decoded.next - 1;
				continue;
			}
		}

		if (c !== '<') {
			text += c;
			continue;
		}

		const beginPos = i;
		i++;

		if (at(html, i) !== '/') {
			// Beginning of a tag.
			while (!isSpace(at(html, i)) && at(html, i) !== '>') {
				i++;
			}
			if (at(html, i) === '\0') {
				if (!weak) {
					throw new ParseError('Unclosed start tag', beginPos);
				}
				break;
			}

			// tdlib stops the name at a space or `>`, so `<x/>` would be read as the tag
			// `x/`. The slash is split off instead, because handlers need void elements.
			let tagName = html.slice(beginPos + 1, i).toLowerCase();
			let selfClosing = false;
			if (tagName.endsWith('/')) {
				tagName = tagName.slice(0, -1);
				selfClosing = true;
			}

			const known = HTML_TAGS.has(tagName);
			if (!known && !weak && !useHandlers) {
				throw new ParseError(`Unsupported start tag "${tagName}"`, beginPos);
			}

			let argument = '';
			let date = 0;
			let malformed = false;
			const attrs: Record<string, string | undefined> = {};

			while (at(html, i) !== '>') {
				while (isSpace(at(html, i)) && at(html, i) !== '\0') {
					i++;
				}
				if (at(html, i) === '>') {
					break;
				}
				if (at(html, i) === '/' && at(html, i + 1) === '>') {
					// tdlib rejects `<x/>`, but a handler needs to see void elements.
					selfClosing = true;
					i++;
					continue;
				}

				const attributeBegin = i;
				while (
					!isSpace(at(html, i)) &&
					at(html, i) !== '=' &&
					at(html, i) !== '>' &&
					at(html, i) !== '/' &&
					at(html, i) !== '"' &&
					at(html, i) !== "'"
				) {
					i++;
				}
				const attributeName = html.slice(attributeBegin, i);
				if (attributeName.length === 0) {
					if (!weak) {
						throw new ParseError(
							`Empty attribute name in the tag "${tagName}"`,
							beginPos,
						);
					}
					malformed = true;
					break;
				}

				while (isSpace(at(html, i)) && at(html, i) !== '\0') {
					i++;
				}

				if (at(html, i) !== '=') {
					if (at(html, i) === '\0') {
						if (!weak) {
							throw new ParseError(`Unclosed start tag "${tagName}"`, beginPos);
						}
						malformed = true;
						break;
					}
					// A valueless attribute; only blockquote has a meaningful one.
					attrs[attributeName.toLowerCase()] = '';
					if (tagName === 'blockquote' && attributeName === 'expandable') {
						argument = '1';
					}
					continue;
				}

				i++;
				while (isSpace(at(html, i)) && at(html, i) !== '\0') {
					i++;
				}
				if (at(html, i) === '\0') {
					if (!weak) {
						throw new ParseError(`Unclosed start tag "${tagName}"`, beginPos);
					}
					malformed = true;
					break;
				}

				let attributeValue = '';
				if (at(html, i) !== "'" && at(html, i) !== '"') {
					// A name token: letters, digits, periods and hyphens, case-insensitive.
					const tokenBegin = i;
					while (isAlnum(at(html, i)) || at(html, i) === '.' || at(html, i) === '-') {
						i++;
					}
					attributeValue = html.slice(tokenBegin, i).toLowerCase();
					if (!isSpace(at(html, i)) && at(html, i) !== '>') {
						if (!weak) {
							throw new ParseError('Unexpected end of name token', tokenBegin);
						}
						malformed = true;
						break;
					}
				} else {
					// A string literal, in which character references are decoded.
					const endCharacter = at(html, i);
					i++;
					while (at(html, i) !== endCharacter && at(html, i) !== '\0') {
						if (at(html, i) === '&') {
							const decoded = decodeHtmlReference(html, i, false);
							if (decoded) {
								attributeValue += decoded.text;
								i = decoded.next;
								continue;
							}
						}
						attributeValue += html[i];
						i++;
					}
					if (at(html, i) === endCharacter) {
						i++;
					}
				}

				if (at(html, i) === '\0') {
					if (!weak) {
						throw new ParseError('Unclosed start tag', beginPos);
					}
					malformed = true;
					break;
				}

				attrs[attributeName.toLowerCase()] = attributeValue;

				if (tagName === 'a' && attributeName === 'href') {
					argument = attributeValue;
				} else if (
					tagName === 'code' &&
					attributeName === 'class' &&
					attributeValue.startsWith('language-')
				) {
					argument = attributeValue.slice('language-'.length);
				} else if (
					tagName === 'span' &&
					attributeName === 'class' &&
					attributeValue.startsWith('tg-')
				) {
					argument = attributeValue.slice('tg-'.length);
				} else if (tagName === 'tg-emoji' && attributeName === 'emoji-id') {
					argument = attributeValue;
				} else if (tagName === 'blockquote' && attributeName === 'expandable') {
					argument = '1';
				} else if (tagName === 'tg-time' && attributeName === 'unix') {
					date = Number.parseInt(attributeValue, 10) || 0;
				} else if (tagName === 'tg-time' && attributeName === 'format') {
					argument = attributeValue;
				}
			}

			if (malformed) {
				i = skipTag(html, i);
				continue;
			}

			// Every element counts as a sibling, whether or not it keeps its markup, so
			// that `index` is stable for the ones a handler cares about.
			const enclosing = nested[nested.length - 1];
			const index = enclosing ? enclosing.childElements++ : rootElements++;
			const match: HtmlTagMatch = { tag: tagName, attrs };
			const open = {
				tagName,
				argument,
				date,
				offset: text.length,
				match,
				childElements: 0,
			};

			const handler = useHandlers ? transform.handlerFor(match) : undefined;
			if (handler) {
				const rewrite = handler({ ...match, parent: enclosing?.match, index }) ?? {};
				if (rewrite.drop) {
					i = skipElement(html, i + 1, tagName);
					continue;
				}
				if (rewrite.before !== undefined) {
					text += rewrite.before;
				}
				if (rewrite.selfClosing ?? selfClosing) {
					if (rewrite.after !== undefined) {
						text += rewrite.after;
					}
					continue;
				}
				nested.push({ ...open, offset: text.length, rewrite });
				continue;
			}

			if (!known) {
				if (!weak) {
					throw new ParseError(`Unsupported start tag "${tagName}"`, beginPos);
				}
				nested.push({ ...open, rewrite: null });
				continue;
			}

			if (tagName === 'span' && argument !== 'spoiler') {
				if (!weak) {
					throw new ParseError('Tag "span" must have class "tg-spoiler"', beginPos);
				}
				nested.push({ ...open, rewrite: null });
				continue;
			}

			if (selfClosing) {
				// None of the built-in tags is void, so an empty element adds nothing.
				continue;
			}

			nested.push(open);
			continue;
		}

		// End of a tag.
		if (nested.length === 0) {
			if (!weak) {
				throw new ParseError('Unexpected end tag', beginPos);
			}
			i = skipTag(html, i);
			continue;
		}

		while (!isSpace(at(html, i)) && at(html, i) !== '>') {
			i++;
		}
		const endTagName = html.slice(beginPos + 2, i).toLowerCase();
		while (isSpace(at(html, i)) && at(html, i) !== '\0') {
			i++;
		}
		if (at(html, i) !== '>') {
			if (!weak) {
				throw new ParseError('Unclosed end tag', beginPos);
			}
			break;
		}

		const top = nested[nested.length - 1];
		if (endTagName.length > 0 && endTagName !== top.tagName) {
			if (!weak) {
				throw new ParseError(
					`Unmatched end tag, expected "</${top.tagName}>", found "</${endTagName}>"`,
					beginPos,
				);
			}
			// Close everything down to the element the end tag names, or ignore it.
			const depth = nested.findLastIndex((tag) => tag.tagName === endTagName);
			if (depth === -1) {
				continue;
			}
			while (nested.length > depth) {
				const tag = nested.pop();
				if (tag) {
					close(tag, beginPos);
				}
			}
			continue;
		}

		close(top, beginPos);
		nested.pop();
	}

	if (nested.length > 0) {
		if (!weak) {
			throw new ParseError(
				`Can't find end tag corresponding to start tag "${nested[nested.length - 1].tagName}"`,
			);
		}
		while (nested.length > 0) {
			const tag = nested.pop();
			if (tag) {
				close(tag, html.length);
			}
		}
	}

	return { text, entities: finishEntities(entities) };
}

/**
 * The MarkdownV2 entity kinds, named after the Bot API entity they produce.
 *
 * @internal
 */
type MarkdownType =
	| 'bold'
	| 'italic'
	| 'underline'
	| 'strikethrough'
	| 'spoiler'
	| 'code'
	| 'pre'
	| 'text_link'
	| 'custom_emoji'
	| 'blockquote'
	| 'expandable_blockquote'
	| 'date_time';

/**
 * One open construct of the MarkdownV2 parser.
 *
 * @internal
 */
interface OpenMarkdown {
	type: MarkdownType;
	argument: string;
	offset: number;
	sourceOffset: number;
	beginPos: number;
}

/**
 * Parses text formatted with `parse_mode: "MarkdownV2"` into text plus entities.
 *
 * This is a port of tdlib's `parse_markdown_v2`: every character of `` _*[]()~`>#+-=|{}.! ``
 * is reserved and must be escaped with a backslash outside of an entity, and an
 * unterminated construct raises a {@link ParseError}.
 *
 * @param markdown - The MarkdownV2-formatted text.
 * @returns The plain text and its entities.
 * @throws {ParseError} If the markup is not valid MarkdownV2.
 *
 * @example
 * ```typescript
 * import { parseMarkdownV2 } from "@sunafterrainwm/telegram-entities-builder";
 *
 * parseMarkdownV2('Hello *world*');
 * // { text: "Hello world", entities: [{ type: "bold", offset: 6, length: 5 }] }
 * ```
 *
 * @category Parsing
 * @useWhen - You have MarkdownV2 input and need `entities` to manipulate or re-wrap it.
 * @avoidWhen - You can hand the text to the Bot API directly with `parse_mode: "MarkdownV2"`.
 * @never - NEVER expect CommonMark behaviour; this is Telegram's own dialect.
 */
export function parseMarkdownV2(markdown: string): ParsedText {
	let text = '';
	const entities: DraftEntity[] = [];
	const nested: OpenMarkdown[] = [];

	let haveBlockquote = false;
	let canStartBlockquote = true;

	for (let i = 0; i < markdown.length; i++) {
		const c = markdown[i];

		if (c === '\\') {
			const next = markdown.charCodeAt(i + 1);
			if (next > 0 && next <= 126) {
				i++;
				text += markdown[i];
				if (markdown[i] !== '\r') {
					canStartBlockquote = markdown[i] === '\n';
				}
				continue;
			}
		}

		const top = nested.length > 0 ? nested[nested.length - 1] : undefined;
		const reserved =
			top && (top.type === 'code' || top.type === 'pre') ? '`' : '_*[]()~`>#+-=|{}.!\n';

		if (!reserved.includes(c)) {
			text += c;
			if (c !== '\r') {
				canStartBlockquote = false;
			}
			continue;
		}

		const isEnd = ((): boolean => {
			if (!top) {
				return false;
			}
			if (haveBlockquote && c === '\n' && at(markdown, i + 1) !== '>') {
				return true;
			}
			switch (top.type) {
				case 'bold':
					return c === '*';
				case 'italic':
					return c === '_' && at(markdown, i + 1) !== '_';
				case 'code':
					return c === '`';
				case 'pre':
					return c === '`' && at(markdown, i + 1) === '`' && at(markdown, i + 2) === '`';
				case 'text_link':
				case 'custom_emoji':
					return c === ']';
				case 'underline':
					return c === '_' && at(markdown, i + 1) === '_';
				case 'strikethrough':
					return c === '~';
				case 'spoiler':
					return c === '|' && at(markdown, i + 1) === '|';
				default:
					return false;
			}
		})();

		if (!isEnd) {
			// Beginning of a construct.
			let type: MarkdownType | undefined;
			let argument = '';
			const sourceOffset = i;

			switch (c) {
				case '_':
					if (at(markdown, i + 1) === '_') {
						type = 'underline';
						i++;
					} else {
						type = 'italic';
					}
					break;
				case '*':
					type = 'bold';
					break;
				case '~':
					type = 'strikethrough';
					break;
				case '|':
					if (at(markdown, i + 1) === '|') {
						i++;
						type = 'spoiler';
					} else {
						throw new ParseError(
							`Character '${c}' is reserved and must be escaped with the preceding '\\'`,
							i,
						);
					}
					break;
				case '[':
					type = 'text_link';
					break;
				case '`':
					if (at(markdown, i + 1) === '`' && at(markdown, i + 2) === '`') {
						i += 3;
						type = 'pre';
						let languageEnd = i;
						while (
							!isSpace(at(markdown, languageEnd)) &&
							at(markdown, languageEnd) !== '`'
						) {
							languageEnd++;
						}
						if (
							i !== languageEnd &&
							languageEnd < markdown.length &&
							at(markdown, languageEnd) !== '`'
						) {
							argument = markdown.slice(i, languageEnd);
							i = languageEnd;
						}
						// Skip one line break right after the opening fence.
						if (at(markdown, i) === '\n' || at(markdown, i) === '\r') {
							if (
								(at(markdown, i + 1) === '\n' || at(markdown, i + 1) === '\r') &&
								at(markdown, i) !== at(markdown, i + 1)
							) {
								i += 2;
							} else {
								i++;
							}
						}
						i--;
					} else {
						type = 'code';
					}
					break;
				case '!':
					if (at(markdown, i + 1) === '[') {
						i++;
						type = 'custom_emoji';
					} else {
						throw new ParseError(
							`Character '${c}' is reserved and must be escaped with the preceding '\\'`,
							i,
						);
					}
					break;
				case '\n':
					text += '\n';
					canStartBlockquote = true;
					break;
				case '>':
					if (!canStartBlockquote) {
						throw new ParseError(
							`Character '${c}' is reserved and must be escaped with the preceding '\\'`,
							i,
						);
					}
					if (!haveBlockquote) {
						type = 'blockquote';
						haveBlockquote = true;
					}
					break;
				default:
					throw new ParseError(
						`Character '${c}' is reserved and must be escaped with the preceding '\\'`,
						i,
					);
			}

			if (type === undefined) {
				continue;
			}

			nested.push({
				type,
				argument,
				offset: text.length,
				sourceOffset,
				beginPos: text.length,
			});
			continue;
		}

		// End of a construct.

		let open = nested[nested.length - 1];
		let type: MarkdownType = open.type;

		if (c === '\n' && type !== 'blockquote') {
			// A trailing `||` turns the enclosing block quotation into an expandable one.
			const isSpoilerMarker =
				type === 'spoiler' &&
				(open.sourceOffset === i - 2 ||
					(open.sourceOffset === i - 3 && text.endsWith('\r')));
			if (!isSpoilerMarker) {
				throw new ParseError(`Can't find end of ${type} entity`, open.sourceOffset);
			}
			nested.pop();
			const outer = nested[nested.length - 1];
			if (outer === undefined || outer.type !== 'blockquote') {
				throw new ParseError(`Can't find end of ${outer.type ?? type} entity`, i);
			}
			open = outer;
			type = 'expandable_blockquote';
		}

		let argument = open.argument;
		let user: TT.User | undefined;
		let customEmojiId: string | undefined;
		let dateTime:
			| { unix_time: number; date_time_format: TT.RichTextDateTime['date_time_format'] }
			| undefined;
		let skipEntity = text.length === open.offset;

		switch (type) {
			case 'bold':
			case 'italic':
			case 'code':
			case 'strikethrough':
				break;
			case 'underline':
			case 'spoiler':
				i++;
				break;
			case 'pre':
				i += 2;
				break;
			case 'text_link': {
				let url: string;
				if (at(markdown, i + 1) !== '(') {
					url = text.slice(open.beginPos);
				} else {
					i += 2;
					const urlBegin = i;
					url = '';
					while (i < markdown.length && markdown[i] !== ')') {
						const next = markdown.charCodeAt(i + 1);
						if (markdown[i] === '\\' && next > 0 && next <= 126) {
							url += markdown[i + 1];
							i += 2;
							continue;
						}
						url += markdown[i];
						i++;
					}
					if (at(markdown, i) !== ')') {
						throw new ParseError("Can't find end of a URL", urlBegin);
					}
				}
				const userId = getLinkUserId(url);
				if (userId !== undefined) {
					user = mentionedUser(userId);
				} else {
					const checked = checkLink(url);
					if (checked.length === 0) {
						skipEntity = true;
					} else {
						argument = checked;
					}
				}
				break;
			}
			case 'custom_emoji': {
				if (at(markdown, i + 1) !== '(') {
					throw new ParseError(
						'The entity must contain a tg://emoji or tg://time URL',
						i,
					);
				}
				i += 2;
				const urlBegin = i;
				let url = '';
				while (i < markdown.length && markdown[i] !== ')') {
					const next = markdown.charCodeAt(i + 1);
					if (markdown[i] === '\\' && next > 0 && next <= 126) {
						url += markdown[i + 1];
						i += 2;
						continue;
					}
					url += markdown[i];
					i++;
				}
				if (at(markdown, i) !== ')') {
					throw new ParseError("Can't find end of a URL", urlBegin);
				}
				customEmojiId = getLinkCustomEmojiId(url);
				if (customEmojiId === undefined) {
					dateTime = getLinkFormattedDate(url);
					if (dateTime === undefined) {
						throw new ParseError(
							'Invalid tg://emoji or tg://time URL specified',
							urlBegin,
						);
					}
					type = 'date_time';
				}
				break;
			}
			case 'blockquote':
			case 'expandable_blockquote':
				haveBlockquote = false;
				text += markdown[i];
				canStartBlockquote = true;
				skipEntity = false;
				break;
			default:
				throw new ParseError(`Can't find end of ${type} entity`, open.sourceOffset);
		}

		if (!skipEntity) {
			const offset = open.offset;
			const length = text.length - offset;
			if (user) {
				entities.push({ type: 'text_mention', offset, length, user });
			} else if (customEmojiId !== undefined) {
				entities.push({
					type: 'custom_emoji',
					offset,
					length,
					custom_emoji_id: customEmojiId,
				});
			} else if (dateTime) {
				entities.push({ type: 'date_time', offset, length, ...dateTime });
			} else if (type === 'pre') {
				entities.push({
					type: 'pre',
					offset,
					length,
					language: argument.length > 0 ? argument : undefined,
				});
			} else if (type === 'text_link') {
				entities.push({ type: 'text_link', offset, length, url: argument });
			} else {
				entities.push({ type, offset, length });
			}
		}

		nested.pop();
	}

	if (haveBlockquote) {
		let open = nested[nested.length - 1];
		let type: MarkdownType = 'blockquote';
		if (open.type === 'spoiler' && open.sourceOffset === markdown.length - 2) {
			nested.pop();
			open = nested[nested.length - 1];
			type = 'expandable_blockquote';
		}
		if (open.type === 'blockquote') {
			const length = text.length - open.offset;
			if (length !== 0) {
				entities.push({ type, offset: open.offset, length });
			}
			nested.pop();
		}
	}

	if (nested.length > 0) {
		const open = nested[nested.length - 1];
		throw new ParseError(`Can't find end of ${open.type} entity`, open.sourceOffset);
	}

	return { text, entities: finishEntities(entities) };
}

/**
 * Parses text formatted with the legacy `parse_mode: "Markdown"` into text plus entities.
 *
 * This is a port of tdlib's `parse_markdown`. The mode is kept by Telegram only for
 * backward compatibility: entities cannot nest, and there is no syntax for underline,
 * strikethrough, spoiler, block quotations, custom emoji or formatted dates.
 *
 * @param markdown - The legacy Markdown-formatted text.
 * @returns The plain text and its entities.
 * @throws {ParseError} If a construct is never closed.
 *
 * @example
 * ```typescript
 * import { parseMarkdown } from "@sunafterrainwm/telegram-entities-builder";
 *
 * parseMarkdown('Hello *world*');
 * // { text: "Hello world", entities: [{ type: "bold", offset: 6, length: 5 }] }
 * ```
 *
 * @category Parsing
 * @useWhen - You must read input that was written for the legacy mode.
 * @avoidWhen - You control the input; use {@link parseMarkdownV2} instead.
 * @never - NEVER expect nested formatting to work here.
 */
export function parseMarkdown(markdown: string): ParsedText {
	let text = '';
	const entities: DraftEntity[] = [];

	for (let i = 0; i < markdown.length; i++) {
		const c = markdown[i];

		if (c === '\\') {
			const next = at(markdown, i + 1);
			if (next === '_' || next === '*' || next === '`' || next === '[') {
				i++;
				text += markdown[i];
				continue;
			}
		}

		if (c !== '_' && c !== '*' && c !== '`' && c !== '[') {
			text += c;
			continue;
		}

		const beginPos = i;
		const endCharacter = c === '[' ? ']' : c;
		let isPre = false;
		i++;

		let language = '';
		if (c === '`' && at(markdown, i) === '`' && at(markdown, i + 1) === '`') {
			i += 2;
			isPre = true;
			let languageEnd = i;
			while (!isSpace(at(markdown, languageEnd)) && at(markdown, languageEnd) !== '`') {
				languageEnd++;
			}
			if (
				i !== languageEnd &&
				languageEnd < markdown.length &&
				at(markdown, languageEnd) !== '`'
			) {
				language = markdown.slice(i, languageEnd);
				i = languageEnd;
			}
			if (at(markdown, i) === '\n' || at(markdown, i) === '\r') {
				if (
					(at(markdown, i + 1) === '\n' || at(markdown, i + 1) === '\r') &&
					at(markdown, i) !== at(markdown, i + 1)
				) {
					i += 2;
				} else {
					i++;
				}
			}
		}

		const offset = text.length;
		while (
			i < markdown.length &&
			(markdown[i] !== endCharacter ||
				(isPre && !(at(markdown, i + 1) === '`' && at(markdown, i + 2) === '`')))
		) {
			text += markdown[i];
			i++;
		}
		if (i === markdown.length) {
			throw new ParseError("Can't find end of the entity", beginPos);
		}

		const length = text.length - offset;
		if (length !== 0) {
			switch (c) {
				case '_':
					entities.push({ type: 'italic', offset, length });
					break;
				case '*':
					entities.push({ type: 'bold', offset, length });
					break;
				case '[': {
					let url: string;
					if (at(markdown, i + 1) !== '(') {
						url = markdown.slice(beginPos + 1, i);
					} else {
						i += 2;
						const start = i;
						while (i < markdown.length && markdown[i] !== ')') {
							i++;
						}
						url = markdown.slice(start, i);
					}
					const userId = getLinkUserId(url);
					if (userId !== undefined) {
						entities.push({
							type: 'text_mention',
							offset,
							length,
							user: mentionedUser(userId),
						});
					} else {
						const checked = checkLink(url);
						if (checked.length > 0) {
							entities.push({ type: 'text_link', offset, length, url: checked });
						}
					}
					break;
				}
				case '`':
					if (isPre) {
						entities.push({
							type: 'pre',
							offset,
							length,
							language: language.length > 0 ? language : undefined,
						});
					} else {
						entities.push({ type: 'code', offset, length });
					}
					break;
				default:
					break;
			}
		}

		if (isPre) {
			i += 2;
		}
	}

	return { text, entities: finishEntities(entities) };
}

/**
 * Parses text according to a Bot API `parse_mode`.
 *
 * @remarks
 * {@link ParseHtmlOptions} only apply to `"HTML"`: the Markdown modes have no tags to
 * rewrite, and an unterminated Markdown construct cannot be dropped halfway through
 * without backtracking. The overloads therefore accept options for `"HTML"` alone, and
 * the runtime raises if they arrive anyway.
 *
 * @param text - The formatted text.
 * @param parseMode - The mode the text is written in.
 * @param options - Weak mode and element handlers; `"HTML"` only.
 * @returns The plain text and its entities.
 * @throws {ParseError} If the markup is not valid for the given mode, or options were
 *   passed with a Markdown mode.
 *
 * @example
 * ```typescript
 * import { parseEntities } from "@sunafterrainwm/telegram-entities-builder";
 *
 * const { text, entities } = parseEntities('*bold*', 'MarkdownV2');
 * const lenient = parseEntities('<div>x</div>', 'HTML', { weak: true });
 * ```
 *
 * @category Parsing
 */
export function parseEntities(
	text: string,
	parseMode: 'HTML',
	options?: ParseHtmlOptions,
): ParsedText;
export function parseEntities(text: string, parseMode: TT.ParseMode): ParsedText;
export function parseEntities(
	text: string,
	parseMode: TT.ParseMode,
	options?: ParseHtmlOptions,
): ParsedText {
	if (parseMode === 'HTML') {
		return parseHtml(text, options);
	}
	if (options !== undefined) {
		throw new ParseError(`Options are not supported for parse mode "${parseMode}"`);
	}
	switch (parseMode) {
		case 'MarkdownV2':
			return parseMarkdownV2(text);
		case 'Markdown':
			return parseMarkdown(text);
		default:
			throw new ParseError(`Unsupported parse mode "${String(parseMode)}"`);
	}
}
