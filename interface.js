// Page behavior. All page state lives inside onPageLoad; after any change, render() redraws
// the plot, the stats table and the roller from that state.
document.addEventListener('DOMContentLoaded', onPageLoad);

function onPageLoad() {
    // each: {form, input, submit, error, swatch, table, rolls, roller, busy}
    const collections = [];
    // each: {form, low, high, bounds}, bounds is [low, high] once submitted
    const ranges = [];

    const collectionList = document.getElementById('collectionList');
    const rangeList = document.getElementById('rangeList');

    setUpPanels();
    setUpMenus();

    document.getElementById('addCollection').addEventListener('click', () => addCollection().input.focus());
    document.getElementById('addRange').addEventListener('click', () => addRange().low.focus());
    document.querySelectorAll('.example').forEach(button => {
        button.addEventListener('click', () => {
            button.closest('details').open = false;
            calculateExample(button.dataset.build);
        });
    });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', render);

    addCollection();
    addRange();
    render();

    // ---------- dice collections ----------

    function addCollection() {
        const form = cloneTemplate('collectionTemplate');
        const collection = {
            form,
            input: form.elements.buildString,
            submit: form.querySelector('[type=submit]'),
            error: form.querySelector('.rowError'),
            swatch: form.querySelector('.swatch'),
            table: null,
            rolls: [],
            roller: null,
            busy: false,
        };
        form.addEventListener('submit', event => {
            event.preventDefault();
            calculate(collection);
        });
        form.querySelector('.remove').addEventListener('click', () => removeCollection(collection));
        collections.push(collection);
        collectionList.append(form);
        return collection;
    }

    function removeCollection(collection) {
        collections.splice(collections.indexOf(collection), 1);
        collection.form.remove();
        if (collections.length === 0) {
            addCollection();
        }
        render();
    }

    function calculateExample(buildString) {
        const blank = collections.find(c => c.table === null && !c.busy && c.input.value.trim() === '');
        const collection = blank || addCollection();
        collection.input.value = buildString;
        calculate(collection);
    }

    async function calculate(collection) {
        if (collection.busy) {
            return;
        }
        setBusy(collection, true);
        showError(collection, '');
        try {
            const table = await fetchTable(collection.input.value);
            collection.table = table;
            collection.rolls = [];
            collection.roller = new Roller(table.roller.height, table.roller.aliases);
            render();
        } catch (error) {
            showError(collection, error.message);
        } finally {
            setBusy(collection, false);
        }
    }

    function setBusy(collection, busy) {
        collection.busy = busy;
        collection.submit.disabled = busy;
        collection.form.setAttribute('aria-busy', String(busy));
    }

    function showError(collection, message) {
        collection.error.textContent = message;
        collection.error.hidden = message === '';
    }

    // ---------- stats ranges ----------

    function addRange() {
        const form = cloneTemplate('rangeTemplate');
        const range = {form, low: form.elements.low, high: form.elements.high, bounds: null};
        form.addEventListener('submit', event => {
            event.preventDefault();
            const low = parseInt(range.low.value, 10);
            const high = parseInt(range.high.value, 10);
            range.bounds = [Math.min(low, high), Math.max(low, high)];
            render();
        });
        form.querySelector('.remove').addEventListener('click', () => removeRange(range));
        ranges.push(range);
        rangeList.append(form);
        setRangeLimits(range, getCalculated());
        return range;
    }

    function removeRange(range) {
        ranges.splice(ranges.indexOf(range), 1);
        range.form.remove();
        if (ranges.length === 0) {
            addRange();
        }
        render();
    }

    // keep range inputs within the rolls the calculated collections can make
    function setRangeLimits(range, calculated) {
        const inputs = [range.low, range.high];
        if (calculated.length === 0) {
            inputs.forEach(input => {
                input.removeAttribute('min');
                input.removeAttribute('max');
            });
            return;
        }
        const min = Math.min(...calculated.map(c => c.table.range[0]));
        const max = Math.max(...calculated.map(c => c.table.range[1]));
        inputs.forEach(input => {
            input.min = min;
            input.max = max;
        });
        if (range.low.value === '') {
            range.low.value = min;
        }
        if (range.high.value === '') {
            range.high.value = max;
        }
    }

    // ---------- rendering ----------

    function getCalculated() {
        return collections.filter(c => c.table !== null);
    }

    function render() {
        const calculated = getCalculated();
        const submitted = ranges.filter(r => r.bounds !== null);
        // stats[rangeIndex][collectionIndex], shared by the plot legend and the stats table
        const stats = submitted.map(range => calculated.map(c =>
            getStats(c.table.forSciNum, getRollRange(range.bounds[0], range.bounds[1]))
        ));

        collections.forEach(collection => {
            const index = calculated.indexOf(collection);
            collection.swatch.classList.toggle('active', index !== -1);
            collection.swatch.style.background = index === -1 ? '' : getTraceColor(index);
        });
        ranges.forEach(range => setRangeLimits(range, calculated));

        renderPlot(calculated, submitted, stats);
        renderStatsTable(calculated, submitted, stats);
        renderRoller(calculated);
    }

    function renderPlot(calculated, submitted, stats) {
        const plotDiv = document.getElementById('plotter');
        document.getElementById('plotEmpty').hidden = calculated.length > 0;
        if (typeof Plotly === 'undefined') {
            plotDiv.textContent = 'The plotting library did not load, so the plot is unavailable.';
            return;
        }

        const traces = calculated.map((collection, index) => ({
            x: collection.table.data.x,
            y: collection.table.data.y,
            name: getDiceListString(collection.table.name),
            mode: collection.table.data.x.length <= 100 ? 'lines+markers' : 'lines',
            line: {color: getTraceColor(index)},
            marker: {color: getTraceColor(index)},
        }));
        submitted.forEach((range, submittedIndex) => {
            const [low, high] = range.bounds;
            calculated.forEach((collection, index) => {
                const diceName = getDiceListString(collection.table.name);
                traces.push({
                    ...getStatsFillTrace(low, high, collection.table.data),
                    type: 'scatter',
                    mode: 'none',
                    fill: 'tozeroy',
                    fillcolor: getStatsFillColor(index, ranges.indexOf(range)),
                    hoverinfo: 'skip',
                    name: getStatsTraceName(diceName, low, high, stats[submittedIndex][index].pctChance),
                });
            });
        });

        const style = getComputedStyle(document.documentElement);
        const textColor = style.getPropertyValue('--text').trim();
        const gridColor = style.getPropertyValue('--border').trim();
        const axis = {gridcolor: gridColor, zerolinecolor: gridColor, linecolor: gridColor};
        const layout = {
            margin: {t: 10, r: 10, b: 10, l: 60},
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            font: {family: style.getPropertyValue('--font').trim(), color: textColor},
            modebar: {
                bgcolor: 'rgba(0,0,0,0)',
                color: style.getPropertyValue('--muted').trim(),
                activecolor: style.getPropertyValue('--accent').trim(),
            },
            showlegend: true,
            // above the plot, so it never collides with the x axis title
            legend: {orientation: 'h', x: 0, xanchor: 'left', y: 1.02, yanchor: 'bottom'},
            xaxis: {...axis, title: {text: 'roll'}, automargin: true},
            yaxis: {...axis, title: {text: '% chance'}, rangemode: 'tozero', automargin: true},
        };
        // on narrow screens the toolbar covers the legend; phones have pinch-zoom anyway
        const narrow = window.matchMedia('(max-width: 700px)').matches;
        const config = {responsive: true, displaylogo: false, showSendToCloud: false, displayModeBar: !narrow};
        Plotly.react(plotDiv, traces, layout, config);
    }

    function renderStatsTable(calculated, submitted, stats) {
        const table = document.getElementById('statsTable');
        document.getElementById('statsEmpty').hidden = calculated.length > 0;
        table.hidden = calculated.length === 0;

        const head = document.createElement('tr');
        head.append(makeCell('th', ''));
        calculated.forEach((collection, index) => {
            const cell = makeCell('th', getDiceListString(collection.table.name));
            cell.scope = 'col';
            cell.style.color = getTraceColor(index);
            cell.title = collection.table.diceStr;
            head.append(cell);
        });

        const rows = [
            ['Range', c => getRangeLabel(c.table.range[0], c.table.range[1])],
            ['Mean', c => String(c.table.mean)],
            ['Std dev', c => String(c.table.stddev)],
        ].map(([label, getValue]) => {
            const row = document.createElement('tr');
            row.append(makeCell('th', label));
            calculated.forEach(c => row.append(makeCell('td', getValue(c))));
            return row;
        });

        submitted.forEach((range, submittedIndex) => {
            const row = document.createElement('tr');
            row.append(makeCell('th', getRangeLabel(range.bounds[0], range.bounds[1])));
            stats[submittedIndex].forEach(stat => {
                const cell = makeCell('td', stat.pctChance + '%');
                const detail = makeCell('span', '1 in ' + stat.oneInChance);
                detail.className = 'statDetail';
                cell.append(detail);
                cell.title = `${stat.occurrences} of ${stat.total} combinations`;
                row.append(cell);
            });
            rows.push(row);
        });

        table.tHead.replaceChildren(head);
        table.tBodies[0].replaceChildren(...rows);
    }

    function renderRoller(calculated) {
        document.getElementById('rollerEmpty').hidden = calculated.length > 0;
        document.getElementById('rollerArea').replaceChildren(...calculated.map(makeRollerRow));
    }

    function makeRollerRow(collection) {
        const row = document.createElement('div');
        row.className = 'rollerRow';

        const name = makeCell('span', getDiceListString(collection.table.name));
        name.className = 'rollerName';
        const button = makeCell('button', 'Roll');
        button.type = 'button';
        button.className = 'secondary';
        const display = makeCell('div', '');
        display.className = 'rollDisplay';
        display.setAttribute('aria-live', 'polite');
        const history = makeCell('div', '');
        history.className = 'rollHistory';

        const showRolls = () => {
            const rolls = collection.rolls;
            display.textContent = rolls.length === 0 ? 'None' : rolls[rolls.length - 1];
            // earlier rolls, newest first
            history.textContent = rolls.slice(0, -1).reverse().join(', ');
        };
        button.addEventListener('click', () => {
            collection.rolls.push(collection.roller.roll());
            showRolls();
        });
        showRolls();

        row.append(name, button, display, history);
        return row;
    }
}

// ---------- helpers that don't touch page state ----------

async function fetchTable(buildString) {
    let response;
    try {
        // a plain-text body keeps this a "simple" cross-origin request (no preflight)
        response = await fetch(getLambdaEndpoint(), {
            method: 'POST',
            body: JSON.stringify({buildString}),
        });
    } catch (error) {
        throw new Error(`Could not reach the dice server at ${getLambdaEndpoint()}.`);
    }
    let body = null;
    try {
        body = await response.json();
    } catch (error) {
        // not JSON; handled below
    }
    if (!response.ok) {
        if (body && body.errorMessage) {
            throw new Error(body.errorType ? `${body.errorType}: ${body.errorMessage}` : body.errorMessage);
        }
        throw new Error(`The dice server answered ${response.status} ${response.statusText}.`);
    }
    if (body === null) {
        throw new Error('The dice server sent a response that was not JSON.');
    }
    return body;
}

function cloneTemplate(id) {
    return document.getElementById(id).content.firstElementChild.cloneNode(true);
}

function makeCell(tag, text) {
    const element = document.createElement(tag);
    element.textContent = text;
    return element;
}

// ---------- minimizable panels ----------

function getMinimizedPanelsKey() {
    return 'minimizedPanels';
}

function setUpPanels() {
    const minimized = loadMinimizedPanels();
    document.querySelectorAll('.panel').forEach(panel => {
        panel.querySelector('.panelToggle').addEventListener('click', () => {
            setPanelMinimized(panel, !panel.classList.contains('minimized'));
            saveMinimizedPanels();
        });
        if (minimized.includes(panel.id)) {
            setPanelMinimized(panel, true);
        }
    });
}

function setPanelMinimized(panel, isMinimized) {
    panel.classList.toggle('minimized', isMinimized);
    panel.querySelector('.panelToggle').setAttribute('aria-expanded', String(!isMinimized));
    const plot = panel.querySelector('.js-plotly-plot');
    if (!isMinimized && plot !== null) {
        // plotly can't measure a hidden div, so re-fit once it is visible again
        Plotly.Plots.resize(plot);
    }
}

function saveMinimizedPanels() {
    const minimized = [...document.querySelectorAll('.panel.minimized')].map(panel => panel.id);
    try {
        localStorage.setItem(getMinimizedPanelsKey(), JSON.stringify(minimized));
    } catch (error) {
        // storage unavailable: the page still works, it just won't remember
    }
}

function loadMinimizedPanels() {
    try {
        const stored = JSON.parse(localStorage.getItem(getMinimizedPanelsKey()));
        return Array.isArray(stored) ? stored : [];
    } catch (error) {
        return [];
    }
}

// ---------- help menus ----------

// one menu open at a time; clicking elsewhere or pressing Escape closes it
function setUpMenus() {
    const menus = [...document.querySelectorAll('details.menu')];
    menus.forEach(menu => menu.addEventListener('toggle', () => {
        if (menu.open) {
            menus.filter(other => other !== menu).forEach(other => {
                other.open = false;
            });
        }
    }));
    document.addEventListener('click', event => {
        menus.filter(menu => menu.open && !menu.contains(event.target)).forEach(menu => {
            menu.open = false;
        });
    });
    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape') {
            return;
        }
        menus.filter(menu => menu.open).forEach(menu => {
            menu.open = false;
            menu.querySelector('summary').focus();
        });
    });
}
