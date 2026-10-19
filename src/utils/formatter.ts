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

export interface StyleFunction<
	TItem,
	TInterface extends IBuilderLike<TItem>,
	TBuilder extends TInterface,
> {
	<B extends TInterface>(
		builder: B,
	): (strings: TemplateStringsArray, ...values: TItem[]) => B;
	(strings: TemplateStringsArray, ...values: TItem[]): TBuilder;
}

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

export interface ParameterizedStyleFunction<
	TItem,
	TInterface extends IBuilderLike<TItem>,
	TBuilder extends TInterface,
	TAllowFallback extends boolean,
	K extends ParameterizedStyleMethods<TItem, TInterface>,
> {
	<B extends TInterface>(
		builder: B,
	): (...args: Shift<ParamsOf<TInterface[K]>>) => TAllowFallback extends true
		? {
				// eslint-disable-next-line @typescript-eslint/unified-signatures
				(strings: TemplateStringsArray, ...values: TItem[]): B;
				(): B;
			}
		: (strings: TemplateStringsArray, ...values: TItem[]) => B;
	(...args: Shift<ParamsOf<TBuilder[K]>>): TAllowFallback extends true
		? {
				// eslint-disable-next-line @typescript-eslint/unified-signatures
				(strings: TemplateStringsArray, ...values: TItem[]): TBuilder;
				(): TBuilder;
			}
		: (strings: TemplateStringsArray, ...values: TItem[]) => TBuilder;
}

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

export interface EmbedFunction<
	TItem,
	TInterface extends IBuilderLike<TItem>,
	TBuilder extends TInterface,
	K extends EmbedMethods<TItem, TInterface>,
> {
	<B extends TInterface>(builder: B): (...args: ParamsOf<TInterface[K]>) => B;
	(...args: ParamsOf<TBuilder[K]>): TBuilder;
}

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
>({
	Builder,
	Interface,
}: {
	Builder: new () => TBuilder;
	Interface?: abstract new () => TInterface;
}) {
	Interface ??= Builder;
	const mergeTpl = formatText<TItem, TBuilder>(Builder);

	return {
		mergeTpl,
		style(
			methodName: StyleMethods<TItem, TBuilder>,
		): StyleFunction<TItem, TInterface, TBuilder> {
			return function (
				...args: [TInterface] | [strings: TemplateStringsArray, ...values: TItem[]]
			) {
				if (args.length === 1 && args[0] instanceof Interface) {
					const builder = args[0];
					return (strings: TemplateStringsArray, ...values: TItem[]) => {
						return (builder[methodName] as (args: TInterface) => TInterface)(
							mergeTpl(strings, ...values),
						);
					};
				}
				const strings = args[0] as TemplateStringsArray;
				const values = args.slice(1) as TItem[];
				return (new Builder()[methodName] as (args: TBuilder) => TBuilder)(
					mergeTpl(strings, ...values),
				);
			} as StyleFunction<TItem, TInterface, TBuilder>;
		},
		styleWithParam<
			K extends ParameterizedStyleMethods<TItem, TInterface>,
			TAllowFallback extends boolean = false,
		>(
			methodName: K,
			useParamAsFallbackText?: TAllowFallback,
		): ParameterizedStyleFunction<TItem, TInterface, TBuilder, TAllowFallback, K> {
			return function (
				...args: [TInterface] | [strings: TemplateStringsArray, ...values: TItem[]]
			): unknown {
				if (args.length === 1 && args[0] instanceof Interface) {
					const builder = args[0];
					return (...propArgs: Shift<ParamsOf<TInterface[K]>>) => {
						return (strings?: TemplateStringsArray, ...values: TItem[]) => {
							const text = useParamAsFallbackText
								? strings
									? mergeTpl(strings, ...values)
									: propArgs[0]
								: // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
									mergeTpl(strings!, ...values);
							return (
								builder[methodName] as (args0: unknown, ...rest: unknown[]) => TInterface
							)(text, ...propArgs);
						};
					};
				}
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
			return function (
				...args: [TInterface] | [strings: TemplateStringsArray, ...values: TItem[]]
			): unknown {
				if (args.length === 1 && args[0] instanceof Interface) {
					const builder = args[0];
					return (...directArgs: ParamsOf<TInterface[K]>) => {
						return (builder[methodName] as (...args: unknown[]) => TInterface)(
							...directArgs,
						);
					};
				}
				return (new Builder()[methodName] as (...args: unknown[]) => TBuilder)(...args);
			} as EmbedFunction<TItem, TInterface, TBuilder, K>;
		},
	};
}
