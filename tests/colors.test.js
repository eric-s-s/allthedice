const test = require('node:test');
const assert = require('node:assert');
const {loadScripts} = require('./load.js');
const {makeDieTable} = require('./page.js');

const {
    getTraceColor, getStatsFillColor, lowestUnusedIndex, getUnusedColorIndex, getUnusedShiftIndex,
    parseDiceTable, DiceTableRequest, StatsRequest,
} = loadScripts(
    ['roller.js', 'plothelpers.js', 'colors.js', 'models.js', 'fetch-dice-tables.js'],
    [
        'getTraceColor', 'getStatsFillColor', 'lowestUnusedIndex', 'getUnusedColorIndex', 'getUnusedShiftIndex',
        'parseDiceTable', 'DiceTableRequest', 'StatsRequest',
    ],
);

function makeDiceTable(sides = 3) {
    return parseDiceTable(makeDieTable(sides));
}

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

test('lowestUnusedIndex returns the lowest index not in use', () => {
    assert.strictEqual(lowestUnusedIndex([]), 0);
    assert.strictEqual(lowestUnusedIndex([1, 2]), 0);
    assert.strictEqual(lowestUnusedIndex([0, 1, 3]), 2);
    assert.strictEqual(lowestUnusedIndex([2, 0, 1]), 3);
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
