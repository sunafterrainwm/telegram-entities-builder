import type * as TT from '@grammyjs/types';
import { describe, expect, it } from '@jest/globals';

import {
	RichBlockBuilder,
	RichListBuilder,
	unwrapRichBlocks,
} from '../../src/rich-message/block.ts';
import { RichTextBuilder, button, fr } from '../../src/rich-message/text.ts';

describe('unwrapRichBlocks', () => {
	it('should wrap a single block', () => {
		expect(unwrapRichBlocks({ type: 'divider' })).toEqual([{ type: 'divider' }]);
	});

	it('should flatten nested arrays and builders', () => {
		const nested = new RichBlockBuilder().paragraph('inner');
		expect(
			unwrapRichBlocks([{ type: 'divider' }, [nested, [{ type: 'divider' }]]]),
		).toEqual([
			{ type: 'divider' },
			{ type: 'paragraph', text: 'inner' },
			{ type: 'divider' },
		]);
	});
});

describe('RichBlockBuilder', () => {
	it('should accumulate text blocks', () => {
		const builder = new RichBlockBuilder()
			.paragraph('Hello paragraph')
			.heading('Hello heading')
			.heading('Smaller', 3)
			.divider()
			.preformatted('const x = 1;', 'javascript')
			.preformatted('bare')
			.footer('bye')
			.mathematicalExpression('E = mc^2')
			.anchor('top')
			.thinking('…');

		expect(builder.build()).toEqual([
			{ type: 'paragraph', text: 'Hello paragraph' },
			{ type: 'heading', text: 'Hello heading', size: 1 },
			{ type: 'heading', text: 'Smaller', size: 3 },
			{ type: 'divider' },
			{ type: 'pre', text: 'const x = 1;', language: 'javascript' },
			{ type: 'pre', text: 'bare' },
			{ type: 'footer', text: 'bye' },
			{ type: 'mathematical_expression', expression: 'E = mc^2' },
			{ type: 'anchor', name: 'top' },
			{ type: 'thinking', text: '…' },
		] satisfies TT.InputRichBlock<never>[]);
	});

	it('should omit language when none is given', () => {
		const [block] = new RichBlockBuilder().preformatted('x').build();
		expect(block).not.toHaveProperty('language');
	});

	it('should resolve rich text through builders and templates', () => {
		const builder = new RichBlockBuilder()
			.paragraph(fr`Hello ${fr.bold`world`}`)
			.heading(new RichTextBuilder().italic('titled'), 2);

		expect(builder.build()).toEqual([
			{ type: 'paragraph', text: ['Hello ', { type: 'bold', text: 'world' }] },
			{ type: 'heading', text: { type: 'italic', text: 'titled' }, size: 2 },
		]);
	});

	it('should build quotation blocks', () => {
		const builder = new RichBlockBuilder()
			.blockquote({ type: 'paragraph', text: 'quoted' }, { credit: 'Someone' })
			.blockquote({ type: 'paragraph', text: 'uncredited' })
			.expandableBlockquote('hidden', { credit: fr.italic`Author` })
			.pullquote('centered', { credit: 'Author' })
			.pullquote('plain');

		expect(builder.build()).toEqual([
			{
				type: 'blockquote',
				blocks: [{ type: 'paragraph', text: 'quoted' }],
				credit: 'Someone',
			},
			{ type: 'blockquote', blocks: [{ type: 'paragraph', text: 'uncredited' }] },
			{
				type: 'expandable_blockquote',
				text: 'hidden',
				credit: { type: 'italic', text: 'Author' },
			},
			{ type: 'pullquote', text: 'centered', credit: 'Author' },
			{ type: 'pullquote', text: 'plain' },
		] satisfies TT.InputRichBlock<never>[]);
	});

	it('should build lists from items, a builder or a callback', () => {
		const fromCallback = new RichBlockBuilder()
			.list((list) => {
				list.text('plain');
				list.text('checked', { is_checked: true });
				list.text('unchecked', { has_checkbox: true });
				list.item({ type: 'divider' }, { type: '1', value: 3 });
			})
			.build();

		expect(fromCallback).toEqual([
			{
				type: 'list',
				items: [
					{ blocks: [{ type: 'paragraph', text: 'plain' }] },
					{
						blocks: [{ type: 'paragraph', text: 'checked' }],
						has_checkbox: true,
						is_checked: true,
					},
					{ blocks: [{ type: 'paragraph', text: 'unchecked' }], has_checkbox: true },
					{ blocks: [{ type: 'divider' }], value: 3, type: '1' },
				],
			},
		] satisfies TT.InputRichBlock<never>[]);

		const list = new RichListBuilder().text('one');
		expect(new RichBlockBuilder().list(list).build()).toEqual([
			{ type: 'list', items: [{ blocks: [{ type: 'paragraph', text: 'one' }] }] },
		]);
		expect(new RichBlockBuilder().list(list.build()).build()).toEqual([
			{ type: 'list', items: [{ blocks: [{ type: 'paragraph', text: 'one' }] }] },
		]);
	});

	it('should build captioned container blocks', () => {
		const photo: TT.InputRichBlock<never> = {
			type: 'photo',
			photo: { type: 'photo', media: 'file-id' },
		};

		const builder = new RichBlockBuilder()
			.collage([photo, photo], { caption: 'Trip', credit: 'Me' })
			.slideshow([photo], { credit: 'Me' })
			.slideshow([photo]);

		expect(builder.build()).toEqual([
			{
				type: 'collage',
				blocks: [photo, photo],
				caption: { text: 'Trip', credit: 'Me' },
			},
			{ type: 'slideshow', blocks: [photo], caption: { text: '', credit: 'Me' } },
			{ type: 'slideshow', blocks: [photo] },
		] satisfies TT.InputRichBlock<never>[]);
	});

	it('should fill table cell alignment defaults', () => {
		const builder = new RichBlockBuilder().table(
			[
				[
					{ text: 'Metric', is_header: true },
					{ text: 'Value', is_header: true, align: 'right' },
				],
				['Speed', { text: '42', align: 'right', valign: 'middle', colspan: 2 }],
				[{}],
			],
			{ is_bordered: true, is_compact: true, caption: 'Results' },
		);

		expect(builder.build()).toEqual([
			{
				type: 'table',
				cells: [
					[
						{ text: 'Metric', is_header: true, align: 'left', valign: 'top' },
						{ text: 'Value', is_header: true, align: 'right', valign: 'top' },
					],
					[
						{ text: 'Speed', align: 'left', valign: 'top' },
						{ text: '42', align: 'right', valign: 'middle', colspan: 2 },
					],
					[{ align: 'left', valign: 'top' }],
				],
				is_bordered: true,
				is_compact: true,
				caption: 'Results',
			},
		] satisfies TT.InputRichBlock<never>[]);
	});

	it('should treat a rich text node as cell text rather than a cell initializer', () => {
		const [block] = new RichBlockBuilder()
			.table([[{ type: 'bold', text: 'b' }, new RichTextBuilder().italic('i')]])
			.build();

		expect(block).toEqual({
			type: 'table',
			cells: [
				[
					{ text: { type: 'bold', text: 'b' }, align: 'left', valign: 'top' },
					{ text: { type: 'italic', text: 'i' }, align: 'left', valign: 'top' },
				],
			],
		});
	});

	it('should build details blocks', () => {
		const builder = new RichBlockBuilder()
			.details('More', { type: 'paragraph', text: 'inner' })
			.details('Open', { type: 'paragraph', text: 'inner' }, { is_open: true });

		expect(builder.build()).toEqual([
			{
				type: 'details',
				summary: 'More',
				blocks: [{ type: 'paragraph', text: 'inner' }],
			},
			{
				type: 'details',
				summary: 'Open',
				blocks: [{ type: 'paragraph', text: 'inner' }],
				is_open: true,
			},
		] satisfies TT.InputRichBlock<never>[]);
	});

	it('should build map blocks', () => {
		const builder = new RichBlockBuilder().map(
			{ latitude: 1, longitude: 2 },
			{ zoom: 16, width: 600, height: 400, caption: 'Here' },
		);

		expect(builder.build()).toEqual([
			{
				type: 'map',
				location: { latitude: 1, longitude: 2 },
				zoom: 16,
				width: 600,
				height: 400,
				caption: { text: 'Here' },
			},
		] satisfies TT.InputRichBlock<never>[]);
	});

	it('should accept media as a bare file reference or a full InputMedia', () => {
		const builder = new RichBlockBuilder()
			.photo('photo-id', { caption: 'Pic' })
			.photo({ type: 'photo', media: 'photo-id', has_spoiler: true })
			.video('video-id')
			.animation('animation-id')
			.audio('audio-id')
			.document('document-id')
			.voiceNote('voice-id');

		expect(builder.build()).toEqual([
			{
				type: 'photo',
				photo: { type: 'photo', media: 'photo-id' },
				caption: { text: 'Pic' },
			},
			{ type: 'photo', photo: { type: 'photo', media: 'photo-id', has_spoiler: true } },
			{ type: 'video', video: { type: 'video', media: 'video-id' } },
			{ type: 'animation', animation: { type: 'animation', media: 'animation-id' } },
			{ type: 'audio', audio: { type: 'audio', media: 'audio-id' } },
			{ type: 'document', document: { type: 'document', media: 'document-id' } },
			{ type: 'voice_note', voice_note: { type: 'voice_note', media: 'voice-id' } },
		] satisfies TT.InputRichBlock<never>[]);
	});

	it('should build button rows', () => {
		const builder = new RichBlockBuilder()
			.buttons([button.url('Docs', 'https://example.com')], { align: 'center' })
			.buttons([button.callback('Go', 'go', 'primary'), button.disabled('Nope')]);

		expect(builder.build()).toEqual([
			{
				type: 'buttons',
				buttons: [{ text: 'Docs', url: 'https://example.com' }],
				align: 'center',
			},
			{
				type: 'buttons',
				buttons: [
					{ text: 'Go', callback_data: 'go', style: 'primary' },
					{ text: 'Nope', disabled: {} },
				],
			},
		] satisfies TT.InputRichBlock<never>[]);
	});

	it('should support addBlock, addBlocks and add', () => {
		const builder = new RichBlockBuilder()
			.addBlock({ type: 'divider' })
			.addBlocks({ type: 'divider' }, { type: 'divider' })
			.add(new RichBlockBuilder().paragraph('added'));

		expect(builder.blocks).toHaveLength(4);
		expect(builder.blocks[3]).toEqual({ type: 'paragraph', text: 'added' });
	});

	it('should report emptiness and snapshot its blocks', () => {
		const builder = new RichBlockBuilder();
		expect(builder.isEmpty).toBe(true);

		builder.divider();
		expect(builder.isEmpty).toBe(false);

		const snapshot = builder.blocks;
		snapshot.push({ type: 'divider' });
		expect(builder.blocks).toHaveLength(1);
	});

	it('should support cloning', () => {
		const builder = new RichBlockBuilder().paragraph('original');
		const cloned = builder.clone();
		cloned.paragraph('cloned');

		expect(builder.build()).toHaveLength(1);
		expect(cloned.build()).toHaveLength(2);
		expect(cloned.isFork).toBe(false);
	});

	it('should support fork and merge', () => {
		const parent = new RichBlockBuilder().paragraph('start');

		const child = parent.fork();
		expect(child.isFork).toBe(true);
		expect(child.parent).toBe(parent);

		child.heading('child');
		child.merge();

		expect(child.isFork).toBe(false);
		expect(child.parent).toBeUndefined();
		expect(() => {
			child.merge();
		}).toThrow('Cannot merge: This builder is not a fork or has already been merged.');

		parent.paragraph('end');

		expect(parent.build()).toEqual([
			{ type: 'paragraph', text: 'start' },
			{ type: 'heading', text: 'child', size: 1 },
			{ type: 'paragraph', text: 'end' },
		]);
	});
});
