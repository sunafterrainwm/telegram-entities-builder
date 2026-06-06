import { describe, expect, it, jest } from '@jest/globals';

import { EntityBuilder, EntityBuilderProxy, LazyEntityBuilder, MessageComposer, escapeTag } from '../src/index.ts';

describe('EntityBuilder', () => {
	it('should build text payload correctly', () => {
		const builder = new EntityBuilder();
		builder.addText('Hello ');
		builder.addTextEntity('world', { type: 'bold' });

		const payload = builder.buildTextPayload();
		expect(payload.text).toBe('Hello world');
		expect(payload.entities).toHaveLength(1);
		expect(payload.entities[0]).toMatchObject({
			type: 'bold',
			offset: 6,
			length: 5,
		});
	});

	it('should support addTextEntities', () => {
		const builder = new EntityBuilder();
		builder.addTextEntities('test', [{ type: 'bold' }, { type: 'italic' }]);
		const payload = builder.buildTextPayload();
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
		const payload = builder.buildTextPayload();
		expect(payload.text).toBe('ABC');
		expect(payload.entities).toHaveLength(2);
	});

	it('should support buildCaptionPayload and buildInlinePayload', () => {
		const builder = new EntityBuilder();
		builder.addText('test');
		expect(builder.buildCaptionPayload()).toMatchObject({ caption: 'test' });
		expect(builder.buildInlinePayload()).toMatchObject({ message_text: 'test' });
	});

	it('should support sortEntities', () => {
		const builder = new EntityBuilder();
		builder.addTextEntity('A', { type: 'bold' });
		builder.addTextEntity('B', { type: 'italic' });
		// Reverse order
		const entities = builder.buildTextPayload().entities;
		entities.reverse();
		builder.sortEntities();
		expect(builder.buildTextPayload().entities[0].type).toBe('bold');
	});

	it('should support slicing', () => {
		const builder = new EntityBuilder();
		builder.addText('Hello ');
		builder.addTextEntity('world', { type: 'bold' });
		builder.addText('!');

		builder.sliceInplace(6, 11);

		const payload = builder.buildTextPayload();
		expect(payload.text).toBe('world');
		expect(payload.entities[0]).toMatchObject({
			type: 'bold',
			offset: 0,
			length: 5,
		});

		// Test out of bounds
		const b2 = new EntityBuilder();
		b2.addText('abc').sliceInplace(1, 10);
		expect(b2.buildTextPayload().text).toBe('bc');

		const b3 = new EntityBuilder();
		b3.addText('abc').sliceInplace(-2);
		expect(b3.buildTextPayload().text).toBe('bc');

		const b4 = new EntityBuilder();
		b4.addText('abc').sliceInplace(2, 1);
		expect(b4.buildTextPayload().text).toBe('');

		const b5 = new EntityBuilder();
		b5.addTextEntity('abc', { type: 'bold' }).sliceInplace(1, 2);
		expect(b5.buildTextPayload().entities[0]).toMatchObject({ offset: 0, length: 1 });

		const b6 = new EntityBuilder();
		b6.addTextEntity('abc', { type: 'bold' }).sliceInplace(5, 10);
		expect(b6.buildTextPayload().entities.length).toBe(0);

		// Cover start === undefined
		const b7 = new EntityBuilder();
		b7.addText('abc').sliceInplace(undefined, 2);
		expect(b7.buildTextPayload().text).toBe('ab');

		// Cover end === undefined
		const b8 = new EntityBuilder();
		b8.addText('abc').sliceInplace(1, undefined);
		expect(b8.buildTextPayload().text).toBe('bc');

		// Cover end < 0
		const b9 = new EntityBuilder();
		b9.addText('abc').sliceInplace(1, -1);
		expect(b9.buildTextPayload().text).toBe('b');

		// Cover start < 0 and end < 0 out of bounds
		const b10 = new EntityBuilder();
		b10.addText('abc').sliceInplace(-10, -5);
		expect(b10.buildTextPayload().text).toBe('');
	});

	it('should support sliceInplace with no args', () => {
		const builder = new EntityBuilder();
		builder.addText('a').sliceInplace();
		expect(builder.buildTextPayload().text).toBe('a');
	});

	it('should support sliceInplace with unordered entities', () => {
		const builder = new EntityBuilder();
		builder.addTextEntity('A', { type: 'bold' });
		builder.addTextEntity('B', { type: 'italic' });
		builder.addTextEntity('C', { type: 'underline' });

		// Manually reverse the internal array to make it unordered
		builder.buildTextPayload().entities.reverse();

		// Slice to keep only 'B'
		builder.sliceInplace(1, 2);

		const payload = builder.buildTextPayload();
		expect(payload.text).toBe('B');
		expect(payload.entities).toHaveLength(1);
		expect(payload.entities[0]).toMatchObject({ type: 'italic', offset: 0, length: 1 });
	});

	it('should support slice (clone and slice)', () => {
		const builder = new EntityBuilder();
		builder.addText('abc');
		builder.addTextEntity('def', { type: 'bold' });
		const sliced = builder.slice(1);

		// Ensure sliced has modified text
		expect(sliced.buildTextPayload().text).toBe('bcdef');

		// Ensure original is not affected
		expect(builder.buildTextPayload().text).toBe('abcdef');
		expect(builder.buildTextPayload().entities[0].offset).toBe(3);
	});

	it('should support clone without affecting original', () => {
		const builder = new EntityBuilder();
		builder.addText('abc');
		builder.addTextEntity('def', { type: 'italic' });

		const cloned = builder.clone();
		cloned.addText('ghi');
		cloned.sliceInplace(1);

		expect(cloned.buildTextPayload().text).toBe('bcdefghi');
		// Original should remain completely unchanged
		const originalPayload = builder.buildTextPayload();
		expect(originalPayload.text).toBe('abcdef');
		expect(originalPayload.entities).toHaveLength(1);
		expect(originalPayload.entities[0]).toMatchObject({ type: 'italic', offset: 3, length: 3 });
	});

	it('should support trimStart, trimEnd, trim', () => {
		const builder = new EntityBuilder();
		builder.addText('  abc  ');
		expect(builder.clone().trimStart().buildTextPayload().text).toBe('abc  ');
		expect(builder.clone().trimEnd().buildTextPayload().text).toBe('  abc');
		expect(builder.clone().trim().buildTextPayload().text).toBe('abc');
	});

	it('should support fork and merge', () => {
		const builder = new EntityBuilder();
		builder.addText('parent ');
		const child = builder.fork();
		child.addTextEntity('child', { type: 'bold' });
		child.merge([{ type: 'italic' }]);
		const payload = builder.buildTextPayload();
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
		const payload = builder.buildTextPayload();

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

		const payload = lazy.flatten().buildTextPayload();
		expect(payload.text).toBe('parent child');
		expect(payload.entities).toHaveLength(2);

		expect(() => {
			child.merge();
		}).toThrow('This builder is not a fork or has already been merged.');
		expect(() => {
			new LazyEntityBuilder().merge();
		}).toThrow('This builder is not a fork or has already been merged.');

		const cloned = lazy.clone();
		expect(cloned.flatten().buildTextPayload().text).toBe('parent child');
	});
});

describe('MessageComposer (delegated methods)', () => {
	it('should delegate methods', () => {
		const proxy = new MessageComposer();

		proxy
			.addText('a')
			.addTextEntity('b', { type: 'bold' })
			.addTextEntities('c', [{ type: 'italic' }])
			.addTextSegmentList([{ text: 'd' }]);

		proxy.trimStart().trimEnd().trim().sortEntities();

		const payload = proxy.buildTextPayload();
		expect(payload.text).toBe('abcd');

		const sliced = proxy.slice(1);
		expect(sliced.buildTextPayload().text).toBe('bcd');

		proxy.sliceInplace(0, 1);
		expect(proxy.buildTextPayload().text).toBe('a');

		expect(proxy.buildCaptionPayload().caption).toBe('a');
		expect(proxy.buildInlinePayload().message_text).toBe('a');

		const forked = proxy.fork();
		forked.addText('e');
		forked.merge();
		expect(proxy.buildTextPayload().text).toBe('ae');

		const childProxy = proxy.fork();
		childProxy.addText('f');
		childProxy.merge();
		expect(proxy.buildTextPayload().text).toBe('aef');
	});

	it('should support proxy clone', () => {
		const proxy = new MessageComposer();
		proxy.addText('a');
		const cloned = proxy.clone();
		expect(cloned).toBeInstanceOf(MessageComposer);
	});
});

describe('EntityBuilderProxy', () => {
	it('should delegate merge and buildTextPayload correctly', () => {
		const builder = new EntityBuilder();
		builder.addText('parent ');
		const proxy = new EntityBuilderProxy(builder);
		const child = proxy.fork();
		child.addText('child');

		// Cover proxy.merge()
		const childProxy = new EntityBuilderProxy(child);
		childProxy.merge();
		expect(proxy.buildTextPayload().text).toBe('parent child');
	});

	it('should delegate clone correctly', () => {
		const proxy = new EntityBuilderProxy();
		proxy.addText('test');
		const cloned = proxy.clone();
		expect(cloned.buildTextPayload().text).toBe('test');
		expect(cloned).not.toBe(proxy);
	});

	it('should call buildTextPayload when building caption or inline payload', () => {
		const proxy = new EntityBuilderProxy();
		proxy.addText('test');

		const spy = jest.spyOn(proxy, 'buildTextPayload');

		const caption = proxy.buildCaptionPayload();
		expect(spy).toHaveBeenCalledTimes(1);
		expect(caption.caption).toBe('test');

		spy.mockClear();

		const inline = proxy.buildInlinePayload();
		expect(spy).toHaveBeenCalledTimes(1);
		expect(inline.message_text).toBe('test');
	});
});

describe('MessageComposer', () => {
	it('should add tags and build payload correctly', () => {
		const composer = new MessageComposer();
		composer.addText('Content');
		composer.addTags('test', 'jest');

		const payload = composer.buildTextPayload();
		expect(payload.text).toBe('Content\n\n#Test #Jest');
	});

	it('should build payloads with link preview options correctly', () => {
		const composer = new MessageComposer();
		composer.addText('Content');
		composer.linkPreviewOptions = { is_disabled: true };

		const payload = composer.buildTextPayload();
		expect(payload.link_preview_options).toEqual({ is_disabled: true });

		const inlinePayload = composer.buildInlinePayload();
		expect(inlinePayload.link_preview_options).toEqual({ is_disabled: true });
	});

	it('should not allow nesting an AbstractEntityBuilderProxy', () => {
		const composer = new MessageComposer();
		// @ts-expect-error TS2345: deliberately pass a MessageComposer to test error
		expect(() => new MessageComposer(composer)).toThrow('Cannot nest MessageComposer inside another MessageComposer.');
		// @ts-expect-error TS2345: deliberately pass a MessageComposer to test error
		expect(() => new EntityBuilderProxy(composer)).toThrow('Cannot nest MessageComposer inside EntityBuilderProxy.');
	});

	it('should not allow wrapping a forked entity builder', () => {
		const builder = new EntityBuilder();
		const child = builder.fork();
		expect(() => new MessageComposer(child)).toThrow('Cannot wrap a forked entity builder.');
	});

	it('should handle tags correctly', () => {
		const composer = new MessageComposer();
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
