const test = require('node:test');
const assert = require('node:assert');
const {loadScripts} = require('./load.js');
const {makeDieTable} = require('./page.js');

const {parseDiceTable, DiceTableRequest, StatsRequest} = loadScripts(
    ['roller.js', 'plothelpers.js', 'models.js', 'fetch-dice-tables.js'],
    ['parseDiceTable', 'DiceTableRequest', 'StatsRequest'],
);

function makeDiceTable(sides = 3) {
    return parseDiceTable(makeDieTable(sides));
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
