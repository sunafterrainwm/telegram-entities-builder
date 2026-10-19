import type * as TT from '@grammyjs/types';
import { describe, expect, it } from '@jest/globals';

import {
	ParseError,
	parseEntities,
	parseHtml,
	parseMarkdown,
	parseMarkdownV2,
} from '../../src/parse/entities.ts';

describe('parseHtml', () => {
	it('should return plain text unchanged', () => {
		expect(parseHtml('Hello world')).toEqual({ text: 'Hello world', entities: [] });
	});

	it('should parse a simple entity', () => {
		expect(parseHtml('Hello <b>world</b>')).toEqual({
			text: 'Hello world',
			entities: [{ type: 'bold', offset: 6, length: 5 }],
		});
	});

	it('should accept every tag alias', () => {
		const { entities } = parseHtml(
			'<strong>a</strong><em>b</em><ins>c</ins><strike>d</strike><del>e</del>',
		);
		expect(entities.map((entity) => entity.type)).toEqual([
			'bold',
			'italic',
			'underline',
			'strikethrough',
			'strikethrough',
		]);
	});

	it('should order nested entities outermost first', () => {
		expect(parseHtml('<b>bold <i>italic bold</i></b>')).toEqual({
			text: 'bold italic bold',
			entities: [
				{ type: 'bold', offset: 0, length: 16 },
				{ type: 'italic', offset: 5, length: 11 },
			],
		});
	});

	it('should parse both spoiler spellings', () => {
		expect(parseHtml('<tg-spoiler>a</tg-spoiler>').entities[0]).toEqual({
			type: 'spoiler',
			offset: 0,
			length: 1,
		});
		expect(parseHtml('<span class="tg-spoiler">a</span>').entities[0]).toEqual({
			type: 'spoiler',
			offset: 0,
			length: 1,
		});
	});

	it('should reject a span that is not a spoiler', () => {
		expect(() => parseHtml('<span class="other">a</span>')).toThrow(ParseError);
	});

	it('should promote nested pre and code to a pre with a language', () => {
		expect(parseHtml('<pre><code class="language-python">x</code></pre>')).toEqual({
			text: 'x',
			entities: [{ type: 'pre', offset: 0, length: 1, language: 'python' }],
		});
	});

	it('should keep a bare pre without a language', () => {
		expect(parseHtml('<pre>x</pre>').entities[0]).toEqual({
			type: 'pre',
			offset: 0,
			length: 1,
		});
	});

	it('should drop the language of a standalone code tag', () => {
		expect(parseHtml('<code class="language-py">x</code>').entities[0]).toEqual({
			type: 'code',
			offset: 0,
			length: 1,
		});
	});

	it('should parse links', () => {
		expect(parseHtml('<a href="https://example.com">x</a>').entities[0]).toEqual({
			type: 'text_link',
			offset: 0,
			length: 1,
			url: 'https://example.com',
		});
	});

	it('should use the text as the URL when href is absent', () => {
		expect(parseHtml('<a>https://example.com</a>').entities[0]).toEqual({
			type: 'text_link',
			offset: 0,
			length: 19,
			url: 'https://example.com',
		});
	});

	it('should turn a tg://user link into a text mention carrying the id', () => {
		expect(parseHtml('<a href="tg://user?id=777000">x</a>').entities[0]).toEqual({
			type: 'text_mention',
			offset: 0,
			length: 1,
			user: { id: 777000, is_bot: false, first_name: '' },
		} satisfies TT.MessageEntity);
	});

	it('should parse custom emoji and count surrogate pairs as two units', () => {
		expect(
			parseHtml('<tg-emoji emoji-id="5368324170671202286">\u{1f44d}</tg-emoji>'),
		).toEqual({
			text: '\u{1f44d}',
			entities: [
				{
					type: 'custom_emoji',
					offset: 0,
					length: 2,
					custom_emoji_id: '5368324170671202286',
				},
			],
		});
	});

	it('should reject an invalid custom emoji id', () => {
		expect(() => parseHtml('<tg-emoji emoji-id="0">x</tg-emoji>')).toThrow(ParseError);
	});

	it('should parse formatted dates', () => {
		expect(
			parseHtml('<tg-time unix="1647531900" format="wDT">x</tg-time>').entities[0],
		).toEqual({
			type: 'date_time',
			offset: 0,
			length: 1,
			unix_time: 1647531900,
			date_time_format: 'wDT',
		});
	});

	it('should canonicalize the date format and accept a missing one', () => {
		expect(
			parseHtml('<tg-time unix="1" format="Tdw">x</tg-time>').entities[0],
		).toMatchObject({ date_time_format: 'wdT' });
		expect(parseHtml('<tg-time unix="1">x</tg-time>').entities[0]).toMatchObject({
			date_time_format: '',
		});
		expect(() => parseHtml('<tg-time unix="1" format="z">x</tg-time>')).toThrow(
			ParseError,
		);
	});

	it('should emit no entity for a tg-time without a unix time', () => {
		expect(parseHtml('<tg-time format="r">x</tg-time>')).toEqual({
			text: 'x',
			entities: [],
		});
	});

	it('should parse both block quotation kinds', () => {
		expect(parseHtml('<blockquote>x</blockquote>').entities[0]).toMatchObject({
			type: 'blockquote',
		});
		expect(parseHtml('<blockquote expandable>x</blockquote>').entities[0]).toMatchObject({
			type: 'expandable_blockquote',
		});
		expect(
			parseHtml('<blockquote expandable="1">x</blockquote>').entities[0],
		).toMatchObject({ type: 'expandable_blockquote' });
	});

	it('should decode character references', () => {
		expect(parseHtml('&lt;&gt;&amp;&quot;&#65;&#x42;').text).toBe('<>&"AB');
	});

	it('should leave an unsupported reference as literal text', () => {
		expect(parseHtml('&nbsp;').text).toBe('&nbsp;');
	});

	it('should emit no entity for empty content', () => {
		expect(parseHtml('<b></b>')).toEqual({ text: '', entities: [] });
	});

	it('should accept an anonymous end tag', () => {
		expect(parseHtml('<b>x</>').entities[0]).toMatchObject({ type: 'bold' });
	});

	it('should reject malformed markup', () => {
		expect(() => parseHtml('<x>y</x>')).toThrow('Unsupported start tag "x"');
		expect(() => parseHtml('<b>y')).toThrow("Can't find end tag");
		expect(() => parseHtml('y</b>')).toThrow('Unexpected end tag');
		expect(() => parseHtml('<b>y</i>')).toThrow('Unmatched end tag');
		expect(() => parseHtml('<b')).toThrow('Unclosed start tag');
		expect(() => parseHtml('<b ="x">y</b>')).toThrow('Empty attribute name');
	});
});

describe('parseMarkdownV2', () => {
	it('should parse the basic styles', () => {
		expect(parseMarkdownV2('*b* _i_ __u__ ~s~ ||sp|| `c`')).toEqual({
			text: 'b i u s sp c',
			entities: [
				{ type: 'bold', offset: 0, length: 1 },
				{ type: 'italic', offset: 2, length: 1 },
				{ type: 'underline', offset: 4, length: 1 },
				{ type: 'strikethrough', offset: 6, length: 1 },
				{ type: 'spoiler', offset: 8, length: 2 },
				{ type: 'code', offset: 11, length: 1 },
			],
		});
	});

	it('should nest entities', () => {
		expect(parseMarkdownV2('*bold _italic_*')).toEqual({
			text: 'bold italic',
			entities: [
				{ type: 'bold', offset: 0, length: 11 },
				{ type: 'italic', offset: 5, length: 6 },
			],
		});
	});

	it('should honour backslash escapes', () => {
		expect(parseMarkdownV2('\\*not bold\\*')).toEqual({
			text: '*not bold*',
			entities: [],
		});
	});

	it('should reject an unescaped reserved character', () => {
		expect(() => parseMarkdownV2('2 + 2 = 4')).toThrow(ParseError);
		expect(parseMarkdownV2('2 \\+ 2 \\= 4').text).toBe('2 + 2 = 4');
	});

	it('should parse fenced code with a language', () => {
		expect(parseMarkdownV2('```python\nx\n```')).toEqual({
			text: 'x\n',
			entities: [{ type: 'pre', offset: 0, length: 2, language: 'python' }],
		});
	});

	it('should parse fenced code without a language', () => {
		expect(parseMarkdownV2('```\nx\n```').entities[0]).toEqual({
			type: 'pre',
			offset: 0,
			length: 2,
		});
	});

	it('should parse links and mentions', () => {
		expect(parseMarkdownV2('[t](https://example.com)').entities[0]).toEqual({
			type: 'text_link',
			offset: 0,
			length: 1,
			url: 'https://example.com',
		});
		expect(parseMarkdownV2('[t](tg://user?id=777000)').entities[0]).toMatchObject({
			type: 'text_mention',
			user: { id: 777000 },
		});
	});

	it('should use the text as the URL without a destination', () => {
		// A literal dot would have to be escaped, so the host here carries none.
		expect(parseMarkdownV2('[https://localhost]').entities[0]).toMatchObject({
			type: 'text_link',
			url: 'https://localhost',
		});
	});

	it('should parse custom emoji and formatted dates', () => {
		expect(
			parseMarkdownV2('![\u{1f44d}](tg://emoji?id=5368324170671202286)').entities[0],
		).toEqual({
			type: 'custom_emoji',
			offset: 0,
			length: 2,
			custom_emoji_id: '5368324170671202286',
		});
		expect(
			parseMarkdownV2('![soon](tg://time?unix=1647531900&format=wDT)').entities[0],
		).toEqual({
			type: 'date_time',
			offset: 0,
			length: 4,
			unix_time: 1647531900,
			date_time_format: 'wDT',
		});
		expect(() => parseMarkdownV2('![x](https://example.com)')).toThrow(ParseError);
	});

	it('should parse a block quotation spanning several lines', () => {
		expect(parseMarkdownV2('>a\n>b\nc')).toEqual({
			text: 'a\nb\nc',
			entities: [{ type: 'blockquote', offset: 0, length: 4 }],
		});
	});

	it('should parse an expandable block quotation', () => {
		expect(parseMarkdownV2('>a||')).toEqual({
			text: 'a',
			entities: [{ type: 'expandable_blockquote', offset: 0, length: 1 }],
		});
		expect(parseMarkdownV2('>a||\nb')).toEqual({
			text: 'a\nb',
			entities: [{ type: 'expandable_blockquote', offset: 0, length: 2 }],
		});
	});

	it('should reject an unterminated entity', () => {
		expect(() => parseMarkdownV2('*bold')).toThrow("Can't find end of bold entity");
		expect(() => parseMarkdownV2('[t](https://example.com')).toThrow(
			"Can't find end of a URL",
		);
	});
});

describe('parseMarkdown', () => {
	it('should parse the legacy styles', () => {
		expect(parseMarkdown('*b* _i_ `c`')).toEqual({
			text: 'b i c',
			entities: [
				{ type: 'bold', offset: 0, length: 1 },
				{ type: 'italic', offset: 2, length: 1 },
				{ type: 'code', offset: 4, length: 1 },
			],
		});
	});

	it('should parse links and fenced code', () => {
		expect(parseMarkdown('[t](https://example.com)').entities[0]).toMatchObject({
			type: 'text_link',
			url: 'https://example.com',
		});
		expect(parseMarkdown('```py\nx\n```').entities[0]).toEqual({
			type: 'pre',
			offset: 0,
			length: 2,
			language: 'py',
		});
	});

	it('should leave reserved characters alone outside entities', () => {
		expect(parseMarkdown('2 + 2 = 4')).toEqual({ text: '2 + 2 = 4', entities: [] });
	});

	it('should reject an unterminated entity', () => {
		expect(() => parseMarkdown('*bold')).toThrow("Can't find end of the entity");
	});
});

describe('parseEntities', () => {
	it('should dispatch on the parse mode', () => {
		expect(parseEntities('<b>x</b>', 'HTML').entities[0]).toMatchObject({
			type: 'bold',
		});
		expect(parseEntities('*x*', 'MarkdownV2').entities[0]).toMatchObject({
			type: 'bold',
		});
		expect(parseEntities('*x*', 'Markdown').entities[0]).toMatchObject({
			type: 'bold',
		});
		expect(() => parseEntities('x', 'Other' as TT.ParseMode)).toThrow(ParseError);
	});
});
