import type * as TT from '@grammyjs/types';
import { describe, expect, it } from '@jest/globals';

import type { HtmlTagMatch } from '../../src/index.ts';
import {
	EntityTransform,
	HtmlSelectorMap,
	ParseError,
	RichTransform,
	parseEntities,
	parseHtml,
	parseRichHtml,
	parseRichMarkdown,
	parseRichText,
} from '../../src/index.ts';

/** Shorthand for the block list of a parsed message. */
function blocks(message: TT.InputRichMessage<never>): TT.InputRichBlock<never>[] {
	return message.blocks ?? [];
}

/** A handler-shaped value, since the table only accepts callables. */
const tag = (name: string) => () => name;

/** Resolves a selector table to the name its handler carries. */
function found(
	map: HtmlSelectorMap<() => string>,
	element: HtmlTagMatch,
): string | undefined {
	return map.find(element)?.();
}

describe('HtmlSelectorMap', () => {
	it('should match by tag name and by the wildcard', () => {
		const map = new HtmlSelectorMap({ ul: tag('list'), '*': tag('any') });

		expect(found(map, { tag: 'ul', attrs: {} })).toBe('list');
		expect(found(map, { tag: 'div', attrs: {} })).toBe('any');
	});

	it('should split comma-separated alternatives', () => {
		const map = new HtmlSelectorMap({ 'ul, ol': tag('list') });

		expect(found(map, { tag: 'ul', attrs: {} })).toBe('list');
		expect(found(map, { tag: 'ol', attrs: {} })).toBe('list');
		expect(found(map, { tag: 'li', attrs: {} })).toBeUndefined();
	});

	it('should match attribute presence and value', () => {
		const map = new HtmlSelectorMap({
			'input[type=checkbox]': tag('checkbox'),
			'a[name]': tag('anchor'),
			'td[align="right"]': tag('right'),
		});

		expect(found(map, { tag: 'input', attrs: { type: 'checkbox' } })).toBe('checkbox');
		expect(found(map, { tag: 'input', attrs: { type: 'text' } })).toBeUndefined();
		expect(found(map, { tag: 'a', attrs: { name: 'x' } })).toBe('anchor');
		expect(found(map, { tag: 'a', attrs: { href: 'x' } })).toBeUndefined();
		expect(found(map, { tag: 'td', attrs: { align: 'right' } })).toBe('right');
		expect(found(map, { tag: 'td', attrs: { align: 'left' } })).toBeUndefined();
	});

	it('should prefer the most specific match', () => {
		const map = new HtmlSelectorMap({
			'*': tag('any'),
			a: tag('link'),
			'a[name]': tag('anchor'),
		});

		expect(found(map, { tag: 'a', attrs: { name: 'x' } })).toBe('anchor');
		expect(found(map, { tag: 'a', attrs: {} })).toBe('link');
		expect(found(map, { tag: 'b', attrs: {} })).toBe('any');
	});

	it('should report emptiness and reject unsupported selectors', () => {
		expect(new HtmlSelectorMap().isEmpty).toBe(true);
		expect(new HtmlSelectorMap({ b: tag('x') }).isEmpty).toBe(false);
		expect(() => new HtmlSelectorMap({ 'div > p': tag('x') })).toThrow(ParseError);
		expect(() => new HtmlSelectorMap({ '.cls': tag('x') })).toThrow(ParseError);
	});

	it('should only accept callable handlers', () => {
		// @ts-expect-error TS2344: a table of plain values is not a handler table
		const invalid: HtmlSelectorMap<string> | undefined = undefined;
		expect(invalid).toBeUndefined();
	});
});

describe('parseHtml weak mode', () => {
	it('should keep the text of an unsupported tag', () => {
		expect(parseHtml('<div>kept <b>bold</b></div>', { weak: true })).toEqual({
			text: 'kept bold',
			entities: [{ type: 'bold', offset: 5, length: 4 }],
		});
	});

	it('should ignore a stray end tag and close an unclosed one', () => {
		expect(parseHtml('a</i>b', { weak: true })).toEqual({ text: 'ab', entities: [] });
		expect(parseHtml('<b>unterminated', { weak: true })).toEqual({
			text: 'unterminated',
			entities: [{ type: 'bold', offset: 0, length: 12 }],
		});
	});

	it('should close down to a mismatched end tag', () => {
		// The inner element closes first, which is the order real end tags would give.
		expect(parseHtml('<b><i>x</b>', { weak: true })).toEqual({
			text: 'x',
			entities: [
				{ type: 'italic', offset: 0, length: 1 },
				{ type: 'bold', offset: 0, length: 1 },
			],
		});
	});

	it('should drop entities it cannot build', () => {
		expect(parseHtml('<tg-emoji emoji-id="0">x</tg-emoji>', { weak: true })).toEqual({
			text: 'x',
			entities: [],
		});
		expect(parseHtml('<tg-time unix="1" format="z">x</tg-time>', { weak: true })).toEqual(
			{ text: 'x', entities: [] },
		);
		expect(parseHtml('<span class="other">x</span>', { weak: true })).toEqual({
			text: 'x',
			entities: [],
		});
	});

	it('should skip a malformed tag', () => {
		expect(parseHtml('<b ="x">y</b>', { weak: true })).toEqual({
			text: 'y',
			entities: [],
		});
	});

	it('should still throw without weak', () => {
		expect(() => parseHtml('<div>x</div>')).toThrow(ParseError);
	});
});

describe('parseHtml handlers', () => {
	it('should insert text around an element', () => {
		expect(
			parseHtml('<ul><li>one</li><li>two</li></ul>', {
				weak: true,
				on: { li: () => ({ before: '• ', after: '\n' }) },
			}),
		).toEqual({ text: '• one\n• two\n', entities: [] });
	});

	it('should map an element onto entities without covering the inserted text', () => {
		const { text, entities } = parseHtml('<h1>Title</h1>rest', {
			weak: true,
			on: { 'h1, h2': () => ({ entities: [{ type: 'bold' }], after: '\n\n' }) },
		});

		expect(text).toBe('Title\n\nrest');
		expect(entities).toEqual([{ type: 'bold', offset: 0, length: 5 }]);
	});

	it('should drop an element with its content', () => {
		expect(
			parseHtml('keep<script>var a = 1 < 2;</script>end', {
				weak: true,
				on: { 'script, style': () => ({ drop: true }) },
			}),
		).toEqual({ text: 'keepend', entities: [] });
	});

	it('should drop nested elements of the same name', () => {
		expect(
			parseHtml('a<div>b<div>c</div>d</div>e', {
				on: { div: () => ({ drop: true }) },
			}),
		).toEqual({ text: 'ae', entities: [] });
	});

	it('should let a handler see the attributes and select on them', () => {
		expect(
			parseHtml('<input type="checkbox" checked><input type="checkbox">', {
				on: {
					'input[type=checkbox]': (element) => ({
						before: element.attrs.checked === undefined ? '[ ] ' : '[x] ',
						selfClosing: true,
					}),
				},
			}),
		).toEqual({ text: '[x] [ ] ', entities: [] });
	});

	it('should treat a tag written <x/> as having no content', () => {
		expect(parseHtml('a<br/>b', { on: { br: () => ({ before: '\n' }) } })).toEqual({
			text: 'a\nb',
			entities: [],
		});
	});

	it('should override the built-in handling of a known tag', () => {
		expect(parseHtml('<b>x</b>', { on: { b: () => undefined } })).toEqual({
			text: 'x',
			entities: [],
		});
	});

	it('should number the items of an ordered list', () => {
		// The documented way to turn <ol>/<ul> into something the entity model has.
		const lists = new EntityTransform({
			weak: true,
			on: {
				li: ({ attrs, index, parent }) => {
					if (parent?.tag !== 'ol') {
						return { before: '\u2022 ', after: '\n' };
					}
					const start = Number(parent.attrs.start ?? '1');
					const value = attrs.value === undefined ? start + index : Number(attrs.value);
					return { before: `${value}. `, after: '\n' };
				},
			},
		});

		expect(parseHtml('<ol><li>one</li><li>two</li><li>three</li></ol>', lists).text).toBe(
			'1. one\n2. two\n3. three\n',
		);
		expect(parseHtml('<ol start="3"><li>one</li><li>two</li></ol>', lists).text).toBe(
			'3. one\n4. two\n',
		);
		expect(
			parseHtml('<ol><li>one</li><li value="7">seven</li><li>eight</li></ol>', lists)
				.text,
		).toBe('1. one\n7. seven\n3. eight\n');
		expect(parseHtml('<ul><li>one</li><li>two</li></ul>', lists).text).toBe(
			'\u2022 one\n\u2022 two\n',
		);
	});

	it('should keep entities while numbering a list', () => {
		const { text, entities } = parseHtml('<ol><li><b>one</b></li><li>two</li></ol>', {
			weak: true,
			on: {
				li: ({ index, parent }) =>
					parent?.tag === 'ol'
						? { before: `${index + 1}. `, after: '\n' }
						: { before: '\u2022 ', after: '\n' },
			},
		});

		expect(text).toBe('1. one\n2. two\n');
		expect(entities).toEqual([{ type: 'bold', offset: 3, length: 3 }]);
	});

	it('should number nested ordered lists independently', () => {
		const transform = new EntityTransform({
			weak: true,
			on: {
				li: ({ index, parent }) =>
					parent?.tag === 'ol'
						? { before: `${index + 1}. `, after: '\n' }
						: { before: '\u2022 ', after: '\n' },
			},
		});

		expect(
			parseHtml(
				'<ol><li>a<ol><li>inner</li><li>inner2</li></ol></li><li>b</li></ol>',
				transform,
			).text,
		).toBe('1. a1. inner\n2. inner2\n\n2. b\n');
	});

	it('should count every element sibling, markup or not', () => {
		const seen: { tag: string; index: number; parent?: string }[] = [];
		parseHtml('<ol><li>a</li><b>x</b><li>b</li></ol>', {
			weak: true,
			on: {
				'*': (element) => {
					seen.push({
						tag: element.tag,
						index: element.index,
						parent: element.parent?.tag,
					});
				},
			},
		});

		expect(seen).toEqual([
			{ tag: 'ol', index: 0, parent: undefined },
			{ tag: 'li', index: 0, parent: 'ol' },
			{ tag: 'b', index: 1, parent: 'ol' },
			{ tag: 'li', index: 2, parent: 'ol' },
		]);
	});

	it('should accept a reusable transform', () => {
		const transform = new EntityTransform({
			weak: true,
			on: { li: () => ({ before: '- ', after: '\n' }) },
		});

		expect(parseHtml('<ul><li>a</li></ul>', transform).text).toBe('- a\n');
		expect(parseHtml('<ul><li>b</li></ul>', transform).text).toBe('- b\n');
	});

	it('should reach a handler even when the tag is unknown and weak is off', () => {
		expect(parseHtml('<mark>x</mark>', { on: { mark: () => ({}) } })).toEqual({
			text: 'x',
			entities: [],
		});
		expect(() =>
			parseHtml('<mark>x</mark><aside>y</aside>', {
				on: { mark: () => ({}) },
			}),
		).toThrow(ParseError);
	});
});

describe('parseEntities options', () => {
	it('should pass options through for HTML', () => {
		expect(parseEntities('<div>x</div>', 'HTML', { weak: true })).toEqual({
			text: 'x',
			entities: [],
		});
	});

	it('should refuse options for the Markdown modes', () => {
		expect(() =>
			// @ts-expect-error TS2345: the overloads only allow options for "HTML"
			parseEntities('x', 'MarkdownV2', { weak: true }),
		).toThrow('Options are not supported for parse mode "MarkdownV2"');
	});
});

describe('parseRichHtml weak mode', () => {
	it('should unwrap an unknown tag at block level', () => {
		expect(
			blocks(parseRichHtml('<div><p>one</p><p>two</p></div>', { weak: true })),
		).toEqual([
			{ type: 'paragraph', text: 'one' },
			{ type: 'paragraph', text: 'two' },
		]);
	});

	it('should keep the text of an unknown tag inline', () => {
		expect(parseRichText('a <kbd>b</kbd> c', { weak: true })).toBe('a b c');
	});

	it('should recover from malformed markup', () => {
		expect(blocks(parseRichHtml('<p>unterminated', { weak: true }))).toEqual([
			{ type: 'paragraph', text: 'unterminated' },
		]);
		expect(blocks(parseRichHtml('x</p>', { weak: true }))).toEqual([
			{ type: 'paragraph', text: 'x' },
		]);
	});

	it('should drop blocks and nodes it cannot build', () => {
		expect(blocks(parseRichHtml('<tg-map zoom="14"/>', { weak: true }))).toEqual([]);
		expect(blocks(parseRichHtml('<img/>', { weak: true }))).toEqual([]);
		expect(blocks(parseRichHtml('<figure></figure>', { weak: true }))).toEqual([]);
		expect(
			blocks(
				parseRichHtml('<tg-button-row><tg-button>x</tg-button></tg-button-row>', {
					weak: true,
				}),
			),
		).toEqual([{ type: 'buttons', buttons: [] }]);
	});

	it('should fall back to plain text for a broken inline node', () => {
		expect(parseRichText('<tg-emoji emoji-id="0">👍</tg-emoji>', { weak: true })).toBe(
			'👍',
		);
		expect(parseRichText('<tg-time format="z">soon</tg-time>', { weak: true })).toBe(
			'soon',
		);
		expect(parseRichText('<tg-reference>note</tg-reference>', { weak: true })).toBe(
			'note',
		);
	});

	it('should still throw without weak', () => {
		expect(() => parseRichHtml('<div>x</div>')).toThrow(ParseError);
	});
});

describe('parseRichHtml handlers', () => {
	it('should unwrap an element into blocks', () => {
		expect(
			blocks(
				parseRichHtml('<section><p>x</p></section>', {
					on: { 'section, article': (context) => ({ blocks: context.blocks() }) },
				}),
			),
		).toEqual([{ type: 'paragraph', text: 'x' }]);
	});

	it('should replace an element with inline text', () => {
		expect(
			parseRichText('press <kbd>Esc</kbd>', {
				on: { kbd: (context) => ({ text: { type: 'code', text: context.text() } }) },
			}),
		).toEqual(['press ', { type: 'code', text: 'Esc' }]);
	});

	it('should merge an inline result into the surrounding paragraph', () => {
		expect(
			blocks(
				parseRichHtml('before <kbd>Esc</kbd> after', {
					on: { kbd: (context) => ({ text: context.text() }) },
				}),
			),
		).toEqual([{ type: 'paragraph', text: 'before Esc after' }]);
	});

	it('should convert a list into a block the API has', () => {
		const message = parseRichHtml('<ul><li>a</li><li>b</li></ul>', {
			on: {
				ul: (context) => ({
					blocks: [
						{
							type: 'paragraph',
							text: context.element.children
								.map((child) => (child.kind === 'element' ? child : undefined))
								.filter((child) => child?.tag === 'li')
								.map(
									(child) =>
										`• ${child?.children[0]?.kind === 'text' ? child.children[0].text : ''}`,
								)
								.join('\n'),
						},
					],
				}),
			},
		});

		expect(blocks(message)).toEqual([{ type: 'paragraph', text: '• a\n• b' }]);
	});

	it('should drop an element when the handler returns nothing', () => {
		expect(
			blocks(
				parseRichHtml('<p>a</p><nav><p>b</p></nav>', {
					on: { nav: () => undefined },
				}),
			),
		).toEqual([{ type: 'paragraph', text: 'a' }]);
	});

	it('should reject blocks where only text fits', () => {
		expect(() =>
			parseRichText('<div>x</div>', {
				on: { div: (context) => ({ blocks: context.blocks() }) },
			}),
		).toThrow('returned blocks where only text fits');

		expect(
			parseRichText('<div>x</div>', {
				weak: true,
				on: { div: (context) => ({ blocks: context.blocks() }) },
			}),
		).toBe('');
	});

	it('should give a rich handler its parent and index', () => {
		const seen: { tag: string; index: number; parent?: string }[] = [];
		parseRichHtml('<div><x>a</x><x>b</x></div><x>c</x>', {
			on: {
				div: (context) => ({ blocks: context.blocks() }),
				x: (context) => {
					seen.push({
						tag: context.element.tag,
						index: context.index,
						parent: context.parent?.tag,
					});
					return { text: context.text() };
				},
			},
		});

		expect(seen).toEqual([
			{ tag: 'x', index: 0, parent: 'div' },
			{ tag: 'x', index: 1, parent: 'div' },
			{ tag: 'x', index: 1, parent: undefined },
		]);
	});

	it('should not reach the structural children a block consumes itself', () => {
		const seen: string[] = [];
		const message = parseRichHtml('<ul><li>a</li></ul>', {
			on: {
				li: (context) => {
					seen.push('li');
					return { blocks: context.blocks() };
				},
			},
		});

		// <li> is read by the native list handling, so no handler fires for it.
		expect(seen).toEqual([]);
		expect(blocks(message)).toEqual([
			{ type: 'list', items: [{ blocks: [{ type: 'paragraph', text: 'a' }] }] },
		]);
	});

	it('should tell the handler which position it is in', () => {
		const seen: string[] = [];
		parseRichHtml('<p><b>a <x>i</x></b></p><x>b</x>', {
			on: {
				x: (context) => {
					seen.push(context.position);
					return { text: 'x' };
				},
			},
		});

		expect(seen).toEqual(['inline', 'block']);
	});

	it('should accept a reusable transform', () => {
		const transform = new RichTransform({
			weak: true,
			on: { div: (context) => ({ blocks: context.blocks() }) },
		});

		expect(blocks(parseRichHtml('<div><p>a</p></div>', transform))).toEqual([
			{ type: 'paragraph', text: 'a' },
		]);
		expect(blocks(parseRichHtml('<div><p>b</p></div>', transform))).toEqual([
			{ type: 'paragraph', text: 'b' },
		]);
	});

	it('should reach the Markdown parser through the HTML stage', () => {
		expect(
			blocks(
				parseRichMarkdown('# Title\n\n<div>wrapped</div>', {
					weak: true,
					on: { div: (context) => ({ blocks: context.blocks() }) },
				}),
			),
		).toEqual([
			{ type: 'heading', text: 'Title', size: 1 },
			{ type: 'paragraph', text: 'wrapped' },
		]);
	});
});
