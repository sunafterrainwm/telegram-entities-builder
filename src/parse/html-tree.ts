import { ParseError, at, decodeHtmlReference, isAlnum, isSpace } from './internal.ts';

/**
 * A text run of a parsed HTML tree, with all character references already decoded.
 *
 * @category Parsing
 */
export interface HtmlTextNode {
	/** Discriminant of the node kind. */
	kind: 'text';
	/** The decoded text. */
	text: string;
}

/**
 * An element of a parsed HTML tree. Attribute names are lower-cased; a valueless
 * attribute holds the empty string.
 *
 * @category Parsing
 */
export interface HtmlElementNode {
	/** Discriminant of the node kind. */
	kind: 'element';
	/** The lower-cased tag name. */
	tag: string;
	/**
	 * The attributes, keyed by lower-cased name; a valueless one holds `''`, and a name
	 * that was not present is `undefined`.
	 */
	attrs: Record<string, string | undefined>;
	/** The child nodes, empty for a void or self-closed element. */
	children: HtmlNode[];
	/** Offset in UTF-16 code units at which the element's start tag began. */
	position: number;
	/** The element this one is nested in, absent at the top level. */
	parent?: HtmlElementNode;
	/** How many element siblings precede this one inside the same parent. */
	index: number;
}

/**
 * A node of a parsed HTML tree.
 *
 * @category Parsing
 */
export type HtmlNode = HtmlTextNode | HtmlElementNode;

/**
 * Elements that never have content, so they need no end tag.
 *
 * @internal
 */
const VOID_TAGS = new Set(['br', 'hr', 'img', 'input', 'tg-map']);

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
 * Parses a well-formed HTML fragment into a tree.
 *
 * Only the structure is recovered; which tags are meaningful is decided by the caller,
 * so this is shared by the rich HTML and rich Markdown parsers. Character references are
 * decoded with the wider rich message table.
 *
 * @param html - The fragment to parse.
 * @param weak - Pass `true` to recover from malformed markup instead of raising: a stray
 *   end tag is ignored, an unclosed one is closed at the end of the input, and a
 *   malformed tag is skipped.
 * @returns The top-level nodes.
 * @throws {ParseError} On an unclosed tag or a stray end tag, unless `weak` is set.
 *
 * @category Parsing
 * @internal
 */
export function parseHtmlTree(html: string, weak = false): HtmlNode[] {
	const root: HtmlElementNode = {
		kind: 'element',
		tag: '#root',
		attrs: {},
		children: [],
		position: 0,
		index: 0,
	};
	const stack: HtmlElementNode[] = [root];

	/** Appends a text run, merging it with a preceding one. */
	const pushText = (value: string): void => {
		const parent = stack[stack.length - 1];
		const last = parent.children.at(-1);
		if (last?.kind === 'text') {
			last.text += value;
		} else {
			parent.children.push({ kind: 'text', text: value });
		}
	};

	for (let i = 0; i < html.length; i++) {
		const c = html[i];

		if (c === '&') {
			const decoded = decodeHtmlReference(html, i, true);
			if (decoded) {
				pushText(decoded.text);
				i = decoded.next - 1;
				continue;
			}
		}

		if (c !== '<') {
			pushText(c);
			continue;
		}

		const beginPos = i;
		i++;

		if (at(html, i) === '!') {
			// A comment or doctype; skipped up to the next '>'.
			while (at(html, i) !== '>' && at(html, i) !== '\0') {
				i++;
			}
			if (at(html, i) === '\0') {
				if (!weak) {
					throw new ParseError('Unclosed declaration', beginPos);
				}
				break;
			}
			continue;
		}

		if (at(html, i) === '/') {
			i++;
			const nameBegin = i;
			while (!isSpace(at(html, i)) && at(html, i) !== '>') {
				i++;
			}
			const tag = html.slice(nameBegin, i).toLowerCase();
			while (isSpace(at(html, i)) && at(html, i) !== '\0') {
				i++;
			}
			if (at(html, i) !== '>') {
				if (!weak) {
					throw new ParseError('Unclosed end tag', beginPos);
				}
				break;
			}

			const depth = stack.findLastIndex((node) => node.tag === tag);
			if (depth <= 0) {
				if (!weak) {
					throw new ParseError(`Unexpected end tag "${tag}"`, beginPos);
				}
				continue;
			}
			stack.length = depth;
			continue;
		}

		const nameBegin = i;
		while (
			!isSpace(at(html, i)) &&
			at(html, i) !== '>' &&
			at(html, i) !== '/' &&
			at(html, i) !== '\0'
		) {
			i++;
		}
		if (at(html, i) === '\0') {
			if (!weak) {
				throw new ParseError('Unclosed start tag', beginPos);
			}
			break;
		}
		const tag = html.slice(nameBegin, i).toLowerCase();
		if (tag.length === 0) {
			if (!weak) {
				throw new ParseError('Empty start tag', beginPos);
			}
			i = skipTag(html, i);
			continue;
		}

		const attrs: Record<string, string | undefined> = {};
		let selfClosing = false;
		let malformed = false;

		for (;;) {
			while (isSpace(at(html, i)) && at(html, i) !== '\0') {
				i++;
			}
			if (at(html, i) === '/') {
				selfClosing = true;
				i++;
				continue;
			}
			if (at(html, i) === '>') {
				break;
			}
			if (at(html, i) === '\0') {
				if (!weak) {
					throw new ParseError(`Unclosed start tag "${tag}"`, beginPos);
				}
				malformed = true;
				break;
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
			const name = html.slice(attributeBegin, i).toLowerCase();
			if (name.length === 0) {
				if (!weak) {
					throw new ParseError(`Empty attribute name in the tag "${tag}"`, beginPos);
				}
				malformed = true;
				break;
			}

			while (isSpace(at(html, i)) && at(html, i) !== '\0') {
				i++;
			}
			if (at(html, i) !== '=') {
				// A valueless attribute, such as `expandable` or `tg-spoiler`.
				attrs[name] = '';
				continue;
			}

			i++;
			while (isSpace(at(html, i)) && at(html, i) !== '\0') {
				i++;
			}
			if (at(html, i) === '\0') {
				if (!weak) {
					throw new ParseError(`Unclosed start tag "${tag}"`, beginPos);
				}
				malformed = true;
				break;
			}

			let value = '';
			if (at(html, i) !== '"' && at(html, i) !== "'") {
				const tokenBegin = i;
				while (isAlnum(at(html, i)) || at(html, i) === '.' || at(html, i) === '-') {
					i++;
				}
				value = html.slice(tokenBegin, i);
			} else {
				const endCharacter = at(html, i);
				i++;
				while (at(html, i) !== endCharacter && at(html, i) !== '\0') {
					if (at(html, i) === '&') {
						const decoded = decodeHtmlReference(html, i, true);
						if (decoded) {
							value += decoded.text;
							i = decoded.next;
							continue;
						}
					}
					value += html[i];
					i++;
				}
				if (at(html, i) === endCharacter) {
					i++;
				}
			}
			attrs[name] = value;
		}

		if (malformed) {
			i = skipTag(html, i);
			continue;
		}

		const parent = stack[stack.length - 1];
		const element: HtmlElementNode = {
			kind: 'element',
			tag,
			attrs,
			children: [],
			position: beginPos,
			index: parent.children.filter((child) => child.kind === 'element').length,
		};
		if (parent !== root) {
			element.parent = parent;
		}

		parent.children.push(element);
		if (!selfClosing && !VOID_TAGS.has(tag)) {
			stack.push(element);
		}
	}

	if (stack.length > 1 && !weak) {
		const open = stack[stack.length - 1];
		throw new ParseError(
			`Can't find end tag corresponding to start tag "${open.tag}"`,
			open.position,
		);
	}

	return root.children;
}
