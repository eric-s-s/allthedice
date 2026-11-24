const test = require('node:test');
const assert = require('node:assert');
const {loadScripts} = require('./load.js');
const {makeDieTable} = require('./page.js');

const {parseDiceTable, DiceTableRequest, StatsRequest, parseRollBound, stepRollBound} = loadScripts(
    ['roller.js', 'plothelpers.js', 'models.js', 'fetch-dice-tables.js'],
    ['parseDiceTable', 'DiceTableRequest', 'StatsRequest', 'parseRollBound', 'stepRollBound'],
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

test('a new stats request starts as MIN to MAX with nothing submitted', () => {
    const request = new StatsRequest();
    assert.strictEqual(typeof request.id, 'string');
    assert.notStrictEqual(request.id, new StatsRequest().id);
    assert.strictEqual(request.lowInput, 'MIN');
    assert.strictEqual(request.highInput, 'MAX');
    assert.strictEqual(request.submittedBounds, null);
    assert.strictEqual(request.shiftIndex, null);
});

test('submit stores the bounds as typed and unsorted, and assigns the shift once', () => {
    const request = new StatsRequest();
    request.lowInput = '5';
    request.highInput = '2';
    request.submit(3);
    assert.deepStrictEqual(request.submittedBounds, {low: 5, high: 2});
    assert.strictEqual(request.shiftIndex, 3);

    request.lowInput = 'max';
    request.submit(8);
    assert.deepStrictEqual(request.submittedBounds, {low: 'MAX', high: 2});
    assert.strictEqual(request.shiftIndex, 3);
});

test('submit resets typed min and max to MIN and MAX', () => {
    const request = new StatsRequest();
    request.lowInput = 'min';
    request.highInput = 'mAx';
    request.submit(0);
    assert.strictEqual(request.lowInput, 'MIN');
    assert.strictEqual(request.highInput, 'MAX');
});

test('parseRollBound reads min in any case as MIN', () => {
    assert.strictEqual(parseRollBound(' mIn '), 'MIN');
});

test('parseRollBound reads max in any case as MAX', () => {
    assert.strictEqual(parseRollBound('Max'), 'MAX');
});

test('parseRollBound reads a whole number', () => {
    assert.strictEqual(parseRollBound(' -12 '), -12);
});

test('parseRollBound returns null for other text', () => {
    for (const text of ['', 'minimum', '1.5', '3a']) {
        assert.strictEqual(parseRollBound(text), null);
    }
});

/**
 * @param {string} low
 * @param {string} high
 */
function makeSubmittedStatsRequest(low, high) {
    const request = new StatsRequest();
    request.lowInput = low;
    request.highInput = high;
    request.submit(0);
    return request;
}

const rollLimits = {low: 3, high: 18};

test('resolveRange replaces MIN with the lowest roll', () => {
    assert.deepStrictEqual(makeSubmittedStatsRequest('MIN', '10').resolveRange(rollLimits), {low: 3, high: 10});
});

test('resolveRange replaces MAX with the highest roll', () => {
    assert.deepStrictEqual(makeSubmittedStatsRequest('10', 'MAX').resolveRange(rollLimits), {low: 10, high: 18});
});

test('resolveRange sorts reversed bounds', () => {
    assert.deepStrictEqual(makeSubmittedStatsRequest('MAX', '10').resolveRange(rollLimits), {low: 10, high: 18});
});

test('snapToRollLimits turns a number below the lowest roll into MIN', () => {
    const request = makeSubmittedStatsRequest('2', '10');
    request.snapToRollLimits(rollLimits);
    assert.strictEqual(request.lowInput, 'MIN');
    assert.deepStrictEqual(request.submittedBounds, {low: 'MIN', high: 10});
});

test('snapToRollLimits turns a number above the highest roll into MAX', () => {
    const request = makeSubmittedStatsRequest('10', '19');
    request.snapToRollLimits(rollLimits);
    assert.strictEqual(request.highInput, 'MAX');
    assert.deepStrictEqual(request.submittedBounds, {low: 10, high: 'MAX'});
});

test('snapToRollLimits keeps an in-range number', () => {
    const request = makeSubmittedStatsRequest('3', '18');
    request.snapToRollLimits(rollLimits);
    assert.strictEqual(request.lowInput, '3');
    assert.strictEqual(request.highInput, '18');
    assert.deepStrictEqual(request.submittedBounds, {low: 3, high: 18});
});

test('stepRollBound adds 1 to a number', () => {
    assert.strictEqual(stepRollBound('7', 1, rollLimits), '8');
});

test('stepRollBound subtracts 1 from a number', () => {
    assert.strictEqual(stepRollBound('7', -1, rollLimits), '6');
});

test('stepRollBound steps up from MIN to the lowest roll', () => {
    assert.strictEqual(stepRollBound('MIN', 1, rollLimits), '3');
});

test('stepRollBound steps down from MAX to the highest roll', () => {
    assert.strictEqual(stepRollBound('MAX', -1, rollLimits), '18');
});

test('stepRollBound leaves unparseable text unchanged', () => {
    assert.strictEqual(stepRollBound('3a', 1, rollLimits), '3a');
});

test('stepRollBound leaves MIN unchanged when no tables are loaded', () => {
    assert.strictEqual(stepRollBound('MIN', 1, null), 'MIN');
});
