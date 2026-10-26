type ExcludedMethods = 'add' | 'addText' | 'clone' | 'fork' | 'merge' | number | symbol;

type FilterKeysByValue<T, Condition> = {
	[K in keyof T]: T[K] extends Condition ? K : never;
}[keyof T];

type Shift<T extends unknown[]> = T extends [unknown, ...infer Rest] ? Rest : [];

/**
 * The parameter tuple of a method.
 *
 * `Parameters<T>` cannot be applied to a generic `TInterface[K]`, and intersecting it
 * with a catch-all signature makes `Parameters` resolve against that signature instead,
 * collapsing every parameter list to `unknown[]`. Inferring the tuple directly keeps the
 * real parameters.
 *
 * @internal
 */
type ParamsOf<T> = T extends (...args: never[]) => unknown ? Parameters<T> : [];

interface IBuilderLike<TItem> {
	add(item: TItem): this;
}

type StyleMethods<TItem, TInterface extends IBuilderLike<TItem>> = Exclude<
	{
		[K in keyof TInterface]: TInterface[K] extends (...args: infer P) => TInterface
			? P extends [item: TItem]
				? [item: TItem] extends P
					? K
					: never
				: never
			: never;
	}[keyof TInterface],
	ExcludedMethods
>;

/**
 * A helper that formats a tagged template into a fresh builder.
 *
 * @typeParam TItem - The item type the builder accumulates.
 * @typeParam TBuilder - The builder the helper constructs.
 */
export type StyleFunction<TItem, TBuilder> = (
	strings: TemplateStringsArray,
	...values: TItem[]
) => TBuilder;

type ParameterizedStyleMethods<TItem, TInterface extends IBuilderLike<TItem>> = Exclude<
	{
		[K in keyof TInterface]: TInterface[K] extends (...args: infer P) => TInterface
			? // eslint-disable-next-line @typescript-eslint/no-explicit-any
				P extends [infer T, ...args: any[]]
				? [T, TItem] extends [TItem, T]
					? K
					: never
				: never
			: never;
	}[keyof TInterface],
	ExcludedMethods | StyleMethods<TItem, TInterface>
>;

/**
 * A helper that takes the entity's own parameters first and the text second.
 *
 * @typeParam TItem - The item type the builder accumulates.
 * @typeParam TInterface - The interface the method keys are derived from.
 * @typeParam TBuilder - The builder the helper constructs.
 * @typeParam TAllowFallback - Whether the first parameter doubles as the text.
 * @typeParam K - The method this helper stands for.
 */
export type ParameterizedStyleFunction<
	TItem,
	TInterface extends IBuilderLike<TItem>,
	TBuilder extends TInterface,
	TAllowFallback extends boolean,
	K extends ParameterizedStyleMethods<TItem, TInterface>,
> = (...args: Shift<ParamsOf<TBuilder[K]>>) => TAllowFallback extends true
	? {
			// eslint-disable-next-line @typescript-eslint/unified-signatures
			(strings: TemplateStringsArray, ...values: TItem[]): TBuilder;
			(): TBuilder;
		}
	: (strings: TemplateStringsArray, ...values: TItem[]) => TBuilder;

type EmbedMethods<TItem, TInterface extends IBuilderLike<TItem>> = Exclude<
	FilterKeysByValue<
		TInterface,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(...args: any[]) => TInterface
	>,
	| ExcludedMethods
	| StyleMethods<TItem, TInterface>
	| ParameterizedStyleMethods<TItem, TInterface>
>;

/**
 * A helper for a method that takes no text at all.
 *
 * @typeParam TItem - The item type the builder accumulates.
 * @typeParam TInterface - The interface the method keys are derived from.
 * @typeParam TBuilder - The builder the helper constructs.
 * @typeParam K - The method this helper stands for.
 */
export type EmbedFunction<
	TItem,
	TInterface extends IBuilderLike<TItem>,
	TBuilder extends TInterface,
	K extends EmbedMethods<TItem, TInterface>,
> = (...args: ParamsOf<TBuilder[K]>) => TBuilder;

export function formatText<TItem, TBuilder extends IBuilderLike<TItem>>(
	Builder: new () => TBuilder,
) {
	return function (strings: TemplateStringsArray, ...values: TItem[]): TBuilder {
		const builder = new Builder();
		for (let i = 0; i < strings.length; i++) {
			if (strings[i]) {
				builder.add(strings[i] as unknown as TItem);
			}
			if (i < values.length) {
				builder.add(values[i]);
			}
		}
		return builder;
	};
}

export function createFormatter<
	TItem,
	TInterface extends IBuilderLike<TItem>,
	TBuilder extends TInterface = TInterface,
>({ Builder }: { Builder: new () => TBuilder }) {
	const mergeTpl = formatText<TItem, TBuilder>(Builder);

	return {
		mergeTpl,
		style(methodName: StyleMethods<TItem, TBuilder>): StyleFunction<TItem, TBuilder> {
			return function (strings: TemplateStringsArray, ...values: TItem[]) {
				return (new Builder()[methodName] as (args: TBuilder) => TBuilder)(
					mergeTpl(strings, ...values),
				);
			} as StyleFunction<TItem, TBuilder>;
		},
		styleWithParam<
			K extends ParameterizedStyleMethods<TItem, TInterface>,
			TAllowFallback extends boolean = false,
		>(
			methodName: K,
			useParamAsFallbackText?: TAllowFallback,
		): ParameterizedStyleFunction<TItem, TInterface, TBuilder, TAllowFallback, K> {
			return function (...args: unknown[]): unknown {
				return (strings?: TemplateStringsArray, ...values: TItem[]) => {
					const text = useParamAsFallbackText
						? strings
							? mergeTpl(strings, ...values)
							: args[0]
						: // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
							mergeTpl(strings!, ...values);

					return (
						new Builder()[methodName] as (args0: unknown, ...rest: unknown[]) => TBuilder
					)(text, ...args);
				};
			} as ParameterizedStyleFunction<TItem, TInterface, TBuilder, TAllowFallback, K>;
		},
		embed<K extends EmbedMethods<TItem, TInterface>>(
			methodName: K,
		): EmbedFunction<TItem, TInterface, TBuilder, K> {
			return function (...args: unknown[]): unknown {
				return (new Builder()[methodName] as (...args: unknown[]) => TBuilder)(...args);
			} as EmbedFunction<TItem, TInterface, TBuilder, K>;
		},
	};
}

/**
 * Tells a tagged-template invocation apart from an ordinary argument.
 *
 * A `TemplateStringsArray` is a real array carrying a `raw` property, and neither
 * `ResolvableRichText` nor `ResolvableRichBlocks` admits such a value: a plain string
 * array lacks `raw`, and a `TemplateStringsArray` is `readonly`, so the two are
 * mutually unassignable at the type level as well.
 *
 * @param value - The first argument the method received.
 * @returns Whether the method was called as a tagged template.
 *
 * @internal
 */
export function isTemplateStrings(value: unknown): value is TemplateStringsArray {
	return Array.isArray(value) && 'raw' in value;
}

/**
 * Interleaves the literal parts of a tagged template with its interpolated values.
 *
 * Empty literal parts are dropped, so that `` `${x}` `` yields just the value.
 *
 * @param strings - The literal parts of the template.
 * @param values - The interpolated values, in order.
 * @returns The parts and values in source order.
 *
 * @internal
 */
export function interleaveTemplate<T>(
	strings: TemplateStringsArray,
	values: T[],
): (string | T)[] {
	const parts: (string | T)[] = [];
	for (let i = 0; i < strings.length; i++) {
		const literal = strings[i];
		if (literal) {
			parts.push(literal);
		}
		if (i < values.length) {
			parts.push(values[i]);
		}
	}
	return parts;
}
