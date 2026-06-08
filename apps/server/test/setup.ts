// Preloaded before tests (see package.json `test` script) so modules that import
// ./src/env have the required environment.
process.env.GETO_AUTH_PASSWORD ||= 'test-password'
process.env.NODE_ENV = 'test'
process.env.GETO_DATA_DIR ||= './.test-data'
