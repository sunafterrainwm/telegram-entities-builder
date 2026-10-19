import type * as TT from '@grammyjs/types';
import { describe, expect, it } from '@jest/globals';

import {
	RichTextBuilder,
	button,
	formatRichText,
	fr,
	unwrapRichText,
} from '../../src/rich-message/text.ts';

const user: TT.User = { id: 42, is_bot: false, first_name: 'Me' };

describe('unwrapRichText', () => {
	it('should pass plain rich text through', () => {
		expect(unwrapRichText('text')).toBe('text');
		expect(unwrapRichText({ type: 'bold', text: 'b' })).toEqual({
			type: 'bold',
			text: 'b',
		});
	});

	it('should collapse a single node out of its array', () => {
		expect(unwrapRichText([{ type: 'bold', text: 'b' }])).toEqual({
			type: 'bold',
			text: 'b',
		});
		expect(unwrapRichText([])).toEqual([]);
	});

	it('should flatten nested arrays and builders', () => {
		const nested = new RichTextBuilder().add('a').bold('b');
		expect(unwrapRichText(['start ', [nested, ' end']])).toEqual([
			'start ',
			'a',
			{ type: 'bold', text: 'b' },
			' end',
		]);
	});
});

describe('RichTextBuilder', () => {
	it('should build a simple bold and italic text', () => {
		const builder = new RichTextBuilder();
		builder.add('Hello ');
		builder.bold('world');
		builder.italic('!');

		expect(builder.build()).toEqual([
			'Hello ',
			{ type: 'bold', text: 'world' },
			{ type: 'italic', text: '!' },
		]);
	});

	it('should unwrap nested builders', () => {
		const nested = new RichTextBuilder().add('inner');
		const builder = new RichTextBuilder().bold(nested);

		expect(builder.build()).toEqual([{ type: 'bold', text: 'inner' }]);
	});

	it('should add unwrapped arrays correctly', () => {
		const builder = new RichTextBuilder();
		builder.add(['hello ', { type: 'bold', text: 'world' }]);

		expect(builder.build()).toEqual(['hello ', { type: 'bold', text: 'world' }]);
	});

	it('should cover every plain wrapper type', () => {
		const builder = new RichTextBuilder()
			.underline('u')
			.strikethrough('s')
			.spoiler('sp')
			.subscript('sub')
			.superscript('sup')
			.marked('m')
			.code('c');

		expect(builder.build()).toEqual([
			{ type: 'underline', text: 'u' },
			{ type: 'strikethrough', text: 's' },
			{ type: 'spoiler', text: 'sp' },
			{ type: 'subscript', text: 'sub' },
			{ type: 'superscript', text: 'sup' },
			{ type: 'marked', text: 'm' },
			{ type: 'code', text: 'c' },
		] satisfies TT.RichText[]);
	});

	it('should cover every parameterized type', () => {
		const builder = new RichTextBuilder()
			.dateTime('tomorrow', 1647531900, 'wDT')
			.textMention('Me', user)
			.url('here', 'https://example.com')
			.emailAddress('mail', 'a@example.com')
			.phoneNumber('call', '+1-212-555-0123')
			.bankCardNumber('card', '4242424242424242')
			.anchorLink('top', 'anchor')
			.reference('note', 'ref1')
			.referenceLink('see', 'ref1');

		expect(builder.build()).toEqual([
			{
				type: 'date_time',
				text: 'tomorrow',
				unix_time: 1647531900,
				date_time_format: 'wDT',
			},
			{ type: 'text_mention', text: 'Me', user },
			{ type: 'url', text: 'here', url: 'https://example.com' },
			{ type: 'email_address', text: 'mail', email_address: 'a@example.com' },
			{ type: 'phone_number', text: 'call', phone_number: '+1-212-555-0123' },
			{ type: 'bank_card_number', text: 'card', bank_card_number: '4242424242424242' },
			{ type: 'anchor_link', text: 'top', anchor_name: 'anchor' },
			{ type: 'reference', text: 'note', name: 'ref1' },
			{ type: 'reference_link', text: 'see', reference_name: 'ref1' },
		] satisfies TT.RichText[]);
	});

	it('should default auto-detected entity text to the value itself', () => {
		const builder = new RichTextBuilder()
			.mention('user')
			.hashtag('#tag')
			.cashtag('$USD')
			.botCommand('/start')
			.mention('user', 'display');

		expect(builder.build()).toEqual([
			{ type: 'mention', text: 'user', username: 'user' },
			{ type: 'hashtag', text: '#tag', hashtag: '#tag' },
			{ type: 'cashtag', text: '$USD', cashtag: '$USD' },
			{ type: 'bot_command', text: '/start', bot_command: '/start' },
			{ type: 'mention', text: 'display', username: 'user' },
		] satisfies TT.RichText[]);
	});

	it('should cover standalone nodes', () => {
		const builder = new RichTextBuilder()
			.customEmoji('5368324170671202286', '👍')
			.mathematicalExpression('x^2')
			.anchor('top')
			.button(button.url('Docs', 'https://example.com', 'link'));

		expect(builder.build()).toEqual([
			{
				type: 'custom_emoji',
				custom_emoji_id: '5368324170671202286',
				alternative_text: '👍',
			},
			{ type: 'mathematical_expression', expression: 'x^2' },
			{ type: 'anchor', name: 'top' },
			{
				type: 'button',
				button: { text: 'Docs', url: 'https://example.com', style: 'link' },
			},
		] satisfies TT.RichText[]);
	});

	it('should report emptiness and snapshot its nodes', () => {
		const builder = new RichTextBuilder();
		expect(builder.isEmpty).toBe(true);

		builder.add('a');
		expect(builder.isEmpty).toBe(false);

		const snapshot = builder.build();
		snapshot.push('b');
		expect(builder.build()).toEqual(['a']);
	});

	it('should collapse a lone node in buildText', () => {
		expect(new RichTextBuilder().bold('b').buildText()).toEqual({
			type: 'bold',
			text: 'b',
		});
		expect(new RichTextBuilder().add('a').bold('b').buildText()).toEqual([
			'a',
			{ type: 'bold', text: 'b' },
		]);
	});

	it('should support cloning', () => {
		const builder = new RichTextBuilder().add('original');
		const cloned = builder.clone();
		cloned.add('cloned');

		expect(builder.build()).toEqual(['original']);
		expect(cloned.build()).toEqual(['original', 'cloned']);
		expect(cloned.isFork).toBe(false);
	});

	it('should support fork and merge', () => {
		const parent = new RichTextBuilder();
		parent.add('start ');

		const child = parent.fork();
		expect(child.isFork).toBe(true);
		expect(child.parent).toBe(parent);

		child.bold('child content');
		child.merge();

		expect(child.isFork).toBe(false);
		expect(child.parent).toBeUndefined();
		expect(() => {
			child.merge();
		}).toThrow('Cannot merge: This builder is not a fork or has already been merged.');

		parent.add(' end');

		expect(parent.build()).toEqual([
			'start ',
			{ type: 'bold', text: 'child content' },
			' end',
		]);
	});

	it('should expose format helpers bound to the instance', () => {
		const builder = new RichTextBuilder();
		expect(builder.fr.bold`bound`).toBe(builder);
		expect(builder.fr.url('https://example.com')`link`).toBe(builder);
		expect(builder.fr.anchor('top')).toBe(builder);

		expect(builder.build()).toEqual([
			{ type: 'bold', text: 'bound' },
			{ type: 'url', text: 'link', url: 'https://example.com' },
			{ type: 'anchor', name: 'top' },
		]);
		expect((builder.fr as unknown as Record<string, unknown>).nope).toBeUndefined();
	});
});

describe('button helpers', () => {
	it('should build every button kind', () => {
		expect(button.url('a', 'https://example.com')).toEqual({
			text: 'a',
			url: 'https://example.com',
		});
		expect(button.callback('a', 'data', 'danger')).toEqual({
			text: 'a',
			callback_data: 'data',
			style: 'danger',
		});
		expect(button.webApp('a', { url: 'https://example.com' })).toEqual({
			text: 'a',
			web_app: { url: 'https://example.com' },
		});
		expect(button.loginUrl('a', { url: 'https://example.com' })).toEqual({
			text: 'a',
			login_url: { url: 'https://example.com' },
		});
		expect(button.switchInline('a', 'q')).toEqual({
			text: 'a',
			switch_inline_query: 'q',
		});
		expect(button.switchInlineCurrentChat('a', 'q')).toEqual({
			text: 'a',
			switch_inline_query_current_chat: 'q',
		});
		expect(button.switchInlineChosenChat('a', { allow_user_chats: true })).toEqual({
			text: 'a',
			switch_inline_query_chosen_chat: { allow_user_chats: true },
		});
		expect(button.copyText('a', 'copied')).toEqual({
			text: 'a',
			copy_text: { text: 'copied' },
		});
		expect(button.copyText('a', { text: 'copied' })).toEqual({
			text: 'a',
			copy_text: { text: 'copied' },
		});
		expect(button.disabled('a')).toEqual({ text: 'a', disabled: {} });
	});

	it('should resolve button text and omit an absent style', () => {
		expect(button.url(fr.bold`a`, 'https://example.com')).toEqual({
			text: { type: 'bold', text: 'a' },
			url: 'https://example.com',
		});
		expect(button.url('a', 'https://example.com')).not.toHaveProperty('style');
	});
});

describe('formatRichText tagged template and format helpers', () => {
	it('should interleave strings and formatted blocks', () => {
		const result =
			formatRichText`This is ${fr.bold`bold`} and ${fr.italic`italic`}!`.build();

		expect(result).toEqual([
			'This is ',
			{ type: 'bold', text: 'bold' },
			' and ',
			{ type: 'italic', text: 'italic' },
			'!',
		]);
	});

	it('should handle nested formatted blocks', () => {
		const result = formatRichText`${fr.bold`Bold and ${fr.italic`italic`}`}`.build();

		expect(result).toEqual([
			{ type: 'bold', text: ['Bold and ', { type: 'italic', text: 'italic' }] },
		]);
	});

	it('should handle formats with arguments like url', () => {
		const result = formatRichText`Click ${fr.url('https://example.com')`here`}`.build();

		expect(result).toEqual([
			'Click ',
			{ type: 'url', url: 'https://example.com', text: 'here' },
		]);
	});

	it('should fall back to the parameter as text', () => {
		expect(fr.url('https://example.com')().build()).toEqual([
			{ type: 'url', url: 'https://example.com', text: 'https://example.com' },
		]);
		expect(fr.bankCardNumber('4242424242424242')().build()).toEqual([
			{
				type: 'bank_card_number',
				bank_card_number: '4242424242424242',
				text: '4242424242424242',
			},
		]);
	});

	it('should support parameterized formats without a fallback', () => {
		expect(fr.textMention(user)`Me`.build()).toEqual([
			{ type: 'text_mention', text: 'Me', user },
		]);
		expect(fr.dateTime(1647531900, 'r')`soon`.build()).toEqual([
			{ type: 'date_time', text: 'soon', unix_time: 1647531900, date_time_format: 'r' },
		]);
		expect(fr.reference('ref1')`note`.build()).toEqual([
			{ type: 'reference', text: 'note', name: 'ref1' },
		]);
	});

	it('should support embedded formats that take no text', () => {
		expect(fr.customEmoji('123', '👍').build()).toEqual([
			{ type: 'custom_emoji', custom_emoji_id: '123', alternative_text: '👍' },
		]);
		expect(fr.mathematicalExpression('x^2').build()).toEqual([
			{ type: 'mathematical_expression', expression: 'x^2' },
		]);
		expect(fr.anchor('top').build()).toEqual([{ type: 'anchor', name: 'top' }]);
		expect(fr.mention('user').build()).toEqual([
			{ type: 'mention', text: 'user', username: 'user' },
		]);
		expect(fr.hashtag('#tag').build()).toEqual([
			{ type: 'hashtag', text: '#tag', hashtag: '#tag' },
		]);
		expect(fr.cashtag('$USD').build()).toEqual([
			{ type: 'cashtag', text: '$USD', cashtag: '$USD' },
		]);
		expect(fr.botCommand('/start').build()).toEqual([
			{ type: 'bot_command', text: '/start', bot_command: '/start' },
		]);
		expect(fr.button(button.disabled('x')).build()).toEqual([
			{ type: 'button', button: { text: 'x', disabled: {} } },
		]);
	});

	it('should allow mixing with RichTextBuilder', () => {
		const builder = new RichTextBuilder().add('built');
		const result = formatRichText`Mix ${builder} and ${fr.bold`tag`}`.build();

		expect(result).toEqual(['Mix ', 'built', ' and ', { type: 'bold', text: 'tag' }]);
	});
});
