import type * as TT from '@grammyjs/types';
import { describe, expect, it } from '@jest/globals';

import {
	EntityBuilder,
	RichMessageBuilder,
	parseHtml,
	parseMarkdownV2,
	parseRichMarkdown,
} from '../../src/index.ts';

describe('parsing into a builder', () => {
	it('should load parsed text and entities and then slice them', () => {
		const { text, entities } = parseHtml('Hello <b>big <i>world</i></b>!');

		const builder = new EntityBuilder();
		builder.mergeContent(text, entities);

		expect(builder.buildText()).toEqual({
			text: 'Hello big world!',
			entities: [
				{ type: 'bold', offset: 6, length: 9 },
				{ type: 'italic', offset: 10, length: 5 },
			],
		});

		// Keep only "world" and the entities recalculate.
		expect(builder.slice(10, 15).buildText()).toEqual({
			text: 'world',
			entities: [
				{ type: 'bold', offset: 0, length: 5 },
				{ type: 'italic', offset: 0, length: 5 },
			],
		});
	});

	it('should wrap parsed content in another entity', () => {
		const { text, entities } = parseMarkdownV2('*bold*');

		const builder = new EntityBuilder();
		builder.addText('see: ');
		builder.mergeContent(text, entities, [{ type: 'spoiler' }]);

		expect(builder.buildText()).toEqual({
			text: 'see: bold',
			entities: [
				{ type: 'spoiler', offset: 5, length: 4 },
				{ type: 'bold', offset: 5, length: 4 },
			],
		});
	});

	it('should parse rich markup and keep building on top of it', () => {
		const parsed = parseRichMarkdown('# Title\n\nBody.');

		const builder = new RichMessageBuilder({ is_rtl: false });
		builder.add(parsed.blocks ?? []);
		builder.divider();
		builder.footer('Sent by a bot');

		expect(builder.buildMessage()).toEqual({
			blocks: [
				{ type: 'heading', text: 'Title', size: 1 },
				{ type: 'paragraph', text: 'Body.' },
				{ type: 'divider' },
				{ type: 'footer', text: 'Sent by a bot' },
			],
			is_rtl: false,
		} satisfies TT.InputRichMessage<never>);
	});
});
