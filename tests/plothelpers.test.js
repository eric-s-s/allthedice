const test = require('node:test');
const assert = require('node:assert');
const {loadScripts} = require('./load.js');

const {getDiceList, getStatsFillTrace, getRangeLabel, getStatsTraceName} = loadScripts(
    ['plothelpers.js'],
    ['getDiceList', 'getStatsFillTrace', 'getRangeLabel', 'getStatsTraceName'],
);

test('getDiceList strips the DiceTable wrapper from the lambda name', () => {
    assert.strictEqual(getDiceList('<DiceTable containing [1D6]>'), '[1D6]');
    assert.strictEqual(getDiceList('<DiceTable containing [2D4, 3D8]>'), '[2D4, 3D8]');
    assert.strictEqual(getDiceList('<DiceTable containing []>'), '[]');
});

test('getDiceList leaves anything else alone', () => {
    assert.strictEqual(getDiceList('[1D6]'), '[1D6]');
});

const die = {x: [1, 2, 3, 4], y: [10, 20, 30, 40]};

test('getStatsFillTrace covers the whole curve and stops at its ends', () => {
    assert.deepStrictEqual(getStatsFillTrace(1, 4, die), {x: [1, 2, 3, 4], y: [10, 20, 30, 40]});
    assert.deepStrictEqual(getStatsFillTrace(-10, 10, die), {x: [1, 2, 3, 4], y: [10, 20, 30, 40]});
});

test('getStatsFillTrace reaches partway toward the neighboring rolls', () => {
    const fill = getStatsFillTrace(2, 3, die);
    assert.deepStrictEqual(fill.x.map(x => +x.toFixed(2)), [1.52, 2, 3, 3.48]);
    assert.deepStrictEqual(fill.y.map(y => +y.toFixed(2)), [15.2, 20, 30, 34.8]);
});

test('getStatsFillTrace shades a single roll as a band', () => {
    const fill = getStatsFillTrace(1, 1, die);
    assert.deepStrictEqual(fill.x.map(x => +x.toFixed(2)), [1, 1.48]);
});

test('getStatsFillTrace is empty when the range misses every roll', () => {
    assert.deepStrictEqual(getStatsFillTrace(5, 9, die), {x: [], y: []});
    assert.deepStrictEqual(getStatsFillTrace(-3, 0, die), {x: [], y: []});
});

test('getStatsFillTrace handles rolls that skip numbers', () => {
    const everyThirdRoll = {x: [6, 9, 12], y: [1, 2, 1]};
    const fill = getStatsFillTrace(7, 12, everyThirdRoll);
    assert.deepStrictEqual(fill.x.map(x => +x.toFixed(2)), [7.56, 9, 12]);
    assert.deepStrictEqual(getStatsFillTrace(7, 8, everyThirdRoll), {x: [], y: []});
});

test('getRangeLabel and getStatsTraceName', () => {
    assert.strictEqual(getRangeLabel(3, 7), '3 to 7');
    assert.strictEqual(getRangeLabel(4, 4), '4');
    assert.strictEqual(getStatsTraceName('[2D6]', 3, 7, '41.67'), '[2D6] 3 to 7: 41.67%');
});
