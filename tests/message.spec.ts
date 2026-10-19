import type * as TT from '@grammyjs/types';
import { describe, expect, it, jest } from '@jest/globals';

import {
	EntityBuilder,
	EntityBuilderProxy,
	type InputCaption,
	type InputInline,
	LazyEntityBuilder,
	MessageBuilder,
	type TextSegment,
	escapeTag,
	f,
	formatText,
} from '../src/index.ts';

describe('EntityBuilder', () => {
	it('should build text payload correctly', () => {
		const builder = new EntityBuilder();
		builder.addText('Hello ');
		builder.addTextEntity('world', { type: 'bold' });

		const payload = builder.buildText();
		expect(payload.text).toBe('Hello world');
		expect(payload.entities).toHaveLength(1);
		expect(payload.entities[0]).toMatchObject({
			type: 'bold',
			offset: 6,
			length: 5,
		} satisfies TT.MessageEntity);
	});

	it('should support addTextEntities', () => {
		const builder = new EntityBuilder();
		builder.addTextEntities('test', [{ type: 'bold' }, { type: 'italic' }]);
		const payload = builder.buildText();
		expect(payload.text).toBe('test');
		expect(payload.entities).toHaveLength(2);
	});

	it('should support addTextSegmentList', () => {
		const builder = new EntityBuilder();
		builder.addTextSegmentList([
			{ text: 'A' },
			{ text: 'B', entity: { type: 'bold' } },
			{ text: 'C', entities: [{ type: 'italic' }] },
		]);
		const payload = builder.buildText();
		expect(payload.text).toBe('ABC');
		expect(payload.entities).toHaveLength(2);
	});

	it('should support buildCaption and buildInline', () => {
		const builder = new EntityBuilder();
		builder.addText('test');
		expect(builder.buildCaption()).toMatchObject({
			caption: 'test',
		} satisfies Partial<InputCaption>);
		expect(builder.buildInline()).toMatchObject({
			message_text: 'test',
		} satisfies Partial<InputInline>);
	});

	it('should support sortEntities', () => {
		const builder = new EntityBuilder();
		builder.addTextEntity('A', { type: 'bold' });
		builder.addTextEntity('B', { type: 'italic' });
		// Reverse order
		const entities = builder.buildText().entities;
		entities.reverse();
		builder.sortEntities();
		expect(builder.buildText().entities[0].type).toBe('bold');
	});

	it('should support slicing', () => {
		const builder = new EntityBuilder();
		builder.addText('Hello ');
		builder.addTextEntity('world', { type: 'bold' });
		builder.addText('!');

		builder.sliceInplace(6, 11);

		const payload = builder.buildText();
		expect(payload.text).toBe('world');
		expect(payload.entities[0]).toMatchObject({
			type: 'bold',
			offset: 0,
			length: 5,
		} satisfies TT.MessageEntity);

		// Test out of bounds
		const b2 = new EntityBuilder();
		b2.addText('abc').sliceInplace(1, 10);
		expect(b2.buildText().text).toBe('bc');

		const b3 = new EntityBuilder();
		b3.addText('abc').sliceInplace(-2);
		expect(b3.buildText().text).toBe('bc');

		const b4 = new EntityBuilder();
		b4.addText('abc').sliceInplace(2, 1);
		expect(b4.buildText().text).toBe('');

		const b5 = new EntityBuilder();
		b5.addTextEntity('abc', { type: 'bold' }).sliceInplace(1, 2);
		expect(b5.buildText().entities[0]).toMatchObject({
			offset: 0,
			length: 1,
		} satisfies Partial<TT.MessageEntity>);

		const b6 = new EntityBuilder();
		b6.addTextEntity('abc', { type: 'bold' }).sliceInplace(5, 10);
		expect(b6.buildText().entities.length).toBe(0);

		// Cover start === undefined
		const b7 = new EntityBuilder();
		b7.addText('abc').sliceInplace(undefined, 2);
		expect(b7.buildText().text).toBe('ab');

		// Cover end === undefined
		const b8 = new EntityBuilder();
		b8.addText('abc').sliceInplace(1, undefined);
		expect(b8.buildText().text).toBe('bc');

		// Cover end < 0
		const b9 = new EntityBuilder();
		b9.addText('abc').sliceInplace(1, -1);
		expect(b9.buildText().text).toBe('b');

		// Cover start < 0 and end < 0 out of bounds
		const b10 = new EntityBuilder();
		b10.addText('abc').sliceInplace(-10, -5);
		expect(b10.buildText().text).toBe('');
	});

	it('should support sliceInplace with no args', () => {
		const builder = new EntityBuilder();
		builder.addText('a').sliceInplace();
		expect(builder.buildText().text).toBe('a');
	});

	it('should support sliceInplace with unordered entities', () => {
		const builder = new EntityBuilder();
		builder.addTextEntity('A', { type: 'bold' });
		builder.addTextEntity('B', { type: 'italic' });
		builder.addTextEntity('C', { type: 'underline' });

		// Manually reverse the internal array to make it unordered
		builder.buildText().entities.reverse();

		// Slice to keep only 'B'
		builder.sliceInplace(1, 2);

		const payload = builder.buildText();
		expect(payload.text).toBe('B');
		expect(payload.entities).toHaveLength(1);
		expect(payload.entities[0]).toMatchObject({
			type: 'italic',
			offset: 0,
			length: 1,
		} satisfies TT.MessageEntity);
	});

	it('should support slice (clone and slice)', () => {
		const builder = new EntityBuilder();
		builder.addText('abc');
		builder.addTextEntity('def', { type: 'bold' });
		const sliced = builder.slice(1);

		// Ensure sliced has modified text
		expect(sliced.buildText().text).toBe('bcdef');

		// Ensure original is not affected
		expect(builder.buildText().text).toBe('abcdef');
		expect(builder.buildText().entities[0].offset).toBe(3);
	});

	it('should support clone without affecting original', () => {
		const builder = new EntityBuilder();
		builder.addText('abc');
		builder.addTextEntity('def', { type: 'italic' });

		const cloned = builder.clone();
		cloned.addText('ghi');
		cloned.sliceInplace(1);

		expect(cloned.buildText().text).toBe('bcdefghi');
		// Original should remain completely unchanged
		const originalPayload = builder.buildText();
		expect(originalPayload.text).toBe('abcdef');
		expect(originalPayload.entities).toHaveLength(1);
		expect(originalPayload.entities[0]).toMatchObject({
			type: 'italic',
			offset: 3,
			length: 3,
		} satisfies TT.MessageEntity);
	});

	it('should support trimStart, trimEnd, trim', () => {
		const builder = new EntityBuilder();
		builder.addText('  abc  ');
		expect(builder.clone().trimStart().buildText().text).toBe('abc  ');
		expect(builder.clone().trimEnd().buildText().text).toBe('  abc');
		expect(builder.clone().trim().buildText().text).toBe('abc');
	});

	it('should support fork and merge', () => {
		const builder = new EntityBuilder();
		builder.addText('parent ');
		const child = builder.fork();
		child.addTextEntity('child', { type: 'bold' });
		child.merge([{ type: 'italic' }]);
		const payload = builder.buildText();
		expect(payload.text).toBe('parent child');
		expect(payload.entities).toHaveLength(2);

		expect(() => {
			child.merge();
		}).toThrow('This builder is not a fork or has already been merged.');
		expect(() => {
			new EntityBuilder().merge();
		}).toThrow('This builder is not a fork or has already been merged.');
	});
});

describe('LazyEntityBuilder', () => {
	it('should flatten to EntityBuilder correctly', () => {
		const lazy = new LazyEntityBuilder();
		lazy.addText('Lazy ');
		lazy.addTextEntity('boy', { type: 'italic' });
		lazy.addTextEntities('!', [{ type: 'bold' }]);
		lazy.addTextSegmentList([{ text: ' ' }]);

		const builder = lazy.flatten();
		const payload = builder.buildText();

		expect(payload.text).toBe('Lazy boy! ');
		expect(payload.entities).toHaveLength(2);
		expect(payload.entities[0].type).toBe('italic');
	});

	it('should support clone, fork and merge', () => {
		const lazy = new LazyEntityBuilder();
		expect(lazy.hasParent).toBe(false);
		lazy.addText('parent ');
		const child = lazy.fork();
		expect(child.hasParent).toBe(true);
		child.addText(''); // empty
		child.addTextEntity('child', { type: 'bold' });
		child.merge([{ type: 'italic' }]);

		const payload = lazy.flatten().buildText();
		expect(payload.text).toBe('parent child');
		expect(payload.entities).toHaveLength(2);

		expect(() => {
			child.merge();
		}).toThrow('This builder is not a fork or has already been merged.');
		expect(() => {
			new LazyEntityBuilder().merge();
		}).toThrow('This builder is not a fork or has already been merged.');

		const cloned = lazy.clone();
		expect(cloned.flatten().buildText().text).toBe('parent child');
	});
});

describe('MessageBuilder (delegated methods)', () => {
	it('should delegate methods', () => {
		const proxy = new MessageBuilder();

		proxy
			.addText('a')
			.addTextEntity('b', { type: 'bold' })
			.addTextEntities('c', [{ type: 'italic' }])
			.addTextSegmentList([{ text: 'd' }]);

		proxy.trimStart().trimEnd().trim().sortEntities();

		const payload = proxy.buildText();
		expect(payload.text).toBe('abcd');

		const sliced = proxy.slice(1);
		expect(sliced.buildText().text).toBe('bcd');

		proxy.sliceInplace(0, 1);
		expect(proxy.buildText().text).toBe('a');

		expect(proxy.buildCaption().caption).toBe('a');
		expect(proxy.buildInline().message_text).toBe('a');

		const forked = proxy.fork();
		forked.addText('e');
		forked.merge();
		expect(proxy.buildText().text).toBe('ae');

		const childProxy = proxy.fork();
		childProxy.addText('f');
		childProxy.merge();
		expect(proxy.buildText().text).toBe('aef');
	});

	it('should support proxy clone', () => {
		const proxy = new MessageBuilder();
		proxy.addText('a');
		const cloned = proxy.clone();
		expect(cloned).toBeInstanceOf(MessageBuilder);
	});
});

describe('EntityBuilderProxy', () => {
	it('should delegate merge and buildText correctly', () => {
		const builder = new EntityBuilder();
		builder.addText('parent ');
		const proxy = new EntityBuilderProxy(builder);
		const child = proxy.fork();
		child.addText('child');

		// Cover proxy.merge()
		const childProxy = new EntityBuilderProxy(child);
		childProxy.merge();
		expect(proxy.buildText().text).toBe('parent child');
	});

	it('should delegate clone correctly', () => {
		const proxy = new EntityBuilderProxy();
		proxy.addText('test');
		const cloned = proxy.clone();
		expect(cloned.buildText().text).toBe('test');
		expect(cloned).not.toBe(proxy);
	});

	it('should call buildText when building caption or inline payload', () => {
		const proxy = new EntityBuilderProxy();
		proxy.addText('test');

		const spy = jest.spyOn(proxy, 'buildText');

		const caption = proxy.buildCaption();
		expect(spy).toHaveBeenCalledTimes(1);
		expect(caption.caption).toBe('test');

		spy.mockClear();

		const inline = proxy.buildInline();
		expect(spy).toHaveBeenCalledTimes(1);
		expect(inline.message_text).toBe('test');
	});
});

describe('MessageBuilder', () => {
	it('should add tags and build payload correctly', () => {
		const composer = new MessageBuilder();
		composer.addText('Content');
		composer.addTags('test', 'jest');

		const payload = composer.buildText();
		expect(payload.text).toBe('Content\n\n#Test #Jest');
	});

	it('should build payloads with link preview options correctly', () => {
		const composer = new MessageBuilder();
		composer.addText('Content');
		composer.linkPreviewOptions = { is_disabled: true };

		const payload = composer.buildText();
		expect(payload.link_preview_options).toEqual({ is_disabled: true });

		const inlinePayload = composer.buildInline();
		expect(inlinePayload.link_preview_options).toEqual({ is_disabled: true });
	});

	it('should not allow nesting an AbstractEntityBuilderProxy', () => {
		const composer = new MessageBuilder();
		// @ts-expect-error TS2345: deliberately pass a MessageBuilder to test error
		expect(() => new MessageBuilder(composer)).toThrow(
			'Cannot nest MessageBuilder inside another MessageBuilder.',
		);
		// @ts-expect-error TS2345: deliberately pass a MessageBuilder to test error
		expect(() => new EntityBuilderProxy(composer)).toThrow(
			'Cannot nest MessageBuilder inside EntityBuilderProxy.',
		);
	});

	it('should not allow wrapping a forked entity builder', () => {
		const builder = new EntityBuilder();
		const child = builder.fork();
		expect(() => new MessageBuilder(child)).toThrow(
			'Cannot wrap a forked entity builder.',
		);
	});

	it('should handle tags correctly', () => {
		const composer = new MessageBuilder();
		composer.addTags('test', 'Test', 'foo-bar', "It's");
		expect(composer.tags).toEqual(['Test', 'FooBar', 'Its']);
	});
});

describe('escapeTag', () => {
	it('should format tags correctly', () => {
		expect(escapeTag("It's-a-test")).toBe('ItsATest');
		expect(escapeTag('hello_world')).toBe('Hello_world');
	});
});

describe('date_time entities', () => {
	it('should build date_time entities', () => {
		const builder = new EntityBuilder();
		builder.dateTime('tomorrow', 1647531900, 'wDT');

		expect(builder.buildText().entities[0]).toEqual({
			type: 'date_time',
			offset: 0,
			length: 8,
			unix_time: 1647531900,
			date_time_format: 'wDT',
		} satisfies TT.MessageEntity);
	});

	it('should build date_time entities lazily and through the proxy', () => {
		const lazy = new LazyEntityBuilder();
		lazy.dateTime('soon', 1, 'r');
		expect(lazy.flatten().buildText().entities[0]).toMatchObject({ type: 'date_time' });

		const proxy = new MessageBuilder();
		proxy.dateTime('soon', 1, 'r');
		expect(proxy.buildText().entities[0]).toMatchObject({ type: 'date_time' });
	});
});

describe('pre entities', () => {
	it('should omit the language when none is given', () => {
		const entity = new EntityBuilder().pre('code').buildText().entities[0];
		expect(entity).not.toHaveProperty('language');

		const withLanguage = new EntityBuilder().pre('code', 'ts').buildText().entities[0];
		expect(withLanguage).toMatchObject({ type: 'pre', language: 'ts' });
	});
});

describe('empty text', () => {
	it('should not attach zero-length entities', () => {
		const builder = new EntityBuilder();
		builder.addTextEntity('', { type: 'bold' });
		builder.addTextEntities('', [{ type: 'italic' }]);
		builder.addText('kept');

		const payload = builder.buildText();
		expect(payload.text).toBe('kept');
		expect(payload.entities).toHaveLength(0);
	});
});

describe('toSegments', () => {
	it('should round-trip text and entities through segments', () => {
		const builder = new EntityBuilder();
		builder.addText('a ');
		builder.addTextEntities('bc', [{ type: 'bold' }]);
		builder.addTextEntity('d', { type: 'italic' });

		expect(builder.toSegments()).toEqual([
			{ text: 'a ' },
			{ text: 'bc', entities: [{ type: 'bold' }] },
			{ text: 'd', entities: [{ type: 'italic' }] },
		] satisfies TextSegment[]);

		const copy = new EntityBuilder();
		copy.addTextSegmentList(builder.toSegments());
		expect(copy.buildText()).toEqual(builder.buildText());
	});

	it('should split nested entities at their boundaries', () => {
		const builder = new EntityBuilder();
		const inner = builder.fork();
		inner.addText('a');
		inner.addTextEntity('bc', { type: 'italic' });
		inner.merge([{ type: 'bold' }]);

		expect(builder.toSegments()).toEqual([
			{ text: 'a', entities: [{ type: 'bold' }] },
			{ text: 'bc', entities: [{ type: 'bold' }, { type: 'italic' }] },
		] satisfies TextSegment[]);
	});

	it('should report an empty segment list for empty content', () => {
		expect(new EntityBuilder().toSegments()).toEqual([]);
		expect(new EntityBuilder().addText('x').toSegments()).toEqual([{ text: 'x' }]);
	});

	it('should snapshot lazy segments', () => {
		const lazy = new LazyEntityBuilder();
		lazy.addTextEntity('a', { type: 'bold' });

		const segments = lazy.toSegments();
		segments.push({ text: 'b' });
		expect(lazy.toSegments()).toHaveLength(1);
	});

	it('should delegate through the proxy', () => {
		const proxy = new EntityBuilderProxy();
		proxy.addText('x');
		expect(proxy.toSegments()).toEqual([{ text: 'x' }]);
	});
});

describe('slicing edge cases', () => {
	it('should empty the text for slice(0, 0)', () => {
		const builder = new EntityBuilder();
		builder.addTextEntity('abc', { type: 'bold' });
		builder.sliceInplace(0, 0);

		const payload = builder.buildText();
		expect(payload.text).toBe('');
		expect(payload.entities).toHaveLength(0);
	});
});

describe('link preview options', () => {
	it('should omit the key when no options were set', () => {
		const composer = new MessageBuilder();
		composer.addText('Content');

		expect(composer.buildText()).not.toHaveProperty('link_preview_options');
		expect(composer.buildInline()).not.toHaveProperty('link_preview_options');
	});
});

describe('formatText tagged template and format helpers', () => {
	it('should interleave strings and formatted runs', () => {
		const payload = formatText`This is ${f.bold`bold`} and ${f.italic`italic`}!`
			.flatten()
			.buildText();

		expect(payload.text).toBe('This is bold and italic!');
		expect(payload.entities).toEqual([
			{ type: 'bold', offset: 8, length: 4 },
			{ type: 'italic', offset: 17, length: 6 },
		] satisfies TT.MessageEntity[]);
	});

	it('should handle nested formatted runs', () => {
		const payload = formatText`${f.bold`Bold and ${f.italic`italic`}`}`
			.flatten()
			.buildText();

		expect(payload.text).toBe('Bold and italic');
		expect(payload.entities).toEqual(
			expect.arrayContaining([
				{ type: 'bold', offset: 0, length: 9 },
				{ type: 'bold', offset: 9, length: 6 },
				{ type: 'italic', offset: 9, length: 6 },
			] satisfies TT.MessageEntity[]),
		);
	});

	it('should handle formats with arguments', () => {
		const payload = formatText`Click ${f.url('https://example.com')`here`}`
			.flatten()
			.buildText();

		expect(payload.text).toBe('Click here');
		expect(payload.entities).toEqual([
			{ type: 'text_link', offset: 6, length: 4, url: 'https://example.com' },
		] satisfies TT.MessageEntity[]);
	});

	it('should fall back to the parameter as text', () => {
		const payload = f.url('https://example.com')().flatten().buildText();
		expect(payload.text).toBe('https://example.com');
		expect(payload.entities[0]).toMatchObject({ type: 'text_link' });
	});

	it('should support parameterized and dated formats', () => {
		const user: TT.User = { id: 42, is_bot: false, first_name: 'Me' };

		expect(f.textMention(user)`Me`.flatten().buildText().entities[0]).toMatchObject({
			type: 'text_mention',
			user,
		});
		expect(f.pre('ts')`code`.flatten().buildText().entities[0]).toMatchObject({
			type: 'pre',
			language: 'ts',
		});
		expect(
			f.dateTime(1647531900, 'r')`soon`.flatten().buildText().entities[0],
		).toMatchObject({ type: 'date_time', unix_time: 1647531900 });
	});

	it('should expose format helpers bound to a builder', () => {
		const builder = new EntityBuilder();
		builder.addText('Hi ');
		expect(builder.f.bold`there`).toBe(builder);
		expect(builder.f.url('https://example.com')`link`).toBe(builder);

		const payload = builder.buildText();
		expect(payload.text).toBe('Hi therelink');
		expect(payload.entities).toEqual([
			{ type: 'bold', offset: 3, length: 5 },
			{ type: 'text_link', offset: 8, length: 4, url: 'https://example.com' },
		] satisfies TT.MessageEntity[]);
		expect((builder.f as unknown as Record<string, unknown>).nope).toBeUndefined();
	});

	it('should accept an independent builder as a resolvable item', () => {
		const standalone = new LazyEntityBuilder();
		standalone.addTextEntity('kept', { type: 'bold' });

		const payload = formatText`Mix ${standalone} in`.flatten().buildText();
		expect(payload.text).toBe('Mix kept in');
		expect(payload.entities).toEqual([
			{ type: 'bold', offset: 4, length: 4 },
		] satisfies TT.MessageEntity[]);

		// The source is untouched and can be reused.
		expect(standalone.flatten().buildText().text).toBe('kept');
	});

	it('should accept a callback as a resolvable item', () => {
		const builder = new EntityBuilder();
		builder.add((inner) => {
			inner.addTextEntity('cb', { type: 'bold' });
		});
		expect(builder.buildText().text).toBe('cb');
	});
});
