const test = require('node:test');
const assert = require('node:assert');
const {loadScripts} = require('./load.js');
const {makeDieTable} = require('./page.js');

const {
    parseDiceTable, lowestUnusedIndex, getUnusedColorIndex, getUnusedShiftIndex, DiceTableRequest, StatsRequest,
} = loadScripts(
    ['roller.js', 'plothelpers.js', 'models.js'],
    ['parseDiceTable', 'lowestUnusedIndex', 'getUnusedColorIndex', 'getUnusedShiftIndex', 'DiceTableRequest',
        'StatsRequest'],
);

function makeDiceTable(sides = 3) {
    return parseDiceTable(makeDieTable(sides));
}

test('lowestUnusedIndex returns the lowest index not in use', () => {
    assert.strictEqual(lowestUnusedIndex([]), 0);
    assert.strictEqual(lowestUnusedIndex([1, 2]), 0);
    assert.strictEqual(lowestUnusedIndex([0, 1, 3]), 2);
    assert.strictEqual(lowestUnusedIndex([2, 0, 1]), 3);
});

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

test('a new dice table request is blank and not loaded', () => {
    const request = new DiceTableRequest();
    assert.strictEqual(typeof request.id, 'string');
    assert.notStrictEqual(request.id, new DiceTableRequest().id);
    assert.strictEqual(request.buildStringInput, '');
    assert.strictEqual(request.isPending, false);
    assert.strictEqual(request.error, '');
    assert.strictEqual(request.diceTable, null);
    assert.strictEqual(request.roller, null);
    assert.strictEqual(request.colorIndex, null);
    assert.deepStrictEqual(request.rollHistory, []);
    assert.strictEqual(request.isLoaded, false);
    assert.strictEqual(request.isBlank(), true);
});

test('a dice table request is not blank once it has text, is pending, or is loaded', () => {
    const typed = new DiceTableRequest();
    typed.buildStringInput = 'Die(3)';
    assert.strictEqual(typed.isBlank(), false);

    const whitespace = new DiceTableRequest();
    whitespace.buildStringInput = '   ';
    assert.strictEqual(whitespace.isBlank(), true);

    const pending = new DiceTableRequest();
    pending.isPending = true;
    assert.strictEqual(pending.isBlank(), false);

    const loaded = new DiceTableRequest();
    loaded.load(makeDiceTable(), 0);
    assert.strictEqual(loaded.isBlank(), false);
});

test('load sets the dice table, its roller and the color', () => {
    const request = new DiceTableRequest();
    const diceTable = makeDiceTable();
    request.load(diceTable, 4);
    assert.strictEqual(request.isLoaded, true);
    assert.strictEqual(request.diceTable, diceTable);
    assert.ok(request.roller !== null);
    assert.strictEqual(request.roller.aliases.length, 3);
    assert.strictEqual(request.colorIndex, 4);
});

test('a reload keeps the color and clears the roll history', () => {
    const request = new DiceTableRequest();
    request.load(makeDiceTable(3), 4);
    request.roll();
    const reloaded = makeDiceTable(6);
    request.load(reloaded, 7);
    assert.strictEqual(request.diceTable, reloaded);
    assert.strictEqual(request.colorIndex, 4);
    assert.deepStrictEqual(request.rollHistory, []);
});

test('roll adds the roll to the front of the history and returns it', () => {
    const request = new DiceTableRequest();
    request.load(makeDiceTable(3), 0);
    const first = request.roll();
    const second = request.roll();
    assert.ok(['1', '2', '3'].includes(first));
    assert.deepStrictEqual(request.rollHistory, [second, first]);
});

test('roll throws when nothing is loaded', () => {
    assert.throws(() => new DiceTableRequest().roll(), /not loaded/);
});

test('a new stats request has blank inputs and nothing submitted', () => {
    const request = new StatsRequest();
    assert.strictEqual(typeof request.id, 'string');
    assert.notStrictEqual(request.id, new StatsRequest().id);
    assert.strictEqual(request.lowInput, '');
    assert.strictEqual(request.highInput, '');
    assert.strictEqual(request.submittedRange, null);
    assert.strictEqual(request.shiftIndex, null);
});

test('submit parses and sorts the inputs and assigns the shift once', () => {
    const request = new StatsRequest();
    request.lowInput = '5';
    request.highInput = '2';
    request.submit(3);
    assert.deepStrictEqual(request.submittedRange, {low: 2, high: 5});
    assert.strictEqual(request.shiftIndex, 3);

    request.lowInput = '1';
    request.submit(8);
    assert.deepStrictEqual(request.submittedRange, {low: 1, high: 2});
    assert.strictEqual(request.shiftIndex, 3);
});

test('getUnusedColorIndex skips the colors of loaded requests only', () => {
    const loaded = [0, 1, 2].map(colorIndex => {
        const request = new DiceTableRequest();
        request.load(makeDiceTable(), colorIndex);
        return request;
    });
    const state = {diceTableRequests: [loaded[0], new DiceTableRequest(), loaded[2]], statsRequests: []};
    assert.strictEqual(getUnusedColorIndex(state), 1);
    state.diceTableRequests.push(loaded[1]);
    assert.strictEqual(getUnusedColorIndex(state), 3);
});

test('getUnusedShiftIndex skips the shifts of submitted requests only', () => {
    const submitted = new StatsRequest();
    submitted.lowInput = '1';
    submitted.highInput = '2';
    submitted.submit(0);
    const state = {diceTableRequests: [], statsRequests: [new StatsRequest(), submitted]};
    assert.strictEqual(getUnusedShiftIndex(state), 1);
});
