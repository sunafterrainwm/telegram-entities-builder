import type * as TT from '@grammyjs/types';
import { describe, expect, it } from '@jest/globals';

import {
	RichBlockBuilder,
	RichListBuilder,
	unwrapRichBlocks,
} from '../../src/rich-message/block.ts';
import { ReadonlyRichBlockRef } from '../../src/rich-message/ref.ts';
import { RichTextBuilder, button, fr } from '../../src/rich-message/text.ts';

describe('unwrapRichBlocks', () => {
	it('should wrap a single block', () => {
		expect(unwrapRichBlocks({ type: 'divider' })).toEqual([{ type: 'divider' }]);
	});

	it('should flatten nested arrays and builders', () => {
		const nested = new RichBlockBuilder();
		nested.paragraph().add('inner');
		expect(
			unwrapRichBlocks([{ type: 'divider' }, [nested, [{ type: 'divider' }]]]),
		).toEqual([
			{ type: 'divider' },
			{ type: 'paragraph', text: 'inner' },
			{ type: 'divider' },
		]);
	});

	it('should wrap a bare rich text builder as a paragraph', () => {
		expect(unwrapRichBlocks(fr`hello ${fr.bold`world`}`)).toEqual([
			{ type: 'paragraph', text: ['hello ', { type: 'bold', text: 'world' }] },
		]);
	});

	it('should wrap a bare list builder as a list', () => {
		const list = new RichListBuilder().text('one');
		expect(unwrapRichBlocks(list)).toEqual([
			{ type: 'list', items: [{ blocks: [{ type: 'paragraph', text: 'one' }] }] },
		]);
	});

	it('should refuse a reference that already holds a position', () => {
		const builder = new RichBlockBuilder();
		const ref = builder.paragraph();
		expect(() => unwrapRichBlocks(ref as never)).toThrow('Cannot add a block reference');
	});
});

describe('RichBlockBuilder', () => {
	it('should accumulate text blocks through their references', () => {
		const builder = new RichBlockBuilder();
		builder.paragraph().add('Hello paragraph');
		builder.heading().add('Hello heading');
		builder.heading(3).add('Smaller');
		builder.divider();
		builder.preformatted({ language: 'javascript' }).add('const x = 1;');
		builder.preformatted().add('bare');
		builder.footer().add('bye');
		builder.mathematicalExpression('E = mc^2');
		builder.anchor('top');
		builder.thinking().add('…');

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
		const builder = new RichBlockBuilder();
		builder.preformatted().add('x');
		const [block] = builder.build();
		expect(block).not.toHaveProperty('language');
	});

	it('should keep a reference writable after the block is in place', () => {
		const builder = new RichBlockBuilder();
		const info = builder.paragraph();
		builder.divider();

		info.bold('Name').add('：').code('debian.iso');

		expect(builder.build()).toEqual([
			{
				type: 'paragraph',
				text: [
					{ type: 'bold', text: 'Name' },
					'：',
					{ type: 'code', text: 'debian.iso' },
				],
			},
			{ type: 'divider' },
		]);
	});

	it('should emit an empty paragraph that was never filled in', () => {
		const builder = new RichBlockBuilder();
		builder.paragraph();
		builder.divider();

		// the Bot API accepts text: [], which is what makes a reserved paragraph legal
		expect(builder.build()).toEqual([
			{ type: 'paragraph', text: [] },
			{ type: 'divider' },
		]);
	});

	it('should resolve rich text through builders and templates', () => {
		const builder = new RichBlockBuilder();
		builder.paragraph().add(fr`Hello ${fr.bold`world`}`);
		builder.heading(2).add(new RichTextBuilder().italic('titled'));

		expect(builder.build()).toEqual([
			{ type: 'paragraph', text: ['Hello ', { type: 'bold', text: 'world' }] },
			{ type: 'heading', text: { type: 'italic', text: 'titled' }, size: 2 },
		]);
	});

	it('should build quotation blocks', () => {
		const builder = new RichBlockBuilder();
		builder.blockquote({ credit: 'Someone' }).addBlock({
			type: 'paragraph',
			text: 'quoted',
		});
		builder.blockquote().addBlock({ type: 'paragraph', text: 'uncredited' });
		builder.expandableBlockquote({ credit: fr.italic`Author` }).add('hidden');
		builder.pullquote({ credit: 'Author' }).add('centered');
		builder.pullquote().add('plain');

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

	it('should build a list through its reference', () => {
		const builder = new RichBlockBuilder();
		const list = builder.list();
		list.text('plain');
		list.text('checked', { is_checked: true });
		list.text('unchecked', { has_checkbox: true });
		list.item({ type: 'divider' }, { type: '1', value: 3 });

		expect(builder.build()).toEqual([
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
	});

	it('should keep filling a list after the block is in place', () => {
		const builder = new RichBlockBuilder();
		const list = builder.list();
		builder.divider();
		list.text('late');

		expect(builder.build()).toEqual([
			{ type: 'list', items: [{ blocks: [{ type: 'paragraph', text: 'late' }] }] },
			{ type: 'divider' },
		]);
	});

	it('should build captioned container blocks', () => {
		const photo: TT.InputRichBlock<never> = {
			type: 'photo',
			photo: { type: 'photo', media: 'file-id' },
		};

		const builder = new RichBlockBuilder();
		builder.collage({ caption: 'Trip', credit: 'Me' }).addBlocks(photo, photo);
		builder.slideshow({ credit: 'Me' }).addBlock(photo);
		builder.slideshow().addBlock(photo);

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
		const builder = new RichBlockBuilder();
		builder.table(
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
		const builder = new RichBlockBuilder();
		builder.table([[{ type: 'bold', text: 'b' }, new RichTextBuilder().italic('i')]]);
		const [block] = builder.build();

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

	it('should build details blocks, with the summary given or written later', () => {
		const builder = new RichBlockBuilder();
		builder.details('More').addBlock({ type: 'paragraph', text: 'inner' });
		const open = builder.details('Open', { is_open: true });
		open.addBlock({ type: 'paragraph', text: 'inner' });
		const late = builder.details();
		late.addBlock({ type: 'paragraph', text: 'inner' });
		late.summary.bold('Later');

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
			{
				type: 'details',
				summary: { type: 'bold', text: 'Later' },
				blocks: [{ type: 'paragraph', text: 'inner' }],
			},
		] satisfies TT.InputRichBlock<never>[]);
	});

	it('should build map blocks', () => {
		const builder = new RichBlockBuilder();
		builder.map(
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
		const builder = new RichBlockBuilder();
		builder.photo('photo-id', { caption: 'Pic' });
		builder.photo({ type: 'photo', media: 'photo-id', has_spoiler: true });
		builder.video('video-id');
		builder.animation('animation-id');
		builder.audio('audio-id');
		builder.document('document-id');
		builder.voiceNote('voice-id');

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
		const builder = new RichBlockBuilder();
		builder.buttons([button.url('Docs', 'https://example.com')], { align: 'center' });
		builder.buttons([button.callback('Go', 'go', 'primary'), button.disabled('Nope')]);

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
		const inner = new RichBlockBuilder();
		inner.paragraph().add('added');

		const builder = new RichBlockBuilder()
			.addBlock({ type: 'divider' })
			.addBlocks({ type: 'divider' }, { type: 'divider' })
			.add(inner);

		const blocks = builder.build();
		expect(blocks).toHaveLength(4);
		expect(blocks[3]).toEqual({ type: 'paragraph', text: 'added' });
	});

	it('should wrap a tagged template passed to add() as a paragraph', () => {
		const builder = new RichBlockBuilder();
		builder.add`plain`;
		builder.add`a${fr.bold`b`}c`;

		expect(builder.build()).toEqual([
			{ type: 'paragraph', text: 'plain' },
			{ type: 'paragraph', text: ['a', { type: 'bold', text: 'b' }, 'c'] },
		]);
	});

	it('should report emptiness and hand back a fresh array each build', () => {
		const builder = new RichBlockBuilder();
		expect(builder.isEmpty).toBe(true);

		builder.divider();
		expect(builder.isEmpty).toBe(false);

		const snapshot = builder.build();
		snapshot.push({ type: 'divider' });
		expect(builder.build()).toHaveLength(1);
	});

	it('should expose the last block as a reference', () => {
		const builder = new RichBlockBuilder();
		expect(builder.lastBlock).toBeUndefined();

		const list = builder.list();
		expect(builder.lastBlock).toBe(list);
		expect(builder.lastBlock?.type).toBe('list');

		builder.addBlock({ type: 'divider' });
		const last = builder.lastBlock;
		expect(last).toBeInstanceOf(ReadonlyRichBlockRef);
		expect(last?.type).toBe('divider');
		expect(last?.isFinished).toBe(true);
	});

	it('should support cloning', () => {
		const builder = new RichBlockBuilder();
		builder.paragraph().add('original');
		const cloned = builder.clone();
		cloned.paragraph().add('cloned');

		expect(builder.build()).toHaveLength(1);
		expect(cloned.build()).toHaveLength(2);
		expect(cloned.isFork).toBe(false);
	});

	it('should support fork and merge, keeping references alive', () => {
		const parent = new RichBlockBuilder();
		parent.paragraph().add('start');

		const child = parent.fork();
		expect(child.isFork).toBe(true);
		expect(child.parent).toBe(parent);

		const heading = child.heading();
		child.merge();
		// written after the merge, through a reference created on the fork
		heading.add('child');

		expect(child.isFork).toBe(false);
		expect(child.parent).toBeUndefined();
		expect(() => {
			child.merge();
		}).toThrow('Cannot merge: This builder is not a fork or has already been merged.');

		parent.paragraph().add('end');

		expect(parent.build()).toEqual([
			{ type: 'paragraph', text: 'start' },
			{ type: 'heading', text: 'child', size: 1 },
			{ type: 'paragraph', text: 'end' },
		]);
	});
});

describe('RichBlockBuilder freezing', () => {
	it('should refuse writes once a reference is finished', () => {
		const builder = new RichBlockBuilder();
		const paragraph = builder.paragraph();
		paragraph.add('kept');
		expect(paragraph.isFinished).toBe(false);

		paragraph.finish();

		expect(paragraph.isFinished).toBe(true);
		expect(() => paragraph.add('too late')).toThrow(
			'Cannot modify a finished block reference',
		);
		expect(builder.build()).toEqual([{ type: 'paragraph', text: 'kept' }]);
	});

	it('should freeze the details summary alone when the summary is finished', () => {
		const builder = new RichBlockBuilder();
		const details = builder.details();
		details.summary.bold('Summary');
		details.addBlock({ type: 'divider' });

		details.summary.finish();

		expect(details.summary.isFinished).toBe(true);
		expect(details.isFinished).toBe(false);
		expect(() => details.summary.add('more')).toThrow(
			'Cannot modify a finished block reference',
		);
		// the block list is untouched
		details.divider();
		expect(builder.build()).toEqual([
			{
				type: 'details',
				summary: { type: 'bold', text: 'Summary' },
				blocks: [{ type: 'divider' }, { type: 'divider' }],
			},
		]);
	});

	it('should cascade finish() down to nested references', () => {
		const builder = new RichBlockBuilder();
		const details = builder.details('Summary');
		const list = details.list();
		list.text('one');

		details.finish();

		expect(list.isFinished).toBe(true);
		expect(() => list.text('two')).toThrow('Cannot modify a finished block reference');
		expect(() => details.summary.add('more')).toThrow(
			'Cannot modify a finished block reference',
		);
	});

	it('should leave the tree writable on a plain build and freeze it on request', () => {
		const builder = new RichBlockBuilder();
		const paragraph = builder.paragraph();
		paragraph.add('a');

		builder.build();
		paragraph.add('b');
		expect(builder.build()).toEqual([{ type: 'paragraph', text: ['a', 'b'] }]);

		builder.build({ finish: true });
		expect(paragraph.isFinished).toBe(true);
		expect(() => paragraph.add('c')).toThrow('Cannot modify a finished block reference');
	});
});

describe('RichBlockBuilder empty-field checks', () => {
	it('should reject an empty heading or footer', () => {
		const heading = new RichBlockBuilder();
		heading.heading();
		expect(() => heading.build()).toThrow('text must not be empty');

		const footer = new RichBlockBuilder();
		footer.footer();
		expect(() => footer.build()).toThrow('text must not be empty');
	});

	it('should reject an empty list, details or list item', () => {
		const list = new RichBlockBuilder();
		list.list();
		expect(() => list.build()).toThrow('items must not be empty');

		const details = new RichBlockBuilder();
		details.details('Summary');
		expect(() => details.build()).toThrow('blocks must not be empty');

		const item = new RichBlockBuilder();
		item.list().addItem({ blocks: [] });
		expect(() => item.build()).toThrow('blocks must not be empty');
	});

	it('should accept an empty details summary, which the Bot API allows', () => {
		const builder = new RichBlockBuilder();
		builder.details().addBlock({ type: 'divider' });
		expect(builder.build()).toEqual([
			{ type: 'details', summary: [], blocks: [{ type: 'divider' }] },
		]);
	});

	it('should skip the checks when asked', () => {
		const builder = new RichBlockBuilder();
		builder.heading();
		expect(builder.build({ checkEmpty: false })).toEqual([
			{ type: 'heading', text: [], size: 1 },
		]);
	});

	it('should look inside nested blocks', () => {
		const builder = new RichBlockBuilder();
		builder.list().item(new RichBlockBuilder().addBlock({ type: 'divider' }));
		const nested = new RichBlockBuilder();
		const details = nested.details('Summary');
		details.heading();
		expect(() => nested.build()).toThrow('text must not be empty');
	});
});

describe('RichBlockBuilder measuring', () => {
	it('should count characters recursively and blocks only at the top level', () => {
		const builder = new RichBlockBuilder();
		builder.paragraph().add('abc');
		const list = builder.list();
		list.text('de');
		list.text('f');

		expect(builder.measureBlock()).toEqual({
			characters: 6,
			topLevelBlocks: 2,
			totalBlocks: 4,
			depth: 2,
			media: 0,
		});
	});

	it('should count code points rather than UTF-16 code units', () => {
		const grin = String.fromCodePoint(0x1f600);
		const builder = new RichBlockBuilder();
		builder.paragraph().add(grin + grin);

		expect(builder.measureBlock().characters).toBe(2);
	});

	it('should count media attachments wherever they are nested', () => {
		const builder = new RichBlockBuilder();
		builder.collage().photo('a');
		builder.photo('b');

		expect(builder.measureBlock().media).toBe(2);
	});

	it('should measure a tree that build() would still reject', () => {
		const builder = new RichBlockBuilder();
		builder.list();

		expect(() => builder.build()).toThrow('items must not be empty');
		expect(builder.measureBlock().topLevelBlocks).toBe(1);
	});

	it('should assert the measured limits only when asked', () => {
		const builder = new RichBlockBuilder();
		builder.paragraph().add('a'.repeat(32769));

		expect(() => builder.build()).not.toThrow();
		expect(() => {
			builder.assertWithinLimits();
		}).toThrow('Rich message characters is 32769, over the limit of 32768');
	});

	it('should accept exactly the measured limits', () => {
		const builder = new RichBlockBuilder();
		builder.paragraph().add('a'.repeat(32768));
		expect(() => {
			builder.assertWithinLimits();
		}).not.toThrow();

		const wide = new RichBlockBuilder();
		for (let i = 0; i < 500; i++) {
			wide.divider();
		}
		expect(() => {
			wide.assertWithinLimits();
		}).not.toThrow();
		wide.divider();
		expect(() => {
			wide.assertWithinLimits();
		}).toThrow('Rich message topLevelBlocks is 501, over the limit of 500');
	});
});

describe('RichListBuilder', () => {
	it('should report emptiness and append ready-made items', () => {
		const list = new RichListBuilder();
		expect(list.isEmpty).toBe(true);

		list.addItem({ blocks: [{ type: 'divider' }] });
		list.addItems({ blocks: [{ type: 'divider' }] }, { blocks: [{ type: 'divider' }] });

		expect(list.isEmpty).toBe(false);
		expect(list.build()).toHaveLength(3);
	});

	it('should support cloning', () => {
		const list = new RichListBuilder().text('original');
		const cloned = list.clone();
		cloned.text('cloned');

		expect(list.build()).toHaveLength(1);
		expect(cloned.build()).toHaveLength(2);
		expect(cloned.isFork).toBe(false);
	});

	it('should support fork and merge', () => {
		const parent = new RichListBuilder().text('start');

		const child = parent.fork();
		expect(child.isFork).toBe(true);
		expect(child.parent).toBe(parent);

		child.text('child');
		child.merge();

		expect(child.isFork).toBe(false);
		expect(() => {
			child.merge();
		}).toThrow('Cannot merge: This builder is not a fork or has already been merged.');

		expect(parent.build()).toEqual([
			{ blocks: [{ type: 'paragraph', text: 'start' }] },
			{ blocks: [{ type: 'paragraph', text: 'child' }] },
		]);
	});

	it('should hand back a fresh array each build', () => {
		const list = new RichListBuilder().text('one');
		const snapshot = list.build();
		snapshot.push({ blocks: [] });
		expect(list.build()).toHaveLength(1);
	});
});
