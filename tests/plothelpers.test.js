const test = require('node:test');
const assert = require('node:assert');
const {loadScripts} = require('./load.js');

const {
    getDiceList, getTraceColor, getStatsFillColor, getStatsFillTrace, getRangeLabel, getStatsTraceName,
} = loadScripts(
    ['plothelpers.js'],
    ['getDiceList', 'getTraceColor', 'getStatsFillColor', 'getStatsFillTrace', 'getRangeLabel', 'getStatsTraceName'],
);

test('getDiceList strips the DiceTable wrapper from the lambda name', () => {
    assert.strictEqual(getDiceList('<DiceTable containing [1D6]>'), '[1D6]');
    assert.strictEqual(getDiceList('<DiceTable containing [2D4, 3D8]>'), '[2D4, 3D8]');
    assert.strictEqual(getDiceList('<DiceTable containing []>'), '[]');
});

test('getDiceList leaves anything else alone', () => {
    assert.strictEqual(getDiceList('[1D6]'), '[1D6]');
});

test('getTraceColor cycles through ten colors', () => {
    assert.strictEqual(getTraceColor(0), '#1f77b4');
    assert.strictEqual(getTraceColor(1), '#ff7f0e');
    assert.strictEqual(getTraceColor(10), getTraceColor(0));
});

test('getTraceColor gives the plotly default colors as hex', () => {
    const plotlyDefaultColors = [
        '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
        '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf',
    ];
    assert.deepStrictEqual(plotlyDefaultColors.map((_, index) => getTraceColor(index)), plotlyDefaultColors);
});

test('getStatsFillColor shifts the trace color per range and stays half transparent', () => {
    assert.strictEqual(getStatsFillColor(0, 0), 'rgba(31,109,190,0.5)');
    assert.strictEqual(getStatsFillColor(0, 1), 'rgba(41,129,190,0.5)');
    assert.strictEqual(getStatsFillColor(10, 10), getStatsFillColor(0, 0));
});

test('getStatsFillColor keeps channels within 0 to 255', () => {
    const orangeShiftedPastMaxRed = getStatsFillColor(1, 1);
    assert.strictEqual(orangeShiftedPastMaxRed, 'rgba(255,137,24,0.5)');
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
