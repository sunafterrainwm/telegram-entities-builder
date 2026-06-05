/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
	transform: {
		'^.+\\.(t|j)sx?$': '@swc/jest',
	},
	testEnvironment: 'node',
	clearMocks: true,
	collectCoverage: true,
	coverageDirectory: 'coverage',
	coverageProvider: 'v8',
};
