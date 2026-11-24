const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {JSDOM} = require('jsdom');

const repoRoot = path.join(__dirname, '..');
const pageScripts = [
    'scinum.js', 'statsmaker.js', 'roller.js', 'plothelpers.js', 'colors.js', 'config.js', 'models.js',
    'fetch-dice-tables.js', 'interface.js',
];

async function openPage(
    {lambda = fakeLambda({}), hasPlotly = true, isNarrowScreen = false, storedMinimizedPanels} = {},
) {
    const dom = new JSDOM(fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8'), {
        runScripts: 'outside-only',
        url: 'https://allthedice.test/',
    });
    const {window} = dom;
    if (storedMinimizedPanels !== undefined) {
        window.localStorage.setItem('minimizedPanels', storedMinimizedPanels);
    }
    window.matchMedia = query => ({
        matches: query.includes('max-width') && isNarrowScreen,
        addEventListener() {},
    });
    window.fetch = lambda.fetch;
    const plotly = fakePlotly();
    if (hasPlotly) {
        window.Plotly = plotly;
    }
    const queuedRandomBytes = [];
    let lastId = 0;
    Object.defineProperty(window, 'crypto', {
        value: {
            randomUUID() {
                lastId++;
                return `id-${lastId}`;
            },
            getRandomValues(bytes) {
                bytes.fill(queuedRandomBytes.length > 0 ? queuedRandomBytes.shift() : 0);
                return bytes;
            },
        },
    });

    const clock = fakeClock();
    window.setTimeout = clock.setTimeout;
    window.clearTimeout = clock.clearTimeout;

    const context = dom.getInternalVMContext();
    for (const fileName of pageScripts) {
        const filePath = path.join(repoRoot, 'js', fileName);
        vm.runInContext(fs.readFileSync(filePath, 'utf8'), context, {filename: filePath});
    }
    await new Promise(resolve => window.document.addEventListener('DOMContentLoaded', resolve));
    return {window, document: window.document, lambda, plotly, queuedRandomBytes, clock, ...pageActions(window)};
}

function pageActions(window) {
    const document = window.document;
    const getDiceTableRequestRows = () => [...document.querySelectorAll('#diceTableRequestList form')];
    const getStatsRequestRows = () => [...document.querySelectorAll('#statsRequestList form')];

    function typeInto(input, value) {
        input.value = value;
        input.dispatchEvent(new window.Event('input', {bubbles: true}));
    }

    async function submitDiceTableRequest(row, buildString) {
        typeInto(row.elements.buildString, buildString);
        row.querySelector('[type=submit]').click();
        await settle();
    }

    async function submitStatsRequest(row, low, high) {
        typeInto(row.elements.low, String(low));
        typeInto(row.elements.high, String(high));
        row.querySelector('[type=submit]').click();
        await settle();
    }

    return {getDiceTableRequestRows, getStatsRequestRows, typeInto, submitDiceTableRequest, submitStatsRequest};
}

async function settle() {
    for (let i = 0; i < 5; i++) {
        await new Promise(resolve => setTimeout(resolve, 0));
    }
}

/** Stands in for the page's timers. Nothing runs until tick moves the time forward. */
function fakeClock() {
    let now = 0;
    let lastId = 0;
    const timers = new Map();
    return {
        setTimeout(callback, delay = 0) {
            lastId++;
            timers.set(lastId, {callback, at: now + delay});
            return lastId;
        },
        clearTimeout(id) {
            timers.delete(id);
        },
        tick(ms) {
            const end = now + ms;
            for (;;) {
                const due = [...timers].filter(([, timer]) => timer.at <= end);
                if (due.length === 0) {
                    break;
                }
                const [id, timer] = due.reduce((first, next) => next[1].at < first[1].at ? next : first);
                timers.delete(id);
                now = timer.at;
                timer.callback();
            }
            now = end;
        },
    };
}

function fakePlotly() {
    const plotly = {
        reactCalls: [],
        resizeCalls: [],
        react(div, traces, layout, config) {
            div.classList.add('js-plotly-plot');
            plotly.reactCalls.push({div, traces, layout, config});
        },
        Plots: {
            resize(div) {
                plotly.resizeCalls.push(div);
            },
        },
        getLastPlot() {
            return plotly.reactCalls[plotly.reactCalls.length - 1];
        },
    };
    return plotly;
}

function fakeLambda(diceTablesByBuildString) {
    const lambda = {
        requests: [],
        respond(buildString) {
            if (Object.hasOwn(diceTablesByBuildString, buildString)) {
                return jsonResponse(200, diceTablesByBuildString[buildString]);
            }
            return jsonResponse(400, {errorType: 'ParseError', errorMessage: `could not parse ${buildString}`});
        },
        async fetch(url, options) {
            lambda.requests.push({url, options, buildString: JSON.parse(options.body).buildString});
            return lambda.respond(JSON.parse(options.body).buildString);
        },
    };
    return lambda;
}

function jsonResponse(status, body) {
    return new Response(JSON.stringify(body), {status, statusText: status === 200 ? 'OK' : 'Bad Request'});
}

function makeDieTable(sides, {offset = 0} = {}) {
    const rolls = Array.from({length: sides}, (_, i) => offset + i + 1);
    const mean = offset + (sides + 1) / 2;
    const variance = (sides * sides - 1) / 12;
    return {
        name: `<DiceTable containing [1D${sides}]>`,
        diceStr: `Die(${sides}): 1`,
        data: {x: rolls, y: rolls.map(() => 100 / sides)},
        forSciNum: rolls.map(roll => ({roll, mantissa: '1.00000', exponent: '0'})),
        range: [rolls[0], rolls[rolls.length - 1]],
        mean,
        stddev: Number(Math.sqrt(variance).toFixed(3)),
        roller: {
            height: String(sides),
            aliases: rolls.map(roll => ({
                primary: String(roll),
                alternate: String(roll),
                primaryHeight: String(sides),
            })),
        },
    };
}

module.exports = {openPage, fakeLambda, jsonResponse, makeDieTable, settle};
