import { type UserConfig, defineConfig } from 'tsdown';

export default defineConfig(() => {
	const baseConfig: UserConfig = {
		dts: true,
		sourcemap: true,
		clean: true,
		minify: false,
		target: false,
		outputOptions: {
			sourcemapExcludeSources: true,
		},
	};

	return [
		{
			entry: {
				index: 'src/index.ts',
			},
			format: ['esm'],
			...baseConfig,
		},
		{
			entry: {
				index: 'src/cjs.cts',
			},
			format: ['cjs'],
			cjsDefault: true,
			...baseConfig,
		},
	] satisfies UserConfig[] as UserConfig[];
});
