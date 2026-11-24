const test = require('node:test');
const assert = require('node:assert');
const {loadScripts} = require('./load.js');

const {BuilderPart, CustomDieDraft, DiceBuilder, dieToBuildString, partToBuildString} = loadScripts(
    ['dice-builder.js'],
    ['BuilderPart', 'CustomDieDraft', 'DiceBuilder', 'dieToBuildString', 'partToBuildString'],
);

const d6 = {kind: 'Die', sides: 6};

function makePart(die = d6, fields = {}) {
    return Object.assign(new BuilderPart(die), fields);
}

// ---------- dieToBuildString ----------

test('dieToBuildString writes a Die', () => {
    assert.strictEqual(dieToBuildString(d6), 'Die(6)');
});

test('dieToBuildString writes a ModDie', () => {
    assert.strictEqual(dieToBuildString({kind: 'ModDie', sides: 6, modifier: -2}), 'ModDie(6, -2)');
});

test('dieToBuildString writes a WeightedDie', () => {
    assert.strictEqual(dieToBuildString({kind: 'WeightedDie', weights: [1, 2]}), 'WeightedDie({1: 1, 2: 2})');
});

test('dieToBuildString leaves out faces with weight 0', () => {
    assert.strictEqual(dieToBuildString({kind: 'WeightedDie', weights: [1, 0, 2]}), 'WeightedDie({1: 1, 3: 2})');
});

test('dieToBuildString writes a ModWeightedDie', () => {
    assert.strictEqual(
        dieToBuildString({kind: 'ModWeightedDie', weights: [1, 2], modifier: 3}),
        'ModWeightedDie({1: 1, 2: 2}, 3)',
    );
});

// ---------- partToBuildString ----------

test('partToBuildString leaves out a count of 1', () => {
    assert.strictEqual(partToBuildString(makePart()), 'Die(6)');
});

test('partToBuildString writes a count of 2 as 2*', () => {
    assert.strictEqual(partToBuildString(makePart(d6, {countInput: '2'})), '2*Die(6)');
});

test('partToBuildString writes a Best of pool', () => {
    const part = makePart(d6, {wrapper: 'best', poolSizeInput: '4', keepInput: '3'});
    assert.strictEqual(partToBuildString(part), 'BestOfDicePool(DicePool(Die(6), 4), 3)');
});

test('partToBuildString writes a Worst of pool', () => {
    const part = makePart(d6, {wrapper: 'worst', poolSizeInput: '4', keepInput: '2'});
    assert.strictEqual(partToBuildString(part), 'WorstOfDicePool(DicePool(Die(6), 4), 2)');
});

test('partToBuildString writes Exploding', () => {
    assert.strictEqual(partToBuildString(makePart(d6, {wrapper: 'exploding'})), 'Exploding(Die(6))');
});

test('partToBuildString writes Strong', () => {
    const part = makePart(d6, {wrapper: 'strong', multiplierInput: '3'});
    assert.strictEqual(partToBuildString(part), 'StrongDie(Die(6), 3)');
});

test('partToBuildString returns null for a count of 0', () => {
    assert.strictEqual(partToBuildString(makePart(d6, {countInput: '0'})), null);
});

test('partToBuildString returns null when keep is more than the pool size', () => {
    const part = makePart(d6, {wrapper: 'best', poolSizeInput: '2', keepInput: '3'});
    assert.strictEqual(partToBuildString(part), null);
});

test('partToBuildString ignores the pool boxes when the wrapper is not a pool', () => {
    assert.strictEqual(partToBuildString(makePart(d6, {poolSizeInput: 'x', keepInput: ''})), 'Die(6)');
});

// ---------- DiceBuilder ----------

test('toBuildString joins parts with &', () => {
    const builder = new DiceBuilder();
    builder.parts.push(makePart(d6, {countInput: '2'}), makePart({kind: 'Die', sides: 8}));
    assert.strictEqual(builder.toBuildString(), '2*Die(6)&Die(8)');
});

test('toBuildString leaves out a modifier of 0', () => {
    const builder = new DiceBuilder();
    builder.parts.push(makePart());
    assert.strictEqual(builder.toBuildString(), 'Die(6)');
});

test('toBuildString puts a nonzero modifier last', () => {
    const builder = new DiceBuilder();
    builder.parts.push(makePart());
    builder.modifierInput = '-3';
    assert.strictEqual(builder.toBuildString(), 'Die(6)&Modifier(-3)');
});

test('toBuildString gives an empty string for an empty builder', () => {
    assert.strictEqual(new DiceBuilder().toBuildString(), '');
});

test('toBuildString gives null when a box is invalid', () => {
    const builder = new DiceBuilder();
    builder.parts.push(makePart(d6, {countInput: 'x'}));
    assert.strictEqual(builder.toBuildString(), null);
});

test('addPreset adds a part with count 1', () => {
    const builder = new DiceBuilder();
    builder.addPreset(20);
    assert.strictEqual(builder.toBuildString(), 'Die(20)');
});

test('addPreset adds 1 to a matching plain part', () => {
    const builder = new DiceBuilder();
    builder.addPreset(6);
    builder.addPreset(6);
    assert.strictEqual(builder.parts.length, 1);
    assert.strictEqual(builder.parts[0].countInput, '2');
});

test('addPreset adds a new part when the match has a wrapper', () => {
    const builder = new DiceBuilder();
    builder.addPreset(6);
    builder.parts[0].wrapper = 'exploding';
    builder.addPreset(6);
    assert.strictEqual(builder.toBuildString(), 'Exploding(Die(6))&Die(6)');
});

test('addCustomDie adds the draft\'s die', () => {
    const builder = new DiceBuilder();
    builder.draft.kind = 'ModDie';
    builder.draft.setSides('8');
    builder.draft.modifierInput = '1';
    builder.addCustomDie();
    assert.strictEqual(builder.toBuildString(), 'ModDie(8, 1)');
});

test('addCustomDie does nothing for an invalid draft', () => {
    const builder = new DiceBuilder();
    builder.draft.setSides('0');
    builder.addCustomDie();
    assert.strictEqual(builder.parts.length, 0);
});

test('stepCount keeps a count of 1 at 1', () => {
    const builder = new DiceBuilder();
    builder.addPreset(6);
    builder.stepCount(builder.parts[0].id, -1);
    assert.strictEqual(builder.parts[0].countInput, '1');
});

test('stepModifier steps below 0', () => {
    const builder = new DiceBuilder();
    builder.stepModifier(-1);
    assert.strictEqual(builder.modifierInput, '-1');
});

test('removePart removes only that part', () => {
    const builder = new DiceBuilder();
    builder.addPreset(6);
    builder.addPreset(8);
    builder.removePart(builder.parts[0].id);
    assert.strictEqual(builder.toBuildString(), 'Die(8)');
});

// ---------- CustomDieDraft ----------

test('setSides adds new weights as 1', () => {
    const draft = new CustomDieDraft();
    draft.setSides('8');
    assert.deepStrictEqual(draft.weightInputs.slice(6), ['1', '1']);
});

test('setSides keeps the weights still in range', () => {
    const draft = new CustomDieDraft();
    draft.weightInputs[1] = '5';
    draft.setSides('2');
    assert.deepStrictEqual(draft.weightInputs, ['1', '5']);
});

test('setSides leaves the weights alone for invalid text', () => {
    const draft = new CustomDieDraft();
    draft.setSides('');
    assert.strictEqual(draft.weightInputs.length, 6);
});

test('toDie gives null when every weight is 0', () => {
    const draft = new CustomDieDraft();
    draft.kind = 'WeightedDie';
    draft.setSides('2');
    draft.weightInputs = ['0', '0'];
    assert.strictEqual(draft.toDie(), null);
});

test('toDie gives null for more than 100 weighted sides', () => {
    const draft = new CustomDieDraft();
    draft.kind = 'WeightedDie';
    draft.setSides('101');
    assert.strictEqual(draft.toDie(), null);
});

test('toDie ignores the weights for a Die', () => {
    const draft = new CustomDieDraft();
    draft.weightInputs[0] = 'x';
    assert.deepStrictEqual(draft.toDie(), d6);
});
