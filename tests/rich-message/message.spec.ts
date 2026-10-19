import type * as TT from '@grammyjs/types';
import { describe, expect, it } from '@jest/globals';

import { RichMessageBuilder } from '../../src/rich-message/message.ts';
import { fr } from '../../src/rich-message/text.ts';

describe('RichMessageBuilder', () => {
	it('should build a payload out of blocks rather than HTML', () => {
		const builder = new RichMessageBuilder();
		builder.heading(fr`Welcome ${fr.bold`User`}`, 2);
		builder.paragraph('Enjoy the builder.');

		expect(builder.buildMessage()).toEqual({
			blocks: [
				{
					type: 'heading',
					text: ['Welcome ', { type: 'bold', text: 'User' }],
					size: 2,
				},
				{ type: 'paragraph', text: 'Enjoy the builder.' },
			],
		} satisfies TT.InputRichMessage<never>);
	});

	it('should emit an empty block list for an empty builder', () => {
		expect(new RichMessageBuilder().buildMessage()).toEqual({ blocks: [] });
	});

	it('should only emit the options that were set', () => {
		expect(new RichMessageBuilder().buildMessage()).not.toHaveProperty('is_rtl');

		const builder = new RichMessageBuilder({
			is_rtl: true,
			skip_entity_detection: false,
		});
		builder.paragraph('text');

		const message = builder.buildMessage();
		expect(message.is_rtl).toBe(true);
		expect(message.skip_entity_detection).toBe(false);
	});

	it('should never emit html or markdown', () => {
		const builder = new RichMessageBuilder();
		builder.paragraph('<b>not escaped, not serialized</b>');

		const message = builder.buildMessage();
		expect(message).not.toHaveProperty('html');
		expect(message).not.toHaveProperty('markdown');
		expect(message.blocks?.[0]).toEqual({
			type: 'paragraph',
			text: '<b>not escaped, not serialized</b>',
		});
	});

	it('should build inline query result content', () => {
		const builder = new RichMessageBuilder();
		builder.paragraph('inline');

		expect(builder.buildInline()).toEqual({
			rich_message: { blocks: [{ type: 'paragraph', text: 'inline' }] },
		} satisfies TT.InputRichMessageContent);
	});

	it('should clone blocks and options', () => {
		const builder = new RichMessageBuilder({ skip_entity_detection: true });
		builder.paragraph('original');

		const cloned = builder.clone();
		cloned.paragraph('cloned');

		expect(builder.build()).toHaveLength(1);
		expect(cloned.build()).toHaveLength(2);
		expect(cloned.options.skip_entity_detection).toBe(true);

		cloned.options.skip_entity_detection = false;
		expect(builder.options.skip_entity_detection).toBe(true);
	});

	it('should accept nested builders as block content', () => {
		const nested = new RichMessageBuilder();
		nested.paragraph('nested content');

		const builder = new RichMessageBuilder();
		builder.blockquote(nested, { credit: 'Credit' });
		builder.details('Summary', nested);

		expect(builder.build()).toEqual([
			{
				type: 'blockquote',
				blocks: [{ type: 'paragraph', text: 'nested content' }],
				credit: 'Credit',
			},
			{
				type: 'details',
				summary: 'Summary',
				blocks: [{ type: 'paragraph', text: 'nested content' }],
			},
		] satisfies TT.InputRichBlock<never>[]);
	});

	it('should support fork and merge inherited from RichBlockBuilder', () => {
		const parent = new RichMessageBuilder();
		parent.paragraph('start');

		const child = parent.fork();
		child.paragraph('forked');
		child.merge();

		expect(parent.buildMessage().blocks).toHaveLength(2);
	});
});
