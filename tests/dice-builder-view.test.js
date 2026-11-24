const test = require('node:test');
const assert = require('node:assert');
const {openPage, fakeLambda, makeDieTable, settle} = require('./page.js');

const die6 = makeDieTable(6);

function openPageWithDie6() {
    return openPage({lambda: fakeLambda({'Die(6)': die6, '2*Die(6)': die6})});
}

function getFirstRow(page) {
    return page.getDiceTableRequestRows()[0];
}

function getPreview(builder) {
    return builder.querySelector('.builderPreview').textContent;
}

function press(builder, selector) {
    builder.querySelector(selector).click();
}

function pressPreset(builder, sides) {
    press(builder, `[data-sides="${sides}"]`);
}

function choose(page, select, value) {
    select.value = value;
    select.dispatchEvent(new page.window.Event('change', {bubbles: true}));
}

function getPartLabels(builder) {
    return [...builder.querySelectorAll('.builderDieLabel')].map(label => label.textContent);
}

test('each dice collection row has a Build button', async () => {
    const page = await openPageWithDie6();
    page.document.getElementById('addDiceTableRequest').click();
    assert.ok(page.getDiceTableRequestRows().every(row => row.querySelector('.build') !== null));
});

test('Build opens the builder', async () => {
    const page = await openPageWithDie6();
    assert.ok(page.openBuilder(getFirstRow(page)).open);
});

test('Build on a blank row opens an empty builder with no unreadable note', async () => {
    const page = await openPageWithDie6();
    const builder = page.openBuilder(getFirstRow(page));
    assert.deepStrictEqual(getPartLabels(builder), []);
    assert.ok(builder.querySelector('.builderUnreadableNote').hidden);
});

test('Build on a row with text the builder wrote opens with those parts', async () => {
    const page = await openPageWithDie6();
    page.typeInto(getFirstRow(page).elements.buildString, '2*Die(6)&Exploding(Die(8))');
    const builder = page.openBuilder(getFirstRow(page));
    assert.deepStrictEqual(getPartLabels(builder), ['Die(6)', 'Die(8)']);
});

test('Build on a row with text the builder cannot read shows the unreadable note and starts empty', async () => {
    const page = await openPageWithDie6();
    page.typeInto(getFirstRow(page).elements.buildString, 'ExplodingOn(Die(6), (1, ))');
    const builder = page.openBuilder(getFirstRow(page));
    const note = builder.querySelector('.builderUnreadableNote');
    assert.ok(!note.hidden);
    assert.strictEqual(note.querySelector('code').textContent, 'ExplodingOn(Die(6), (1, ))');
    assert.deepStrictEqual(getPartLabels(builder), []);
});

test('clicking D6 twice previews 2*Die(6)', async () => {
    const page = await openPageWithDie6();
    const builder = page.openBuilder(getFirstRow(page));
    pressPreset(builder, 6);
    pressPreset(builder, 6);
    assert.strictEqual(getPreview(builder), '2*Die(6)');
});

test('choosing Best of pool shows the Pool and Keep boxes', async () => {
    const page = await openPageWithDie6();
    const builder = page.openBuilder(getFirstRow(page));
    pressPreset(builder, 6);
    choose(page, builder.querySelector('[name=wrapper]'), 'best');
    assert.ok([...builder.querySelectorAll('.builderPool')].every(label => !label.hidden));
});

test('choosing WeightedDie with 4 sides shows four weight boxes', async () => {
    const page = await openPageWithDie6();
    const builder = page.openBuilder(getFirstRow(page));
    choose(page, builder.querySelector('[name=customKind]'), 'WeightedDie');
    page.typeInto(builder.querySelector('[name=customSides]'), '4');
    assert.strictEqual(builder.querySelectorAll('.builderWeights input').length, 4);
});

test('the collection modifier + button previews Modifier(1)', async () => {
    const page = await openPageWithDie6();
    const builder = page.openBuilder(getFirstRow(page));
    press(builder, '[name=modifierUp]');
    assert.strictEqual(getPreview(builder), 'Modifier(1)');
});

test('the custom die modifier - button steps it below 0', async () => {
    const page = await openPageWithDie6();
    const builder = page.openBuilder(getFirstRow(page));
    choose(page, builder.querySelector('[name=customKind]'), 'ModDie');
    press(builder, '[name=customModifierDown]');
    assert.strictEqual(builder.querySelector('[name=customModifier]').value, '-1');
});

test('Done is disabled for an empty builder', async () => {
    const page = await openPageWithDie6();
    const builder = page.openBuilder(getFirstRow(page));
    assert.ok(builder.querySelector('[name=done]').disabled);
});

test('Done is disabled while a box is invalid, and that box is marked invalid', async () => {
    const page = await openPageWithDie6();
    const builder = page.openBuilder(getFirstRow(page));
    pressPreset(builder, 6);
    const count = builder.querySelector('[name=count]');
    page.typeInto(count, '0');
    assert.ok(builder.querySelector('[name=done]').disabled);
    assert.strictEqual(count.getAttribute('aria-invalid'), 'true');
});

test('Done writes the build string into the row', async () => {
    const page = await openPageWithDie6();
    const builder = page.openBuilder(getFirstRow(page));
    pressPreset(builder, 6);
    pressPreset(builder, 6);
    press(builder, '[name=done]');
    await settle();
    assert.strictEqual(getFirstRow(page).elements.buildString.value, '2*Die(6)');
});

test('Done calculates the row', async () => {
    const page = await openPageWithDie6();
    const builder = page.openBuilder(getFirstRow(page));
    pressPreset(builder, 6);
    press(builder, '[name=done]');
    await settle();
    assert.deepStrictEqual(page.lambda.requests.map(request => request.buildString), ['Die(6)']);
});

test('Done closes the builder', async () => {
    const page = await openPageWithDie6();
    const builder = page.openBuilder(getFirstRow(page));
    pressPreset(builder, 6);
    press(builder, '[name=done]');
    await settle();
    assert.ok(!builder.open);
});

test('Cancel closes the builder and leaves the row\'s text unchanged', async () => {
    const page = await openPageWithDie6();
    page.typeInto(getFirstRow(page).elements.buildString, 'Die(6)');
    const builder = page.openBuilder(getFirstRow(page));
    pressPreset(builder, 8);
    press(builder, '[name=cancel]');
    assert.ok(!builder.open);
    assert.strictEqual(getFirstRow(page).elements.buildString.value, 'Die(6)');
});

test('Escape closes the builder and leaves the row\'s text unchanged', async () => {
    const page = await openPageWithDie6();
    page.typeInto(getFirstRow(page).elements.buildString, 'Die(6)');
    const builder = page.openBuilder(getFirstRow(page));
    pressPreset(builder, 8);
    builder.dispatchEvent(new page.window.Event('cancel', {cancelable: true}));
    assert.ok(!builder.open);
    assert.strictEqual(getFirstRow(page).elements.buildString.value, 'Die(6)');
});

test('changing the builder does not re-plot', async () => {
    const page = await openPageWithDie6();
    const builder = page.openBuilder(getFirstRow(page));
    const plotCount = page.plotly.reactCalls.length;
    pressPreset(builder, 6);
    assert.strictEqual(page.plotly.reactCalls.length, plotCount);
});

test('Build is disabled while the row is calculating', async () => {
    const page = await openPageWithDie6();
    const row = getFirstRow(page);
    page.typeInto(row.elements.buildString, 'Die(6)');
    row.querySelector('[type=submit]').click();
    assert.ok(row.querySelector('.build').disabled);
});
