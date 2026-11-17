const test = require('node:test');
const assert = require('node:assert');
const {loadScripts} = require('./load.js');

const {AliasTableRoller, randomBigIntBetween, randomBigIntBelow} = loadScripts(
    ['roller.js'], ['AliasTableRoller', 'randomBigIntBetween', 'randomBigIntBelow']
);

function assertUniform(draw, limit, {buckets = 10, draws = 50000} = {}) {
    const counts = new Array(buckets).fill(0);
    for (let i = 0; i < draws; i++) {
        const value = draw();
        assert.ok(value >= 0n && value < limit, `${value} is outside [0, ${limit})`);
        counts[Number((value * BigInt(buckets)) / limit)]++;
    }
    const expected = draws / buckets;
    const sevenSigmaTolerance = 7 * Math.sqrt(expected);
    counts.forEach((count, bucket) => {
        assert.ok(
            Math.abs(count - expected) < sevenSigmaTolerance,
            `slice ${bucket} got ${count} draws, expected about ${expected}: ${counts}`
        );
    });
}

test('randomBigIntBelow stays in [0, limit) and hits every value of a small range', () => {
    const seen = new Set();
    for (let i = 0; i < 2000; i++) {
        const value = randomBigIntBelow(7n);
        assert.ok(value >= 0n && value < 7n);
        seen.add(value);
    }
    assert.deepStrictEqual([...seen].sort(), [0n, 1n, 2n, 3n, 4n, 5n, 6n]);
});

test('randomBigIntBelow(1) is always 0', () => {
    for (let i = 0; i < 100; i++) {
        assert.strictEqual(randomBigIntBelow(1n), 0n);
    }
});

test('randomBigIntBelow rejects a limit that is not positive', () => {
    assert.throws(() => randomBigIntBelow(0n), RangeError);
    assert.throws(() => randomBigIntBelow(-5n), RangeError);
});

test('randomBigIntBelow is uniform on a small range', () => {
    assertUniform(() => randomBigIntBelow(10n), 10n);
});

test('randomBigIntBelow is uniform just past a power of two, where almost half of all draws are rejected', () => {
    const limit = 2n ** 20n + 1n;
    assertUniform(() => randomBigIntBelow(limit), limit);
});

test('randomBigIntBelow is uniform on a range far beyond 2^53', () => {
    const limit = 15n * 10n ** 30n;
    assertUniform(() => randomBigIntBelow(limit), limit);
});

test('randomBigIntBetween covers low to high inclusive, in either order', () => {
    const seen = new Set();
    for (let i = 0; i < 2000; i++) {
        seen.add(randomBigIntBetween(-2n, 2n));
        seen.add(randomBigIntBetween(2n, -2n));
    }
    assert.deepStrictEqual([...seen].sort((a, b) => Number(a - b)), [-2n, -1n, 0n, 1n, 2n]);
});

test('randomBigIntBetween accepts numbers and strings like the lambda sends', () => {
    const value = randomBigIntBetween('0', 5);
    assert.ok(value >= 0n && value <= 5n);
});

test('AliasTableRoller converts heights to BigInt and copies the aliases', () => {
    const aliases = [
        {primary: '1', alternate: '2', primaryHeight: '3'},
        {primary: '2', alternate: '2', primaryHeight: '5'},
    ];
    const roller = new AliasTableRoller('5', aliases);
    assert.strictEqual(roller.height, 5n);
    assert.deepStrictEqual(roller.aliases, [
        {primary: '1', alternate: '2', primaryHeight: 3n},
        {primary: '2', alternate: '2', primaryHeight: 5n},
    ]);
    assert.notStrictEqual(roller.aliases, aliases);
});

test('AliasTableRoller.roll picks the column, then primary below primaryHeight and alternate at or above it', () => {
    const aliases = [
        {primary: '1', alternate: '4', primaryHeight: '3'},
        {primary: '2', alternate: '5', primaryHeight: '2'},
    ];
    const queuedColumnThenHeight = [];
    const fakeRandomizerFromQueue = () => queuedColumnThenHeight.shift();
    const roller = new AliasTableRoller('5', aliases, fakeRandomizerFromQueue);

    queuedColumnThenHeight.push(0n, 2n);
    assert.strictEqual(roller.roll(), '1', 'column 0, height 2 < 3: primary');
    queuedColumnThenHeight.push(0n, 3n);
    assert.strictEqual(roller.roll(), '4', 'column 0, height 3 >= 3: alternate');
    queuedColumnThenHeight.push(1n, 1n);
    assert.strictEqual(roller.roll(), '2', 'column 1, height 1 < 2: primary');
    queuedColumnThenHeight.push(1n, 4n);
    assert.strictEqual(roller.roll(), '5', 'column 1, height 4 >= 2: alternate');
});

test('AliasTableRoller.roll asks for a column in [0, columns - 1] and a height in [0, height - 1]', () => {
    const calls = [];
    const fake = (low, high) => {
        calls.push([low, high]);
        return low;
    };
    new AliasTableRoller('7', [
        {primary: '1', alternate: '1', primaryHeight: '7'},
        {primary: '2', alternate: '2', primaryHeight: '7'},
        {primary: '3', alternate: '3', primaryHeight: '7'},
    ], fake).roll();
    assert.deepStrictEqual(calls, [[0n, 2n], [0n, 6n]]);
});

test('AliasTableRoller rolls a fair die evenly', () => {
    const die6AliasTable = ['6', '5', '4', '3', '2', '1'].map(roll => ({primary: roll, alternate: roll, primaryHeight: '6'}));
    const roller = new AliasTableRoller('6', die6AliasTable);
    const counts = {};
    const draws = 60000;
    for (let i = 0; i < draws; i++) {
        const roll = roller.roll();
        counts[roll] = (counts[roll] || 0) + 1;
    }
    assert.deepStrictEqual(Object.keys(counts).sort(), ['1', '2', '3', '4', '5', '6']);
    Object.values(counts).forEach(count => assert.ok(Math.abs(count - draws / 6) < 7 * Math.sqrt(draws / 6)));
});

test('AliasTableRoller follows a weighted alias table', () => {
    const oneThirdOnesAliasTable = [
        {primary: '1', alternate: '2', primaryHeight: '2'},
        {primary: '2', alternate: '2', primaryHeight: '3'},
    ];
    const roller = new AliasTableRoller('3', oneThirdOnesAliasTable);
    const draws = 60000;
    let ones = 0;
    for (let i = 0; i < draws; i++) {
        if (roller.roll() === '1') {
            ones++;
        }
    }
    const expected = draws / 3;
    assert.ok(Math.abs(ones - expected) < 7 * Math.sqrt(expected), `${ones} ones, expected about ${expected}`);
});
