const test = require('node:test');
const assert = require('node:assert');
const {loadScripts} = require('./load.js');
const {makeDieTable} = require('./page.js');

const {parseDiceTable} = loadScripts(['plothelpers.js', 'fetch-dice-tables.js'], ['parseDiceTable']);

test('parseDiceTable keeps the server fields, converts range and computes the dice list', () => {
    const json = makeDieTable(3);
    const diceTable = parseDiceTable(json);
    assert.strictEqual(diceTable.name, json.name);
    assert.strictEqual(diceTable.diceList, '[1D3]');
    assert.strictEqual(diceTable.diceStr, json.diceStr);
    assert.deepStrictEqual(diceTable.data, json.data);
    assert.deepStrictEqual(diceTable.forSciNum, json.forSciNum);
    assert.deepStrictEqual(diceTable.range, {low: 1, high: 3});
    assert.strictEqual(diceTable.mean, json.mean);
    assert.strictEqual(diceTable.stddev, json.stddev);
    assert.deepStrictEqual(diceTable.roller, json.roller);
});

test('parseDiceTable ignores fields it does not use', () => {
    const diceTable = parseDiceTable({...makeDieTable(3), tableString: '1: 1\n2: 1\n3: 1'});
    assert.ok(!('tableString' in diceTable));
});

test('parseDiceTable rejects a response that is not an object', () => {
    for (const json of [null, [], 'Die(3)', 3]) {
        assert.throws(() => parseDiceTable(json), /The dice server sent a bad dice table/);
    }
});

const badFields = [
    ['name', json => delete json.name],
    ['name', json => json.name = 3],
    ['diceStr', json => delete json.diceStr],
    ['data', json => delete json.data],
    ['data.x', json => json.data.x = 'nope'],
    ['data.y[1]', json => json.data.y = [1, '2', 3]],
    ['data.y', json => json.data.y = [1, 2]],
    ['forSciNum', json => json.forSciNum = {}],
    ['forSciNum[0].roll', json => json.forSciNum[0].roll = '1'],
    ['forSciNum[1].mantissa', json => json.forSciNum[1].mantissa = 1],
    ['forSciNum[2].exponent', json => delete json.forSciNum[2].exponent],
    ['range', json => delete json.range],
    ['range', json => json.range = [1]],
    ['range[1]', json => json.range = [1, '3']],
    ['mean', json => json.mean = '2'],
    ['stddev', json => delete json.stddev],
    ['roller', json => json.roller = null],
    ['roller.height', json => json.roller.height = 3],
    ['roller.aliases', json => delete json.roller.aliases],
    ['roller.aliases[0].primary', json => json.roller.aliases[0].primary = 1],
    ['roller.aliases[1].alternate', json => delete json.roller.aliases[1].alternate],
    ['roller.aliases[2].primaryHeight', json => json.roller.aliases[2].primaryHeight = null],
];

for (const [field, breakField] of badFields) {
    test(`parseDiceTable names a missing or badly typed ${field}`, () => {
        const json = makeDieTable(3);
        breakField(json);
        assert.throws(
            () => parseDiceTable(json),
            error => error instanceof Error
                && error.message.startsWith('The dice server sent a bad dice table: ')
                && error.message.includes(`"${field}"`),
        );
    });
}
