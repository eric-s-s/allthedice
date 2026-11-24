const test = require('node:test');
const assert = require('node:assert');
const {openPage, fakeLambda, jsonResponse, makeDieTable, settle} = require('./page.js');

const die3 = makeDieTable(3);
const die6 = makeDieTable(6);
const die101 = makeDieTable(101);
const die3PlusTen = makeDieTable(3, {offset: 10});
const knownTables = {'Die(3)': die3, 'Die(6)': die6, 'Die(101)': die101, 'Die(3)+10': die3PlusTen};

function fromPage(value) {
    return JSON.parse(JSON.stringify(value));
}

function asCssColor(page, color) {
    const probe = page.document.createElement('span');
    probe.style.color = color;
    return probe.style.color;
}

function getLastTraces(page) {
    return fromPage(page.plotly.getLastPlot().traces);
}

function openPageWithKnownTables(options = {}) {
    return openPage({lambda: fakeLambda(knownTables), ...options});
}

function getTraceNames(page) {
    return getLastTraces(page).map(trace => trace.name);
}

function getStatsTableRows(page) {
    return [...page.document.querySelectorAll('#statsTable tr')].map(row =>
        [...row.children].map(cell => cell.firstChild ? cell.firstChild.textContent : '')
    );
}

function getRollerRow(page, index = 0) {
    const row = page.document.querySelectorAll('#rollerRows .rollerRow')[index];
    return {
        diceList: row.querySelector('.rollerDiceList').textContent,
        rollButton: row.querySelector('button'),
        latestRoll: () => row.querySelector('.latestRoll').textContent,
        earlierRolls: () => row.querySelector('.earlierRolls').textContent,
    };
}

function isShown(page, id) {
    return !page.document.getElementById(id).hidden;
}

test('the page starts with one blank dice table request, one blank stats request, and empty panels', async () => {
    const page = await openPageWithKnownTables();
    assert.strictEqual(page.getDiceTableRequestRows().length, 1);
    assert.strictEqual(page.getDiceTableRequestRows()[0].elements.buildString.value, '');
    assert.strictEqual(page.getStatsRequestRows().length, 1);
    assert.ok(isShown(page, 'plotEmpty'));
    assert.ok(isShown(page, 'statsEmpty'));
    assert.ok(!isShown(page, 'statsTable'));
    assert.ok(isShown(page, 'rollerEmpty'));
    assert.deepStrictEqual(getLastTraces(page), []);
    assert.strictEqual(page.lambda.requests.length, 0);
});

test('the add button adds a blank dice table request and focuses it', async () => {
    const page = await openPageWithKnownTables();
    page.document.getElementById('addDiceTableRequest').click();
    const rows = page.getDiceTableRequestRows();
    assert.strictEqual(rows.length, 2);
    assert.strictEqual(page.document.activeElement, rows[1].elements.buildString);
});

test('submitting posts the build string to the lambda as a plain-text body with no headers', async () => {
    const page = await openPageWithKnownTables();
    await page.submitDiceTableRequest(page.getDiceTableRequestRows()[0], 'Die(3)');
    assert.strictEqual(page.lambda.requests.length, 1);
    const {url, options} = page.lambda.requests[0];
    assert.strictEqual(url, page.window.getLambdaEndpoint());
    assert.strictEqual(options.method, 'POST');
    assert.strictEqual(options.body, JSON.stringify({buildString: 'Die(3)'}));
    assert.strictEqual(options.headers, undefined);
});

test('a loaded dice table is plotted with its dice list as the name and its swatch colored', async () => {
    const page = await openPageWithKnownTables();
    const row = page.getDiceTableRequestRows()[0];
    await page.submitDiceTableRequest(row, 'Die(3)');
    const [trace] = getLastTraces(page);
    assert.deepStrictEqual(trace.x, [1, 2, 3]);
    assert.deepStrictEqual(trace.y, die3.data.y);
    assert.strictEqual(trace.name, '[1D3]');
    assert.strictEqual(trace.mode, 'lines+markers');
    assert.strictEqual(trace.line.color, page.window.getTraceColor(0));
    const swatch = row.querySelector('.swatch');
    assert.ok(swatch.classList.contains('active'));
    assert.strictEqual(swatch.style.background, asCssColor(page, page.window.getTraceColor(0)));
    assert.ok(!isShown(page, 'plotEmpty'));
});

test('a dice table with more than 100 rolls is plotted as lines without markers', async () => {
    const page = await openPageWithKnownTables();
    await page.submitDiceTableRequest(page.getDiceTableRequestRows()[0], 'Die(101)');
    assert.strictEqual(getLastTraces(page)[0].mode, 'lines');
});

function getSwatchColor(row) {
    return row.querySelector('.swatch').style.background;
}

test('a dice table gets its color when it first loads, and requests that have not loaded get none', async () => {
    const page = await openPageWithKnownTables();
    page.document.getElementById('addDiceTableRequest').click();
    page.document.getElementById('addDiceTableRequest').click();
    const [first, unloaded, third] = page.getDiceTableRequestRows();
    await page.submitDiceTableRequest(third, 'Die(6)');
    await page.submitDiceTableRequest(first, 'Die(3)');
    const traces = getLastTraces(page);
    assert.deepStrictEqual(traces.map(trace => trace.name), ['[1D3]', '[1D6]']);
    assert.strictEqual(traces[0].line.color, page.window.getTraceColor(1));
    assert.strictEqual(traces[1].line.color, page.window.getTraceColor(0));
    assert.strictEqual(getSwatchColor(first), asCssColor(page, page.window.getTraceColor(1)));
    assert.strictEqual(getSwatchColor(third), asCssColor(page, page.window.getTraceColor(0)));
    assert.ok(!unloaded.querySelector('.swatch').classList.contains('active'));
});

test('a failed first load does not take a color', async () => {
    const page = await openPageWithKnownTables();
    page.document.getElementById('addDiceTableRequest').click();
    const [first, second] = page.getDiceTableRequestRows();
    await page.submitDiceTableRequest(first, 'Die(');
    await page.submitDiceTableRequest(second, 'Die(3)');
    assert.strictEqual(getSwatchColor(second), asCssColor(page, page.window.getTraceColor(0)));
    assert.ok(!first.querySelector('.swatch').classList.contains('active'));
});

test('a reload keeps the dice table\'s color', async () => {
    const page = await openPageWithKnownTables();
    page.document.getElementById('addDiceTableRequest').click();
    const [first, second] = page.getDiceTableRequestRows();
    await page.submitDiceTableRequest(first, 'Die(3)');
    await page.submitDiceTableRequest(second, 'Die(6)');
    await page.submitDiceTableRequest(second, 'Die(3)+10');
    assert.strictEqual(getLastTraces(page)[1].line.color, page.window.getTraceColor(1));
    assert.strictEqual(getSwatchColor(second), asCssColor(page, page.window.getTraceColor(1)));
});

test('a removed dice table\'s color goes to the next dice table that loads', async () => {
    const page = await openPageWithKnownTables();
    page.document.getElementById('addDiceTableRequest').click();
    page.document.getElementById('addDiceTableRequest').click();
    const [first, second, third] = page.getDiceTableRequestRows();
    await page.submitDiceTableRequest(first, 'Die(3)');
    await page.submitDiceTableRequest(second, 'Die(6)');
    first.querySelector('.remove').click();
    await page.submitDiceTableRequest(third, 'Die(101)');
    assert.deepStrictEqual(getLastTraces(page).map(trace => trace.line.color), [
        page.window.getTraceColor(1),
        page.window.getTraceColor(0),
    ]);
});

test('a pending request disables its submit button and ignores another submit', async () => {
    const lambda = fakeLambda(knownTables);
    let answerLambda;
    lambda.respond = () => new Promise(resolve => {
        answerLambda = () => resolve(jsonResponse(200, die3));
    });
    const page = await openPage({lambda});
    const row = page.getDiceTableRequestRows()[0];
    const submit = row.querySelector('[type=submit]');

    await page.submitDiceTableRequest(row, 'Die(3)');
    assert.ok(submit.disabled);
    assert.strictEqual(row.getAttribute('aria-busy'), 'true');
    row.dispatchEvent(new page.window.Event('submit', {cancelable: true}));
    assert.strictEqual(lambda.requests.length, 1);

    answerLambda();
    await settle();
    assert.ok(!submit.disabled);
    assert.strictEqual(row.getAttribute('aria-busy'), 'false');
    assert.deepStrictEqual(getTraceNames(page), ['[1D3]']);
});

test('a lambda error shows its type and message on the request and plots nothing', async () => {
    const page = await openPageWithKnownTables();
    const row = page.getDiceTableRequestRows()[0];
    await page.submitDiceTableRequest(row, 'Die(');
    const error = row.querySelector('.diceTableRequestError');
    assert.ok(!error.hidden);
    assert.strictEqual(error.textContent, 'ParseError: could not parse Die(');
    assert.deepStrictEqual(getLastTraces(page), []);
});

test('a lambda error without a type shows just the message', async () => {
    const lambda = fakeLambda({});
    lambda.respond = () => jsonResponse(400, {errorMessage: 'bad dice'});
    const page = await openPage({lambda});
    const row = page.getDiceTableRequestRows()[0];
    await page.submitDiceTableRequest(row, 'Die(3)');
    assert.strictEqual(row.querySelector('.diceTableRequestError').textContent, 'bad dice');
});

test('a failed response that is not JSON shows the status', async () => {
    const lambda = fakeLambda({});
    lambda.respond = () => new Response('oops', {status: 502, statusText: 'Bad Gateway'});
    const page = await openPage({lambda});
    const row = page.getDiceTableRequestRows()[0];
    await page.submitDiceTableRequest(row, 'Die(3)');
    assert.strictEqual(
        row.querySelector('.diceTableRequestError').textContent,
        'The dice server answered 502 Bad Gateway.'
    );
});

test('a successful response that is not JSON is an error', async () => {
    const lambda = fakeLambda({});
    lambda.respond = () => new Response('oops', {status: 200});
    const page = await openPage({lambda});
    const row = page.getDiceTableRequestRows()[0];
    await page.submitDiceTableRequest(row, 'Die(3)');
    assert.strictEqual(
        row.querySelector('.diceTableRequestError').textContent,
        'The dice server sent a response that was not JSON.'
    );
});

test('a successful response that is not a dice table is an error and plots nothing', async () => {
    const lambda = fakeLambda({});
    const {range, ...malformedResponseMissingRange} = die3;
    lambda.respond = () => jsonResponse(200, malformedResponseMissingRange);
    const page = await openPage({lambda});
    const row = page.getDiceTableRequestRows()[0];
    await page.submitDiceTableRequest(row, 'Die(3)');
    assert.strictEqual(
        row.querySelector('.diceTableRequestError').textContent,
        'The dice server sent a bad dice table: "range" must be an array.'
    );
    assert.deepStrictEqual(getLastTraces(page), []);
    assert.ok(!row.querySelector('.swatch').classList.contains('active'));
});

test('an unreachable lambda names the endpoint', async () => {
    const lambda = fakeLambda({});
    lambda.respond = () => Promise.reject(new TypeError('Failed to fetch'));
    const page = await openPage({lambda});
    const row = page.getDiceTableRequestRows()[0];
    await page.submitDiceTableRequest(row, 'Die(3)');
    assert.strictEqual(
        row.querySelector('.diceTableRequestError').textContent,
        `Could not reach the dice server at ${page.window.getLambdaEndpoint()}.`
    );
});

test('a successful submit clears the previous error', async () => {
    const page = await openPageWithKnownTables();
    const row = page.getDiceTableRequestRows()[0];
    await page.submitDiceTableRequest(row, 'Die(');
    await page.submitDiceTableRequest(row, 'Die(3)');
    assert.ok(row.querySelector('.diceTableRequestError').hidden);
    assert.strictEqual(row.querySelector('.diceTableRequestError').textContent, '');
});

test('a failed resubmit keeps the dice table that was already loaded', async () => {
    const page = await openPageWithKnownTables();
    const row = page.getDiceTableRequestRows()[0];
    await page.submitDiceTableRequest(row, 'Die(3)');
    await page.submitDiceTableRequest(row, 'Die(');
    assert.deepStrictEqual(getTraceNames(page), ['[1D3]']);
    assert.ok(!row.querySelector('.diceTableRequestError').hidden);
});

test('removing a dice table request removes its trace and leaves the other colors alone', async () => {
    const page = await openPageWithKnownTables();
    page.document.getElementById('addDiceTableRequest').click();
    const [first, second] = page.getDiceTableRequestRows();
    await page.submitDiceTableRequest(first, 'Die(3)');
    await page.submitDiceTableRequest(second, 'Die(6)');
    first.querySelector('.remove').click();
    assert.deepStrictEqual(page.getDiceTableRequestRows(), [second]);
    assert.deepStrictEqual(getTraceNames(page), ['[1D6]']);
    assert.strictEqual(getLastTraces(page)[0].line.color, page.window.getTraceColor(1));
    assert.strictEqual(getSwatchColor(second), asCssColor(page, page.window.getTraceColor(1)));
    const headers = page.document.querySelectorAll('#statsTable thead th');
    assert.strictEqual(headers[1].style.color, asCssColor(page, page.window.getTraceColor(1)));
});

test('removing the last dice table request leaves a blank one', async () => {
    const page = await openPageWithKnownTables();
    const row = page.getDiceTableRequestRows()[0];
    await page.submitDiceTableRequest(row, 'Die(3)');
    row.querySelector('.remove').click();
    const rows = page.getDiceTableRequestRows();
    assert.strictEqual(rows.length, 1);
    assert.notStrictEqual(rows[0], row);
    assert.strictEqual(rows[0].elements.buildString.value, '');
    assert.deepStrictEqual(getLastTraces(page), []);
    assert.ok(isShown(page, 'plotEmpty'));
});

function clickExample(page, buildString) {
    const button = [...page.document.querySelectorAll('.example')].find(b => b.dataset.build === buildString);
    button.closest('details').open = true;
    button.click();
    return button;
}

test('an example fills the blank dice table request, gets its table, and closes the menu', async () => {
    const lambda = fakeLambda({'Die(6)': die6});
    const page = await openPage({lambda});
    const button = clickExample(page, 'Die(6)');
    await settle();
    assert.ok(!button.closest('details').open);
    const rows = page.getDiceTableRequestRows();
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].elements.buildString.value, 'Die(6)');
    assert.deepStrictEqual(lambda.requests.map(r => r.buildString), ['Die(6)']);
    assert.deepStrictEqual(getTraceNames(page), ['[1D6]']);
});

test('an example adds a dice table request when none is blank', async () => {
    const page = await openPage({lambda: fakeLambda({'Die(3)': die3, 'Die(6)': die6})});
    await page.submitDiceTableRequest(page.getDiceTableRequestRows()[0], 'Die(3)');
    clickExample(page, 'Die(6)');
    await settle();
    const rows = page.getDiceTableRequestRows();
    assert.deepStrictEqual(rows.map(row => row.elements.buildString.value), ['Die(3)', 'Die(6)']);
    assert.deepStrictEqual(getTraceNames(page), ['[1D3]', '[1D6]']);
});

test('an example skips a request that has text but has not been submitted', async () => {
    const page = await openPage({lambda: fakeLambda({'Die(6)': die6})});
    page.typeInto(page.getDiceTableRequestRows()[0].elements.buildString, 'Die(4)');
    clickExample(page, 'Die(6)');
    await settle();
    const buildStrings = page.getDiceTableRequestRows().map(row => row.elements.buildString.value);
    assert.deepStrictEqual(buildStrings, ['Die(4)', 'Die(6)']);
});

function queueRollOfColumn(page, column) {
    const bytePickingColumnOfThree = column * 64;
    const anyHeight = 0;
    page.queuedRandomBytes.push(bytePickingColumnOfThree, anyHeight);
}

test('the roller has a row for each loaded dice table', async () => {
    const page = await openPageWithKnownTables();
    page.document.getElementById('addDiceTableRequest').click();
    page.document.getElementById('addDiceTableRequest').click();
    const [first, , third] = page.getDiceTableRequestRows();
    await page.submitDiceTableRequest(first, 'Die(3)');
    await page.submitDiceTableRequest(third, 'Die(6)');
    assert.ok(!isShown(page, 'rollerEmpty'));
    assert.strictEqual(page.document.querySelectorAll('#rollerRows .rollerRow').length, 2);
    assert.strictEqual(getRollerRow(page, 0).diceList, '[1D3]');
    assert.strictEqual(getRollerRow(page, 1).diceList, '[1D6]');
    assert.strictEqual(getRollerRow(page, 0).latestRoll(), 'None');
});

test('rolling shows the latest roll and the earlier rolls newest first', async () => {
    const page = await openPageWithKnownTables();
    await page.submitDiceTableRequest(page.getDiceTableRequestRows()[0], 'Die(3)');
    queueRollOfColumn(page, 0);
    queueRollOfColumn(page, 2);
    queueRollOfColumn(page, 1);
    const roller = getRollerRow(page);
    roller.rollButton.click();
    assert.strictEqual(roller.latestRoll(), '1');
    assert.strictEqual(roller.earlierRolls(), '');
    roller.rollButton.click();
    roller.rollButton.click();
    assert.strictEqual(roller.latestRoll(), '2');
    assert.strictEqual(roller.earlierRolls(), '3, 1');
});

test('roll history survives a render but is cleared when the dice table is reloaded', async () => {
    const page = await openPageWithKnownTables();
    const [row] = page.getDiceTableRequestRows();
    await page.submitDiceTableRequest(row, 'Die(3)');
    queueRollOfColumn(page, 2);
    getRollerRow(page).rollButton.click();

    page.document.getElementById('addDiceTableRequest').click();
    await page.submitDiceTableRequest(page.getDiceTableRequestRows()[1], 'Die(6)');
    assert.strictEqual(getRollerRow(page).latestRoll(), '3');

    await page.submitDiceTableRequest(row, 'Die(6)');
    assert.strictEqual(getRollerRow(page).latestRoll(), 'None');
});

test('the stats table has a column per loaded dice table with range, mean and std dev', async () => {
    const page = await openPageWithKnownTables();
    page.document.getElementById('addDiceTableRequest').click();
    const [first, second] = page.getDiceTableRequestRows();
    await page.submitDiceTableRequest(first, 'Die(3)');
    await page.submitDiceTableRequest(second, 'Die(6)');
    assert.ok(isShown(page, 'statsTable'));
    assert.ok(!isShown(page, 'statsEmpty'));
    assert.deepStrictEqual(getStatsTableRows(page), [
        ['', '[1D3]', '[1D6]'],
        ['Range', '1 to 3', '1 to 6'],
        ['Mean', '2', '3.5'],
        ['Std dev', String(die3.stddev), String(die6.stddev)],
    ]);
    const headers = page.document.querySelectorAll('#statsTable thead th');
    assert.strictEqual(headers[1].title, die3.diceStr);
    assert.strictEqual(headers[2].style.color, asCssColor(page, page.window.getTraceColor(1)));
});

test('stats inputs default to MIN and MAX', async () => {
    const page = await openPageWithKnownTables();
    const [statsRequest] = page.getStatsRequestRows();
    assert.strictEqual(statsRequest.elements.low.value, 'MIN');
    assert.strictEqual(statsRequest.elements.high.value, 'MAX');
});

test('adding a stats request focuses its low input', async () => {
    const page = await openPageWithKnownTables();
    page.document.getElementById('addStatsRequest').click();
    const added = page.getStatsRequestRows()[1];
    assert.strictEqual(page.document.activeElement, added.elements.low);
});

function getStatsRowLabel(page) {
    return getStatsTableRows(page)[4][0];
}

async function loadDiceTable(page, buildString) {
    let row = page.getDiceTableRequestRows().at(-1);
    if (row.elements.buildString.value !== '') {
        page.document.getElementById('addDiceTableRequest').click();
        row = page.getDiceTableRequestRows().at(-1);
    }
    await page.submitDiceTableRequest(row, buildString);
}

test('a submitted MIN follows a newly loaded dice table with a lower lowest roll', async () => {
    const page = await openPageWithKnownTables();
    await loadDiceTable(page, 'Die(3)+10');
    await page.submitStatsRequest(page.getStatsRequestRows()[0], 'MIN', 'MAX');
    assert.strictEqual(getStatsRowLabel(page), '11 to 13');

    await loadDiceTable(page, 'Die(3)');
    assert.strictEqual(getStatsRowLabel(page), '1 to 13');
});

test('a submitted MAX follows a newly loaded dice table with a higher highest roll', async () => {
    const page = await openPageWithKnownTables();
    await loadDiceTable(page, 'Die(3)');
    await page.submitStatsRequest(page.getStatsRequestRows()[0], 'MIN', 'MAX');
    assert.strictEqual(getStatsRowLabel(page), '1 to 3');

    await loadDiceTable(page, 'Die(3)+10');
    assert.strictEqual(getStatsRowLabel(page), '1 to 13');
});

test('a pinned low below the lowest roll after a dice table is removed snaps to MIN', async () => {
    const page = await openPageWithKnownTables();
    await loadDiceTable(page, 'Die(3)');
    await loadDiceTable(page, 'Die(3)+10');
    const [statsRequest] = page.getStatsRequestRows();
    await page.submitStatsRequest(statsRequest, 2, 12);
    page.getDiceTableRequestRows()[0].querySelector('.remove').click();
    assert.strictEqual(statsRequest.elements.low.value, 'MIN');
    assert.strictEqual(getStatsRowLabel(page), '11 to 12');
});

test('a pinned high above the highest roll after a dice table is removed snaps to MAX', async () => {
    const page = await openPageWithKnownTables();
    await loadDiceTable(page, 'Die(3)');
    await loadDiceTable(page, 'Die(3)+10');
    const [statsRequest] = page.getStatsRequestRows();
    await page.submitStatsRequest(statsRequest, 2, 12);
    page.getDiceTableRequestRows()[1].querySelector('.remove').click();
    assert.strictEqual(statsRequest.elements.high.value, 'MAX');
    assert.strictEqual(getStatsRowLabel(page), '2 to 3');
});

test('a low typed below the lowest roll snaps to MIN on submit', async () => {
    const page = await openPageWithKnownTables();
    await loadDiceTable(page, 'Die(3)+10');
    const [statsRequest] = page.getStatsRequestRows();
    await page.submitStatsRequest(statsRequest, 5, 12);
    assert.strictEqual(statsRequest.elements.low.value, 'MIN');
    assert.strictEqual(getStatsRowLabel(page), '11 to 12');
});

test('a high typed above the highest roll snaps to MAX on submit', async () => {
    const page = await openPageWithKnownTables();
    await loadDiceTable(page, 'Die(3)');
    const [statsRequest] = page.getStatsRequestRows();
    await page.submitStatsRequest(statsRequest, 2, 9);
    assert.strictEqual(statsRequest.elements.high.value, 'MAX');
    assert.strictEqual(getStatsRowLabel(page), '2 to 3');
});

test('typing that cannot become MIN, MAX or a whole number is undone', async () => {
    const page = await openPageWithKnownTables();
    const [statsRequest] = page.getStatsRequestRows();
    page.typeInto(statsRequest.elements.low, '5');
    page.typeInto(statsRequest.elements.low, '5a');
    assert.strictEqual(statsRequest.elements.low.value, '5');
});

test('typing the start of MAX is kept', async () => {
    const page = await openPageWithKnownTables();
    const [statsRequest] = page.getStatsRequestRows();
    page.typeInto(statsRequest.elements.high, 'ma');
    assert.strictEqual(statsRequest.elements.high.value, 'ma');
});

test('undone typing puts the cursor back where it was', async () => {
    const page = await openPageWithKnownTables();
    const [statsRequest] = page.getStatsRequestRows();
    const low = statsRequest.elements.low;
    page.typeInto(low, '12');
    low.value = '1x2';
    low.setSelectionRange(2, 2);
    low.dispatchEvent(new page.window.Event('input', {bubbles: true}));
    assert.strictEqual(low.selectionStart, 1);
});

test('a typed min shows as MIN after submit', async () => {
    const page = await openPageWithKnownTables();
    await loadDiceTable(page, 'Die(3)');
    const [statsRequest] = page.getStatsRequestRows();
    await page.submitStatsRequest(statsRequest, 'min', 'MAX');
    assert.strictEqual(statsRequest.elements.low.value, 'MIN');
});

test('the + button raises its box by 1', async () => {
    const page = await openPageWithKnownTables();
    await loadDiceTable(page, 'Die(6)');
    const [statsRequest] = page.getStatsRequestRows();
    page.typeInto(statsRequest.elements.low, '3');
    statsRequest.elements.lowUp.click();
    assert.strictEqual(statsRequest.elements.low.value, '4');
});

test('the - button lowers its box by 1', async () => {
    const page = await openPageWithKnownTables();
    await loadDiceTable(page, 'Die(6)');
    const [statsRequest] = page.getStatsRequestRows();
    page.typeInto(statsRequest.elements.high, '3');
    statsRequest.elements.highDown.click();
    assert.strictEqual(statsRequest.elements.high.value, '2');
});

test('- on a box holding the lowest roll changes it to MIN', async () => {
    const page = await openPageWithKnownTables();
    await loadDiceTable(page, 'Die(6)');
    const [statsRequest] = page.getStatsRequestRows();
    page.typeInto(statsRequest.elements.low, '1');
    statsRequest.elements.lowDown.click();
    assert.strictEqual(statsRequest.elements.low.value, 'MIN');
});

test('+ on a box holding the highest roll changes it to MAX', async () => {
    const page = await openPageWithKnownTables();
    await loadDiceTable(page, 'Die(6)');
    const [statsRequest] = page.getStatsRequestRows();
    page.typeInto(statsRequest.elements.high, '6');
    statsRequest.elements.highUp.click();
    assert.strictEqual(statsRequest.elements.high.value, 'MAX');
});

test('- on a box holding MIN leaves MIN', async () => {
    const page = await openPageWithKnownTables();
    await loadDiceTable(page, 'Die(6)');
    const [statsRequest] = page.getStatsRequestRows();
    statsRequest.elements.lowDown.click();
    assert.strictEqual(statsRequest.elements.low.value, 'MIN');
});

test('+ on a box holding MAX leaves MAX', async () => {
    const page = await openPageWithKnownTables();
    await loadDiceTable(page, 'Die(6)');
    const [statsRequest] = page.getStatsRequestRows();
    statsRequest.elements.highUp.click();
    assert.strictEqual(statsRequest.elements.high.value, 'MAX');
});

test('+ on a box holding MIN pins it to the lowest roll', async () => {
    const page = await openPageWithKnownTables();
    await loadDiceTable(page, 'Die(6)');
    const [statsRequest] = page.getStatsRequestRows();
    statsRequest.elements.lowUp.click();
    assert.strictEqual(statsRequest.elements.low.value, '1');
});

test('- on a box holding MAX pins it to the highest roll', async () => {
    const page = await openPageWithKnownTables();
    await loadDiceTable(page, 'Die(6)');
    const [statsRequest] = page.getStatsRequestRows();
    statsRequest.elements.highDown.click();
    assert.strictEqual(statsRequest.elements.high.value, '6');
});

function pointerEvent(page, type, init = {}) {
    return new page.window.MouseEvent(type, {bubbles: true, button: 0, ...init});
}

async function openPageToHoldLowUp() {
    const page = await openPageWithKnownTables();
    await loadDiceTable(page, 'Die(101)');
    const [statsRequest] = page.getStatsRequestRows();
    page.typeInto(statsRequest.elements.low, '50');
    return {
        page,
        low: statsRequest.elements.low,
        lowUp: statsRequest.elements.lowUp,
        holdDelayMs: page.window.eval('holdDelayMs'),
        holdRepeatMs: page.window.eval('holdRepeatMs'),
    };
}

test('pressing and releasing a step button steps once', async () => {
    const {page, low, lowUp} = await openPageToHoldLowUp();
    lowUp.dispatchEvent(pointerEvent(page, 'pointerdown'));
    lowUp.dispatchEvent(pointerEvent(page, 'pointerup'));
    lowUp.dispatchEvent(pointerEvent(page, 'click', {detail: 1}));
    assert.strictEqual(low.value, '51');
});

test('holding a step button repeats it after a delay', async () => {
    const {page, low, lowUp, holdDelayMs, holdRepeatMs} = await openPageToHoldLowUp();
    lowUp.dispatchEvent(pointerEvent(page, 'pointerdown'));
    page.clock.tick(holdDelayMs - 1);
    assert.strictEqual(low.value, '51');
    page.clock.tick(1 + 2 * holdRepeatMs);
    assert.strictEqual(low.value, '54');
});

test('releasing a held step button stops it', async () => {
    const {page, low, lowUp, holdDelayMs} = await openPageToHoldLowUp();
    lowUp.dispatchEvent(pointerEvent(page, 'pointerdown'));
    page.clock.tick(holdDelayMs);
    lowUp.dispatchEvent(pointerEvent(page, 'pointerup'));
    page.clock.tick(10 * holdDelayMs);
    assert.strictEqual(low.value, '52');
});

test('a held step button stops when the pointer leaves it', async () => {
    const {page, low, lowUp, holdDelayMs} = await openPageToHoldLowUp();
    lowUp.dispatchEvent(pointerEvent(page, 'pointerdown'));
    page.clock.tick(holdDelayMs);
    lowUp.dispatchEvent(pointerEvent(page, 'pointerleave'));
    page.clock.tick(10 * holdDelayMs);
    assert.strictEqual(low.value, '52');
});

test('stepping does not recalculate the stats row', async () => {
    const page = await openPageWithKnownTables();
    await loadDiceTable(page, 'Die(6)');
    const [statsRequest] = page.getStatsRequestRows();
    await page.submitStatsRequest(statsRequest, 2, 4);
    statsRequest.elements.lowUp.click();
    assert.strictEqual(getStatsRowLabel(page), '2 to 4');
});

test('a submitted stats request adds a stats row and a shaded trace for each loaded dice table', async () => {
    const page = await openPageWithKnownTables();
    page.document.getElementById('addDiceTableRequest').click();
    const [first, second] = page.getDiceTableRequestRows();
    await page.submitDiceTableRequest(first, 'Die(3)');
    await page.submitDiceTableRequest(second, 'Die(6)');
    await page.submitStatsRequest(page.getStatsRequestRows()[0], 3, 2);

    const die3Stats = page.window.getStats(die3.forSciNum, [2, 3]);
    const die6Stats = page.window.getStats(die6.forSciNum, [2, 3]);
    const statsRow = getStatsTableRows(page)[4];
    assert.deepStrictEqual(statsRow, ['2 to 3', die3Stats.pctChance + '%', die6Stats.pctChance + '%']);
    const die3Cell = page.document.querySelectorAll('#statsTable tbody tr')[3].children[1];
    assert.strictEqual(die3Cell.querySelector('.oneInChance').textContent, '1 in ' + die3Stats.oneInChance);
    assert.strictEqual(die3Cell.title, `${die3Stats.occurrences} of ${die3Stats.total} combinations`);

    const fills = getLastTraces(page).slice(2);
    assert.deepStrictEqual(fills.map(fill => fill.name), [
        page.window.getStatsTraceName('[1D3]', 2, 3, die3Stats.pctChance),
        page.window.getStatsTraceName('[1D6]', 2, 3, die6Stats.pctChance),
    ]);
    assert.strictEqual(fills[0].fill, 'tozeroy');
    assert.strictEqual(fills[1].fillcolor, page.window.getStatsFillColor(1, 0));
    assert.deepStrictEqual(
        {x: fills[0].x, y: fills[0].y},
        fromPage(page.window.getStatsFillTrace(2, 3, die3.data))
    );
});

test('a single-roll stats request is labeled with just that roll', async () => {
    const page = await openPageWithKnownTables();
    await page.submitDiceTableRequest(page.getDiceTableRequestRows()[0], 'Die(3)');
    await page.submitStatsRequest(page.getStatsRequestRows()[0], 2, 2);
    assert.strictEqual(getStatsTableRows(page)[4][0], '2');
});

test('removing a stats request removes its stats row and shaded traces and leaves the other shades alone', async () => {
    const page = await openPageWithKnownTables();
    await page.submitDiceTableRequest(page.getDiceTableRequestRows()[0], 'Die(3)');
    page.document.getElementById('addStatsRequest').click();
    const [firstStatsRequest, secondStatsRequest] = page.getStatsRequestRows();
    await page.submitStatsRequest(firstStatsRequest, 1, 1);
    await page.submitStatsRequest(secondStatsRequest, 3, 3);
    firstStatsRequest.querySelector('.remove').click();
    assert.deepStrictEqual(getStatsTableRows(page).slice(4).map(row => row[0]), ['3']);
    assert.strictEqual(getLastTraces(page).length, 2);
    assert.strictEqual(
        getLastTraces(page)[1].fillcolor,
        page.window.getStatsFillColor(0, 1)
    );
});

test('a stats request gets its shade when first submitted, and keeps it', async () => {
    const page = await openPageWithKnownTables();
    await page.submitDiceTableRequest(page.getDiceTableRequestRows()[0], 'Die(3)');
    page.document.getElementById('addStatsRequest').click();
    const [unsubmitted, submitted] = page.getStatsRequestRows();
    await page.submitStatsRequest(submitted, 1, 2);
    assert.strictEqual(getLastTraces(page)[1].fillcolor, page.window.getStatsFillColor(0, 0));

    await page.submitStatsRequest(unsubmitted, 3, 3);
    await page.submitStatsRequest(submitted, 2, 2);
    const fillColors = getLastTraces(page).slice(1).map(trace => trace.fillcolor);
    assert.deepStrictEqual(fillColors, [page.window.getStatsFillColor(0, 1), page.window.getStatsFillColor(0, 0)]);
});

test('a removed stats request\'s shade goes to the next stats request that is submitted', async () => {
    const page = await openPageWithKnownTables();
    await page.submitDiceTableRequest(page.getDiceTableRequestRows()[0], 'Die(3)');
    page.document.getElementById('addStatsRequest').click();
    page.document.getElementById('addStatsRequest').click();
    const [first, second, third] = page.getStatsRequestRows();
    await page.submitStatsRequest(first, 1, 1);
    await page.submitStatsRequest(second, 2, 2);
    first.querySelector('.remove').click();
    await page.submitStatsRequest(third, 3, 3);
    const fillColors = getLastTraces(page).slice(1).map(trace => trace.fillcolor);
    assert.deepStrictEqual(fillColors, [page.window.getStatsFillColor(0, 1), page.window.getStatsFillColor(0, 0)]);
});

test('removing the last stats request leaves a blank one', async () => {
    const page = await openPageWithKnownTables();
    await page.submitDiceTableRequest(page.getDiceTableRequestRows()[0], 'Die(3)');
    const [statsRequest] = page.getStatsRequestRows();
    await page.submitStatsRequest(statsRequest, 1, 2);
    statsRequest.querySelector('.remove').click();
    const statsRequestRows = page.getStatsRequestRows();
    assert.strictEqual(statsRequestRows.length, 1);
    assert.notStrictEqual(statsRequestRows[0], statsRequest);
    assert.strictEqual(getStatsTableRows(page).length, 4);
});

function countValueWrites(page, input) {
    const valueProperty = Object.getOwnPropertyDescriptor(page.window.HTMLInputElement.prototype, 'value');
    const writes = [];
    Object.defineProperty(input, 'value', {
        get() {
            return valueProperty.get.call(this);
        },
        set(value) {
            writes.push(value);
            valueProperty.set.call(this, value);
        },
    });
    return writes;
}

test(
    'rendering does not rewrite a build string input that already matches its diceTableRequest.buildStringInput value',
    async () => {
        const page = await openPageWithKnownTables();
        page.document.getElementById('addDiceTableRequest').click();
        const [first, second] = page.getDiceTableRequestRows();
        page.typeInto(second.elements.buildString, 'Die(6');
        const writes = countValueWrites(page, second.elements.buildString);

        await page.submitDiceTableRequest(first, 'Die(3)');
        assert.deepStrictEqual(writes, []);
    },
);

test(
    'rendering does not rewrite a stats high input that already matches its statsRequest.highInput value',
    async () => {
        const page = await openPageWithKnownTables();
        const [row] = page.getDiceTableRequestRows();
        const [statsRequest] = page.getStatsRequestRows();
        await page.submitDiceTableRequest(row, 'Die(3)');
        const writes = countValueWrites(page, statsRequest.elements.high);

        await page.submitDiceTableRequest(row, 'Die(6)');
        assert.deepStrictEqual(writes, []);
    },
);

test('rendering keeps unsubmitted text typed into a build string input', async () => {
    const page = await openPageWithKnownTables();
    page.document.getElementById('addDiceTableRequest').click();
    const [first, second] = page.getDiceTableRequestRows();
    page.typeInto(second.elements.buildString, 'Die(6)');
    await page.submitDiceTableRequest(first, 'Die(3)');
    assert.strictEqual(second.elements.buildString.value, 'Die(6)');
});

test('the state can be read from the console as allTheDice.state', async () => {
    const page = await openPageWithKnownTables();
    await page.submitDiceTableRequest(page.getDiceTableRequestRows()[0], 'Die(3)');
    const {state} = page.window.allTheDice;
    assert.strictEqual(state.diceTableRequests.length, 1);
    assert.strictEqual(state.diceTableRequests[0].buildStringInput, 'Die(3)');
    assert.strictEqual(state.diceTableRequests[0].colorIndex, 0);
    assert.strictEqual(state.statsRequests.length, 1);
});

test('the plot says it is unavailable when plotly did not load', async () => {
    const page = await openPageWithKnownTables({hasPlotly: false});
    await page.submitDiceTableRequest(page.getDiceTableRequestRows()[0], 'Die(3)');
    assert.strictEqual(
        page.document.getElementById('plotDiv').textContent,
        'The plotting library did not load, so the plot is unavailable.'
    );
    assert.strictEqual(getStatsTableRows(page)[0][1], '[1D3]');
});

test('the plot toolbar is hidden on narrow screens', async () => {
    const wide = await openPageWithKnownTables();
    assert.strictEqual(wide.plotly.getLastPlot().config.displayModeBar, true);
    const narrow = await openPageWithKnownTables({isNarrowScreen: true});
    assert.strictEqual(narrow.plotly.getLastPlot().config.displayModeBar, false);
});

function getPanelToggle(page, panelId) {
    return page.document.querySelector(`#${panelId} .panelToggle`);
}

test('minimizing a panel collapses it and remembers it', async () => {
    const page = await openPageWithKnownTables();
    getPanelToggle(page, 'stats').click();
    const stats = page.document.getElementById('stats');
    assert.ok(stats.classList.contains('minimized'));
    assert.strictEqual(getPanelToggle(page, 'stats').getAttribute('aria-expanded'), 'false');
    assert.deepStrictEqual(JSON.parse(page.window.localStorage.getItem('minimizedPanels')), ['stats']);

    getPanelToggle(page, 'stats').click();
    assert.ok(!stats.classList.contains('minimized'));
    assert.strictEqual(getPanelToggle(page, 'stats').getAttribute('aria-expanded'), 'true');
    assert.deepStrictEqual(JSON.parse(page.window.localStorage.getItem('minimizedPanels')), []);
});

test('remembered panels start minimized', async () => {
    const page = await openPageWithKnownTables({storedMinimizedPanels: '["roller","inputs"]'});
    const minimized = [...page.document.querySelectorAll('.panel.minimized')].map(panel => panel.id);
    assert.deepStrictEqual(minimized.sort(), ['inputs', 'roller']);
});

test('unreadable remembered panels are ignored', async () => {
    for (const stored of ['not json', '{"stats": true}']) {
        const page = await openPageWithKnownTables({storedMinimizedPanels: stored});
        assert.strictEqual(page.document.querySelectorAll('.panel.minimized').length, 0);
    }
});

test('reopening the plot panel refits the plot', async () => {
    const page = await openPageWithKnownTables();
    getPanelToggle(page, 'plot').click();
    assert.strictEqual(page.plotly.resizeCalls.length, 0);
    getPanelToggle(page, 'plot').click();
    assert.deepStrictEqual(page.plotly.resizeCalls, [page.document.getElementById('plotDiv')]);
});

function getMenus(page) {
    return [...page.document.querySelectorAll('details.menu')];
}

test('opening a menu closes the others', async () => {
    const page = await openPageWithKnownTables();
    const [examples, quickstart] = getMenus(page);
    examples.open = true;
    await settle();
    quickstart.open = true;
    await settle();
    assert.ok(!examples.open);
    assert.ok(quickstart.open);
});

test('clicking outside an open menu closes it, clicking inside does not', async () => {
    const page = await openPageWithKnownTables();
    const [examples] = getMenus(page);
    examples.open = true;
    await settle();
    examples.querySelector('.menuPanel').click();
    assert.ok(examples.open);
    page.document.body.click();
    assert.ok(!examples.open);
});

test('Escape closes the open menu and returns focus to its summary', async () => {
    const page = await openPageWithKnownTables();
    const [examples] = getMenus(page);
    examples.open = true;
    await settle();
    page.document.dispatchEvent(new page.window.KeyboardEvent('keydown', {key: 'Escape'}));
    assert.ok(!examples.open);
    assert.strictEqual(page.document.activeElement, examples.querySelector('summary'));
});
