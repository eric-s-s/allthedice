const test = require('node:test');
const assert = require('node:assert');
const {loadScripts} = require('./load.js');

const {getLambdaEndpoint} = loadScripts(['config.js'], ['getLambdaEndpoint']);

test('config.js points at the production lambda', () => {
    assert.strictEqual(
        getLambdaEndpoint(),
        'https://kpt1e43ea7.execute-api.us-east-1.amazonaws.com/default/_construct',
        'config.js is not set to production; it was probably left on localhost by `make local-dev`. ' +
        'Switch it back before committing.'
    );
});
