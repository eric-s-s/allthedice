const test = require('node:test');
const assert = require('node:assert');
const {loadScripts} = require('./load.js');

const {parseBuildString} = loadScripts(['dice-builder.js', 'build-string-parser.js'], ['parseBuildString']);

const d6 = {kind: 'Die', sides: 6};

/** parses the text, then writes it back the way the builder does */
function roundTrip(text) {
    return parseBuildString(text).toBuildString();
}

test('parseBuildString gives an empty builder for blank text', () => {
    assert.strictEqual(parseBuildString('  ').parts.length, 0);
});

test('parseBuildString reads a count', () => {
    assert.strictEqual(parseBuildString('3*Die(6)').parts[0].countInput, '3');
});

test('parseBuildString reads 1* as a count of 1', () => {
    assert.strictEqual(roundTrip('1*Die(6)'), 'Die(6)');
});

test('parseBuildString reads a Die', () => {
    assert.deepStrictEqual(parseBuildString('Die(6)').parts[0].die, d6);
});

test('parseBuildString reads a ModDie', () => {
    assert.deepStrictEqual(parseBuildString('ModDie(6, -2)').parts[0].die, {kind: 'ModDie', sides: 6, modifier: -2});
});

test('parseBuildString reads a WeightedDie', () => {
    assert.deepStrictEqual(
        parseBuildString('WeightedDie({1: 1, 2: 2})').parts[0].die,
        {kind: 'WeightedDie', weights: [1, 2]},
    );
});

test('parseBuildString reads a ModWeightedDie', () => {
    assert.deepStrictEqual(
        parseBuildString('ModWeightedDie({1: 1, 2: 2}, 5)').parts[0].die,
        {kind: 'ModWeightedDie', weights: [1, 2], modifier: 5},
    );
});

test('parseBuildString fills missing weighted faces with 0', () => {
    assert.deepStrictEqual(parseBuildString('WeightedDie({3: 2, 1: 1})').parts[0].die.weights, [1, 0, 2]);
});

test('parseBuildString reads a Best of pool', () => {
    assert.strictEqual(roundTrip('BestOfDicePool(DicePool(Die(6), 3), 2)'), 'BestOfDicePool(DicePool(Die(6), 3), 2)');
});

test('parseBuildString reads a Worst of pool', () => {
    assert.strictEqual(
        roundTrip('WorstOfDicePool(DicePool(Die(6), 4), 2)'),
        'WorstOfDicePool(DicePool(Die(6), 4), 2)',
    );
});

test('parseBuildString reads Exploding', () => {
    assert.strictEqual(parseBuildString('Exploding(Die(6))').parts[0].wrapper, 'exploding');
});

test('parseBuildString reads Strong', () => {
    assert.strictEqual(roundTrip('2*StrongDie(Die(6), 3)'), '2*StrongDie(Die(6), 3)');
});

test('parseBuildString reads Modifier', () => {
    assert.strictEqual(parseBuildString('2*Die(6)&Modifier(-3)').modifierInput, '-3');
});

test('parseBuildString allows extra whitespace', () => {
    assert.strictEqual(roundTrip(' 5 * WeightedDie( {1:1,2: 2} ) '), '5*WeightedDie({1: 1, 2: 2})');
});

test('parseBuildString gives null for stacked wrappers', () => {
    assert.strictEqual(parseBuildString('Exploding(StrongDie(Die(6), 2))'), null);
});

test('parseBuildString gives null for two Modifiers', () => {
    assert.strictEqual(parseBuildString('Modifier(1)&Modifier(2)'), null);
});

test('parseBuildString gives null for an unknown die', () => {
    assert.strictEqual(parseBuildString('ExplodingOn(Die(6), (1, 6))'), null);
});

test('parseBuildString gives null for a keep larger than the pool', () => {
    assert.strictEqual(parseBuildString('BestOfDicePool(DicePool(Die(6), 2), 3)'), null);
});

test('parseBuildString reads back what toBuildString writes', () => {
    const text = '2*Die(6)&BestOfDicePool(DicePool(ModDie(8, 1), 4), 3)&Modifier(-2)';
    assert.strictEqual(roundTrip(text), text);
});
