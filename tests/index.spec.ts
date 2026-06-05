import { EntityBuilder, LazyEntityBuilder, MessageComposer } from '../src/index';

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
	});
});

describe('LazyEntityBuilder', () => {
	it('should flatten to EntityBuilder correctly', () => {
		const lazy = new LazyEntityBuilder();
		lazy.addText('Lazy ');
		lazy.addTextEntity('boy', { type: 'italic' });

		const builder = lazy.flatten();
		const payload = builder.buildTextPayload();

		expect(payload.text).toBe('Lazy boy');
		expect(payload.entities).toHaveLength(1);
		expect(payload.entities[0].type).toBe('italic');
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
});
