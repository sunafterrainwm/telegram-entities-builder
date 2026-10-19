import type * as TT from '@grammyjs/types';
import { describe, expect, it } from '@jest/globals';

import { ParseError } from '../../src/parse/internal.ts';
import {
	DEFAULT_MAP_HEIGHT,
	DEFAULT_MAP_WIDTH,
	parseRichHtml,
	parseRichText,
} from '../../src/parse/rich-html.ts';
import { parseRichMarkdown, richMarkdownToHtml } from '../../src/parse/rich-markdown.ts';

/** Shorthand for the block list of a parsed message. */
function blocks(message: TT.InputRichMessage<never>): TT.InputRichBlock<never>[] {
	return message.blocks ?? [];
}

describe('parseRichText', () => {
	it('should parse inline wrappers', () => {
		expect(
			parseRichText(
				'<b>b</b><i>i</i><u>u</u><s>s</s><code>c</code><mark>m</mark><sub>sub</sub><sup>sup</sup><tg-spoiler>sp</tg-spoiler>',
			),
		).toEqual([
			{ type: 'bold', text: 'b' },
			{ type: 'italic', text: 'i' },
			{ type: 'underline', text: 'u' },
			{ type: 'strikethrough', text: 's' },
			{ type: 'code', text: 'c' },
			{ type: 'marked', text: 'm' },
			{ type: 'subscript', text: 'sub' },
			{ type: 'superscript', text: 'sup' },
			{ type: 'spoiler', text: 'sp' },
		] satisfies TT.RichText[]);
	});

	it('should nest wrappers structurally', () => {
		expect(parseRichText('<b>bold <i>and italic</i></b>')).toEqual({
			type: 'bold',
			text: ['bold ', { type: 'italic', text: 'and italic' }],
		});
	});

	it('should parse every link flavour', () => {
		expect(parseRichText('<a href="https://t.me/">x</a>')).toEqual({
			type: 'url',
			text: 'x',
			url: 'https://t.me/',
		});
		expect(parseRichText('<a href="mailto:user@example.com">x</a>')).toEqual({
			type: 'email_address',
			text: 'x',
			email_address: 'user@example.com',
		});
		expect(parseRichText('<a href="tel:+123456789">x</a>')).toEqual({
			type: 'phone_number',
			text: 'x',
			phone_number: '+123456789',
		});
		expect(parseRichText('<a href="tg://user?id=777000">x</a>')).toEqual({
			type: 'text_mention',
			text: 'x',
			user: { id: 777000, is_bot: false, first_name: '' },
		});
		expect(parseRichText('<a href="#chapter-1">x</a>')).toEqual({
			type: 'anchor_link',
			text: 'x',
			anchor_name: 'chapter-1',
		});
	});

	it('should resolve a link to a defined reference', () => {
		expect(
			parseRichText(
				'<a href="#note-1">x</a><tg-reference name="note-1">note</tg-reference>',
			),
		).toEqual([
			{ type: 'reference_link', text: 'x', reference_name: 'note-1' },
			{ type: 'reference', text: 'note', name: 'note-1' },
		]);
	});

	it('should parse custom emoji in both spellings', () => {
		const expected = {
			type: 'custom_emoji',
			custom_emoji_id: '5368324170671202286',
			alternative_text: '\u{1f44d}',
		};
		expect(
			parseRichText('<tg-emoji emoji-id="5368324170671202286">\u{1f44d}</tg-emoji>'),
		).toEqual(expected);
		expect(
			parseRichText('<img src="tg://emoji?id=5368324170671202286" alt="\u{1f44d}"/>'),
		).toEqual(expected);
	});

	it('should parse dates, formulas, anchors and line breaks', () => {
		expect(parseRichText('<tg-time unix="1647531900" format="wDT">x</tg-time>')).toEqual({
			type: 'date_time',
			text: 'x',
			unix_time: 1647531900,
			date_time_format: 'wDT',
		});
		expect(parseRichText('<tg-math>x^2 + y^2</tg-math>')).toEqual({
			type: 'mathematical_expression',
			expression: 'x^2 + y^2',
		});
		expect(parseRichText('<a name="chapter-1"></a>')).toEqual({
			type: 'anchor',
			name: 'chapter-1',
		});
		// <br> is absent from the documented tag list, but the Bot API's own blockquote
		// example uses it, so all three spellings are built in.
		expect(parseRichText('a<br>b')).toBe('a\nb');
		expect(parseRichText('a<br/>b')).toBe('a\nb');
		expect(parseRichText('a<br />b')).toBe('a\nb');
	});

	it('should parse an inline button', () => {
		expect(
			parseRichText(
				'<tg-button type="url" style="success" url="https://t.me">go</tg-button>',
			),
		).toEqual({
			type: 'button',
			button: { text: 'go', url: 'https://t.me', style: 'success' },
		});
	});

	it('should reject unsupported tags and bad attributes', () => {
		expect(() => parseRichText('<marquee>x</marquee>')).toThrow(ParseError);
		expect(() => parseRichText('<tg-emoji emoji-id="0">x</tg-emoji>')).toThrow(
			ParseError,
		);
		expect(() => parseRichText('<tg-time format="z">x</tg-time>')).toThrow(ParseError);
		expect(() => parseRichText('<tg-time format="r">x</tg-time>')).toThrow(ParseError);
		expect(() => parseRichText('<img src="https://example.com/a.jpg"/>')).toThrow(
			ParseError,
		);
	});
});

describe('parseRichHtml', () => {
	it('should parse headings, paragraphs and dividers', () => {
		expect(
			blocks(parseRichHtml('<h1>Title</h1><p>Body with <b>bold</b>.</p><hr/>')),
		).toEqual([
			{ type: 'heading', text: 'Title', size: 1 },
			{ type: 'paragraph', text: ['Body with ', { type: 'bold', text: 'bold' }, '.'] },
			{ type: 'divider' },
		] satisfies TT.InputRichBlock<never>[]);
	});

	it('should accept <br/> at block level without weak mode', () => {
		expect(blocks(parseRichHtml('one<br />two'))).toEqual([
			{ type: 'paragraph', text: 'one\ntwo' },
		]);
		expect(
			blocks(parseRichHtml('<blockquote>a<br/>b<cite>Author</cite></blockquote>')),
		).toEqual([
			{
				type: 'blockquote',
				blocks: [{ type: 'paragraph', text: 'a\nb' }],
				credit: 'Author',
			},
		]);
	});

	it('should wrap loose inline content in a paragraph', () => {
		expect(blocks(parseRichHtml('loose <b>text</b>\n<hr/>'))).toEqual([
			{ type: 'paragraph', text: ['loose ', { type: 'bold', text: 'text' }] },
			{ type: 'divider' },
		]);
	});

	it('should read every heading size', () => {
		expect(
			blocks(parseRichHtml('<h2>a</h2><h3>b</h3><h4>c</h4><h5>d</h5><h6>e</h6>')).map(
				(block) => (block.type === 'heading' ? block.size : 0),
			),
		).toEqual([2, 3, 4, 5, 6]);
	});

	it('should parse preformatted blocks', () => {
		expect(blocks(parseRichHtml('<pre>plain</pre>'))).toEqual([
			{ type: 'pre', text: 'plain' },
		]);
		expect(
			blocks(parseRichHtml('<pre><code class="language-python">print(1)</code></pre>')),
		).toEqual([{ type: 'pre', text: 'print(1)', language: 'python' }]);
	});

	it('should parse quotations', () => {
		expect(
			blocks(
				parseRichHtml(
					'<blockquote>a<br>b<cite>The Author</cite></blockquote><blockquote expandable>c<cite>Author</cite></blockquote><aside>d<cite>Author</cite></aside>',
				),
			),
		).toEqual([
			{
				type: 'blockquote',
				blocks: [{ type: 'paragraph', text: 'a\nb' }],
				credit: 'The Author',
			},
			{ type: 'expandable_blockquote', text: 'c', credit: 'Author' },
			{ type: 'pullquote', text: 'd', credit: 'Author' },
		] satisfies TT.InputRichBlock<never>[]);
	});

	it('should parse lists', () => {
		expect(blocks(parseRichHtml('<ul><li>one</li><li>two</li></ul>'))).toEqual([
			{
				type: 'list',
				items: [
					{ blocks: [{ type: 'paragraph', text: 'one' }] },
					{ blocks: [{ type: 'paragraph', text: 'two' }] },
				],
			},
		]);

		expect(
			blocks(parseRichHtml('<ol start="3" type="a"><li>x</li><li>y</li></ol>')),
		).toEqual([
			{
				type: 'list',
				items: [
					{ blocks: [{ type: 'paragraph', text: 'x' }], value: 3, type: 'a' },
					{ blocks: [{ type: 'paragraph', text: 'y' }], value: 4, type: 'a' },
				],
			},
		]);

		expect(
			blocks(
				parseRichHtml(
					'<ul><li><input type="checkbox" checked>done</li><li><input type="checkbox">open</li></ul>',
				),
			),
		).toEqual([
			{
				type: 'list',
				items: [
					{
						blocks: [{ type: 'paragraph', text: 'done' }],
						has_checkbox: true,
						is_checked: true,
					},
					{ blocks: [{ type: 'paragraph', text: 'open' }], has_checkbox: true },
				],
			},
		]);
	});

	it('should parse media blocks and pick the type from the URL', () => {
		expect(
			blocks(
				parseRichHtml(
					'<img src="https://x/photo.jpg"/><video src="https://x/video.mp4"></video><video src="https://x/animation.gif"></video><audio src="https://x/audio.mp3"></audio><audio src="https://x/audio.ogg"></audio><tg-document src="https://x/doc.zip"></tg-document>',
				),
			),
		).toEqual([
			{ type: 'photo', photo: { type: 'photo', media: 'https://x/photo.jpg' } },
			{ type: 'video', video: { type: 'video', media: 'https://x/video.mp4' } },
			{
				type: 'animation',
				animation: { type: 'animation', media: 'https://x/animation.gif' },
			},
			{ type: 'audio', audio: { type: 'audio', media: 'https://x/audio.mp3' } },
			{
				type: 'voice_note',
				voice_note: { type: 'voice_note', media: 'https://x/audio.ogg' },
			},
			{ type: 'document', document: { type: 'document', media: 'https://x/doc.zip' } },
		] satisfies TT.InputRichBlock<never>[]);
	});

	it('should read a figure caption, credit and spoiler', () => {
		expect(
			blocks(
				parseRichHtml(
					'<figure><img src="https://x/a.jpg" tg-spoiler/><figcaption>Caption<cite>Credit</cite></figcaption></figure>',
				),
			),
		).toEqual([
			{
				type: 'photo',
				photo: { type: 'photo', media: 'https://x/a.jpg', has_spoiler: true },
				caption: { text: 'Caption', credit: 'Credit' },
			},
		]);
	});

	it('should parse maps with documented size defaults', () => {
		expect(blocks(parseRichHtml('<tg-map lat="41.9" long="12.5" zoom="14"/>'))).toEqual([
			{
				type: 'map',
				location: { latitude: 41.9, longitude: 12.5 },
				zoom: 14,
				width: DEFAULT_MAP_WIDTH,
				height: DEFAULT_MAP_HEIGHT,
			},
		]);
		expect(
			blocks(
				parseRichHtml('<tg-map lat="1" long="2" zoom="15" width="100" height="50"/>'),
			)[0],
		).toMatchObject({ width: 100, height: 50 });
		expect(() => parseRichHtml('<tg-map zoom="14"/>')).toThrow(ParseError);
	});

	it('should parse collages and slideshows', () => {
		expect(
			blocks(
				parseRichHtml(
					'<tg-collage><img src="https://x/a.jpg"/><img src="https://x/b.jpg"/><figcaption>Trip</figcaption></tg-collage><tg-slideshow><img src="https://x/a.jpg"/></tg-slideshow>',
				),
			),
		).toEqual([
			{
				type: 'collage',
				blocks: [
					{ type: 'photo', photo: { type: 'photo', media: 'https://x/a.jpg' } },
					{ type: 'photo', photo: { type: 'photo', media: 'https://x/b.jpg' } },
				],
				caption: { text: 'Trip' },
			},
			{
				type: 'slideshow',
				blocks: [{ type: 'photo', photo: { type: 'photo', media: 'https://x/a.jpg' } }],
			},
		] satisfies TT.InputRichBlock<never>[]);
	});

	it('should parse tables', () => {
		expect(
			blocks(
				parseRichHtml(
					'<table bordered striped compact><caption>Cap</caption><tr><th>H</th></tr><tr><td colspan="2" align="right" valign="middle">V</td><td></td></tr></table>',
				),
			),
		).toEqual([
			{
				type: 'table',
				cells: [
					[{ text: 'H', align: 'left', valign: 'top', is_header: true }],
					[
						{ text: 'V', align: 'right', valign: 'middle', colspan: 2 },
						{ align: 'left', valign: 'top' },
					],
				],
				is_bordered: true,
				is_striped: true,
				is_compact: true,
				caption: 'Cap',
			},
		] satisfies TT.InputRichBlock<never>[]);
	});

	it('should parse details, formulas and anchors', () => {
		expect(
			blocks(
				parseRichHtml(
					'<details open><summary>Title</summary><p>Content</p></details><tg-math-block>E = mc^2</tg-math-block><a name="top"></a>',
				),
			),
		).toEqual([
			{
				type: 'details',
				summary: 'Title',
				blocks: [{ type: 'paragraph', text: 'Content' }],
				is_open: true,
			},
			{ type: 'mathematical_expression', expression: 'E = mc^2' },
			{ type: 'anchor', name: 'top' },
		] satisfies TT.InputRichBlock<never>[]);
	});

	it('should parse a button row', () => {
		expect(
			blocks(
				parseRichHtml(
					'<tg-button-row align="center"><tg-button type="callback_data" data="cb">go</tg-button><tg-button type="disabled">no</tg-button></tg-button-row>',
				),
			),
		).toEqual([
			{
				type: 'buttons',
				buttons: [
					{ text: 'go', callback_data: 'cb' },
					{ text: 'no', disabled: {} },
				],
				align: 'center',
			},
		]);
	});

	it('should parse every button type', () => {
		const row = blocks(
			parseRichHtml(
				'<tg-button-row>' +
					'<tg-button type="url" url="https://t.me">a</tg-button>' +
					'<tg-button type="web_app" url="https://t.me">b</tg-button>' +
					'<tg-button type="login_url" url="https://t.me" forward-text="f" request-write-access>c</tg-button>' +
					'<tg-button type="switch_inline_query" query="q">d</tg-button>' +
					'<tg-button type="switch_inline_query_current_chat" query="q">e</tg-button>' +
					'<tg-button type="switch_inline_query_chosen_chat" query="q" allow-user-chats>f</tg-button>' +
					'<tg-button type="copy_text" text="c">g</tg-button>' +
					'</tg-button-row>',
			),
		)[0];

		expect(row).toEqual({
			type: 'buttons',
			buttons: [
				{ text: 'a', url: 'https://t.me' },
				{ text: 'b', web_app: { url: 'https://t.me' } },
				{
					text: 'c',
					login_url: {
						url: 'https://t.me',
						forward_text: 'f',
						request_write_access: true,
					},
				},
				{ text: 'd', switch_inline_query: 'q' },
				{ text: 'e', switch_inline_query_current_chat: 'q' },
				{
					text: 'f',
					switch_inline_query_chosen_chat: { query: 'q', allow_user_chats: true },
				},
				{ text: 'g', copy_text: { text: 'c' } },
			],
		} satisfies TT.InputRichBlock<never>);

		expect(() =>
			parseRichHtml('<tg-button-row><tg-button>x</tg-button></tg-button-row>'),
		).toThrow(ParseError);
	});

	it('should decode the wider rich reference set', () => {
		expect(parseRichText('&nbsp;&hellip;&mdash;&apos;')).toBe(" …—'");
	});

	it('should carry message-level options', () => {
		expect(parseRichHtml('<p>x</p>', { is_rtl: true })).toEqual({
			blocks: [{ type: 'paragraph', text: 'x' }],
			is_rtl: true,
		});
		expect(parseRichHtml('<p>x</p>')).not.toHaveProperty('is_rtl');
	});

	it('should reject malformed markup', () => {
		expect(() => parseRichHtml('<p>x')).toThrow("Can't find end tag");
		expect(() => parseRichHtml('x</p>')).toThrow('Unexpected end tag');
	});
});

describe('parseRichMarkdown', () => {
	it('should parse headings and paragraphs', () => {
		expect(blocks(parseRichMarkdown('# Title\n\nBody with **bold**.'))).toEqual([
			{ type: 'heading', text: 'Title', size: 1 },
			{ type: 'paragraph', text: ['Body with ', { type: 'bold', text: 'bold' }, '.'] },
		]);
	});

	it('should parse every inline delimiter', () => {
		expect(
			blocks(parseRichMarkdown('**b** __b2__ *i* _i2_ ~~s~~ ==m== ||sp|| `c` $x^2$'))[0],
		).toEqual({
			type: 'paragraph',
			text: [
				{ type: 'bold', text: 'b' },
				' ',
				{ type: 'bold', text: 'b2' },
				' ',
				{ type: 'italic', text: 'i' },
				' ',
				{ type: 'italic', text: 'i2' },
				' ',
				{ type: 'strikethrough', text: 's' },
				' ',
				{ type: 'marked', text: 'm' },
				' ',
				{ type: 'spoiler', text: 'sp' },
				' ',
				{ type: 'code', text: 'c' },
				' ',
				{ type: 'mathematical_expression', expression: 'x^2' },
			],
		});
	});

	it('should honour backslash escapes', () => {
		expect(blocks(parseRichMarkdown('\\*not italic\\*'))).toEqual([
			{ type: 'paragraph', text: '*not italic*' },
		]);
	});

	it('should parse links and inline media syntax', () => {
		expect(blocks(parseRichMarkdown('[t](https://t.me/)'))[0]).toEqual({
			type: 'paragraph',
			text: { type: 'url', text: 't', url: 'https://t.me/' },
		});
		expect(
			blocks(parseRichMarkdown('![\u{1f44d}](tg://emoji?id=5368324170671202286)'))[0],
		).toEqual({
			type: 'paragraph',
			text: {
				type: 'custom_emoji',
				custom_emoji_id: '5368324170671202286',
				alternative_text: '\u{1f44d}',
			},
		});
		expect(
			blocks(parseRichMarkdown('![soon](tg://time?unix=1647531900&format=wDT)'))[0],
		).toEqual({
			type: 'paragraph',
			text: {
				type: 'date_time',
				text: 'soon',
				unix_time: 1647531900,
				date_time_format: 'wDT',
			},
		});
	});

	it('should parse fenced code and formulas', () => {
		expect(blocks(parseRichMarkdown('```python\nprint(1)\n```'))).toEqual([
			{ type: 'pre', text: 'print(1)', language: 'python' },
		]);
		expect(blocks(parseRichMarkdown('```\nplain\n```'))).toEqual([
			{ type: 'pre', text: 'plain' },
		]);
		expect(blocks(parseRichMarkdown('```math\nE = mc^2\n```'))).toEqual([
			{ type: 'mathematical_expression', expression: 'E = mc^2' },
		]);
		expect(blocks(parseRichMarkdown('$$E = mc^2$$'))).toEqual([
			{ type: 'mathematical_expression', expression: 'E = mc^2' },
		]);
	});

	it('should parse thematic breaks', () => {
		expect(blocks(parseRichMarkdown('a\n\n---\n\nb'))).toEqual([
			{ type: 'paragraph', text: 'a' },
			{ type: 'divider' },
			{ type: 'paragraph', text: 'b' },
		]);
	});

	it('should parse lists, including task lists', () => {
		expect(blocks(parseRichMarkdown('- one\n- two'))).toEqual([
			{
				type: 'list',
				items: [
					{ blocks: [{ type: 'paragraph', text: 'one' }] },
					{ blocks: [{ type: 'paragraph', text: 'two' }] },
				],
			},
		]);
		expect(blocks(parseRichMarkdown('1. one\n2. two'))).toEqual([
			{
				type: 'list',
				items: [
					{ blocks: [{ type: 'paragraph', text: 'one' }], value: 1, type: '1' },
					{ blocks: [{ type: 'paragraph', text: 'two' }], value: 2, type: '1' },
				],
			},
		]);
		expect(blocks(parseRichMarkdown('- [ ] open\n- [x] done'))).toEqual([
			{
				type: 'list',
				items: [
					{ blocks: [{ type: 'paragraph', text: 'open' }], has_checkbox: true },
					{
						blocks: [{ type: 'paragraph', text: 'done' }],
						has_checkbox: true,
						is_checked: true,
					},
				],
			},
		]);
	});

	it('should parse block quotations', () => {
		expect(blocks(parseRichMarkdown('>a\n>\n>b'))).toEqual([
			{
				type: 'blockquote',
				blocks: [
					{ type: 'paragraph', text: 'a' },
					{ type: 'paragraph', text: 'b' },
				],
			},
		]);
	});

	it('should parse tables with alignment', () => {
		expect(blocks(parseRichMarkdown('| H1 | H2 |\n|:---|---:|\n| a | b |'))).toEqual([
			{
				type: 'table',
				cells: [
					[
						{ text: 'H1', align: 'left', valign: 'top', is_header: true },
						{ text: 'H2', align: 'right', valign: 'top', is_header: true },
					],
					[
						{ text: 'a', align: 'left', valign: 'top' },
						{ text: 'b', align: 'right', valign: 'top' },
					],
				],
			},
		] satisfies TT.InputRichBlock<never>[]);
	});

	it('should parse media lines', () => {
		expect(blocks(parseRichMarkdown('![](https://x/photo.jpg)'))).toEqual([
			{ type: 'photo', photo: { type: 'photo', media: 'https://x/photo.jpg' } },
		]);
		expect(blocks(parseRichMarkdown('![](https://x/video.mp4 "Video caption")'))).toEqual(
			[
				{
					type: 'video',
					video: { type: 'video', media: 'https://x/video.mp4' },
					caption: { text: 'Video caption' },
				},
			],
		);
		expect(blocks(parseRichMarkdown('![](https://x/audio.ogg)'))).toEqual([
			{
				type: 'voice_note',
				voice_note: { type: 'voice_note', media: 'https://x/audio.ogg' },
			},
		]);
	});

	it('should map footnotes onto references', () => {
		expect(blocks(parseRichMarkdown('See[^n1].\n\n[^n1]: The note.'))).toEqual([
			{
				type: 'paragraph',
				text: ['See', { type: 'reference_link', text: 'n1', reference_name: 'n1' }, '.'],
			},
			{
				type: 'footer',
				text: { type: 'reference', text: 'The note.', name: 'n1' },
			},
		] satisfies TT.InputRichBlock<never>[]);
	});

	it('should pass embedded HTML through', () => {
		expect(blocks(parseRichMarkdown('text with <u>underline</u> inline'))).toEqual([
			{
				type: 'paragraph',
				text: ['text with ', { type: 'underline', text: 'underline' }, ' inline'],
			},
		]);
	});

	it('should translate Markdown inside a details body', () => {
		expect(
			blocks(
				parseRichMarkdown(
					'<details open><summary>Title</summary>\n\n### Inner\n\n</details>',
				),
			),
		).toEqual([
			{
				type: 'details',
				summary: 'Title',
				blocks: [{ type: 'heading', text: 'Inner', size: 3 }],
				is_open: true,
			},
		]);
	});

	it('should reject inline media', () => {
		expect(() => parseRichMarkdown('text ![x](https://x/a.jpg) more')).toThrow(
			ParseError,
		);
	});

	it('should expose the intermediate HTML', () => {
		expect(richMarkdownToHtml('# T')).toBe('<h1>T</h1>');
	});
});
