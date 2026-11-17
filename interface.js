document.addEventListener('DOMContentLoaded', onPageLoad);

function onPageLoad() {
    const diceTableRequests = [];
    // each: {form, low, high, bounds}, bounds is [low, high] once submitted
    const ranges = [];

    const diceTableRequestList = document.getElementById('diceTableRequestList');
    const rangeList = document.getElementById('rangeList');

    setUpPanels();
    setUpMenus();

    document.getElementById('addDiceTableRequest').addEventListener('click', () =>
        addDiceTableRequest().domElements.input.focus()
    );
    document.getElementById('addRange').addEventListener('click', () => addRange().low.focus());
    document.querySelectorAll('.example').forEach(button => {
        button.addEventListener('click', () => {
            button.closest('details').open = false;
            getExampleDiceTable(button.dataset.build);
        });
    });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', render);

    addDiceTableRequest();
    addRange();
    render();

    function addDiceTableRequest() {
        const form = cloneTemplate('diceTableRequestTemplate');
        const request = {
            domElements: {
                form,
                input: form.elements.buildString,
                submit: form.querySelector('[type=submit]'),
                error: form.querySelector('.rowError'),
                swatch: form.querySelector('.swatch'),
            },
            isPending: false,
            diceTable: null,
            roller: null,
            rollHistory: [],
        };
        form.addEventListener('submit', event => {
            event.preventDefault();
            getDiceTable(request);
        });
        form.querySelector('.remove').addEventListener('click', () => removeDiceTableRequest(request));
        diceTableRequests.push(request);
        diceTableRequestList.append(form);
        return request;
    }

    function removeDiceTableRequest(request) {
        diceTableRequests.splice(diceTableRequests.indexOf(request), 1);
        request.domElements.form.remove();
        if (diceTableRequests.length === 0) {
            addDiceTableRequest();
        }
        render();
    }

    function getExampleDiceTable(buildString) {
        const blank = diceTableRequests.find(r =>
            r.diceTable === null && !r.isPending && r.domElements.input.value.trim() === ''
        );
        const request = blank || addDiceTableRequest();
        request.domElements.input.value = buildString;
        getDiceTable(request);
    }

    async function getDiceTable(request) {
        if (request.isPending) {
            return;
        }
        setPending(request, true);
        showError(request, '');
        try {
            const diceTable = await fetchDiceTable(request.domElements.input.value);
            request.diceTable = diceTable;
            request.roller = new AliasTableRoller(diceTable.roller.height, diceTable.roller.aliases);
            request.rollHistory = [];
            render();
        } catch (error) {
            showError(request, error.message);
        } finally {
            setPending(request, false);
        }
    }

    function setPending(request, isPending) {
        request.isPending = isPending;
        request.domElements.submit.disabled = isPending;
        request.domElements.form.setAttribute('aria-busy', String(isPending));
    }

    function showError(request, message) {
        request.domElements.error.textContent = message;
        request.domElements.error.hidden = message === '';
    }

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
        setRangeLimits(range, getLoadedDiceTableRequests());
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

    // keep range inputs within the rolls the loaded dice tables can make
    function setRangeLimits(range, loaded) {
        const inputs = [range.low, range.high];
        if (loaded.length === 0) {
            inputs.forEach(input => {
                input.removeAttribute('min');
                input.removeAttribute('max');
            });
            return;
        }
        const min = Math.min(...loaded.map(r => r.diceTable.range[0]));
        const max = Math.max(...loaded.map(r => r.diceTable.range[1]));
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

    function getLoadedDiceTableRequests() {
        return diceTableRequests.filter(r => r.diceTable !== null);
    }

    function render() {
        const loaded = getLoadedDiceTableRequests();
        const submitted = ranges.filter(r => r.bounds !== null);
        // stats[rangeIndex][loadedIndex], shared by the plot legend and the stats table
        const stats = submitted.map(range => loaded.map(r =>
            getStats(r.diceTable.forSciNum, getRollRange(range.bounds[0], range.bounds[1]))
        ));

        diceTableRequests.forEach(request => {
            const index = loaded.indexOf(request);
            request.domElements.swatch.classList.toggle('active', index !== -1);
            request.domElements.swatch.style.background = index === -1 ? '' : getTraceColor(index);
        });
        ranges.forEach(range => setRangeLimits(range, loaded));

        renderPlot(loaded, submitted, stats);
        renderStatsTable(loaded, submitted, stats);
        renderRoller(loaded);
    }

    function renderPlot(loaded, submitted, stats) {
        const plotDiv = document.getElementById('plotter');
        document.getElementById('plotEmpty').hidden = loaded.length > 0;
        if (typeof Plotly === 'undefined') {
            plotDiv.textContent = 'The plotting library did not load, so the plot is unavailable.';
            return;
        }

        const traces = loaded.map((request, index) => ({
            x: request.diceTable.data.x,
            y: request.diceTable.data.y,
            name: getDiceListString(request.diceTable.name),
            mode: request.diceTable.data.x.length <= 100 ? 'lines+markers' : 'lines',
            line: {color: getTraceColor(index)},
            marker: {color: getTraceColor(index)},
        }));
        submitted.forEach((range, submittedIndex) => {
            const [low, high] = range.bounds;
            loaded.forEach((request, index) => {
                const diceName = getDiceListString(request.diceTable.name);
                traces.push({
                    ...getStatsFillTrace(low, high, request.diceTable.data),
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
        const legendAbovePlot = {orientation: 'h', x: 0, xanchor: 'left', y: 1.02, yanchor: 'bottom'};
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
            legend: legendAbovePlot,
            xaxis: {...axis, title: {text: 'roll'}, automargin: true},
            yaxis: {...axis, title: {text: '% chance'}, rangemode: 'tozero', automargin: true},
        };
        const toolbarWouldCoverLegend = window.matchMedia('(max-width: 700px)').matches;
        const config = {
            responsive: true,
            displaylogo: false,
            showSendToCloud: false,
            displayModeBar: !toolbarWouldCoverLegend,
        };
        Plotly.react(plotDiv, traces, layout, config);
    }

    function renderStatsTable(loaded, submitted, stats) {
        const table = document.getElementById('statsTable');
        document.getElementById('statsEmpty').hidden = loaded.length > 0;
        table.hidden = loaded.length === 0;

        const head = document.createElement('tr');
        head.append(makeCell('th', ''));
        loaded.forEach((request, index) => {
            const cell = makeCell('th', getDiceListString(request.diceTable.name));
            cell.scope = 'col';
            cell.style.color = getTraceColor(index);
            cell.title = request.diceTable.diceStr;
            head.append(cell);
        });

        const rows = [
            ['Range', r => getRangeLabel(r.diceTable.range[0], r.diceTable.range[1])],
            ['Mean', r => String(r.diceTable.mean)],
            ['Std dev', r => String(r.diceTable.stddev)],
        ].map(([label, getValue]) => {
            const row = document.createElement('tr');
            row.append(makeCell('th', label));
            loaded.forEach(r => row.append(makeCell('td', getValue(r))));
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

    function renderRoller(loaded) {
        document.getElementById('rollerEmpty').hidden = loaded.length > 0;
        document.getElementById('rollerArea').replaceChildren(...loaded.map(makeRollerRow));
    }

    function makeRollerRow(request) {
        const row = document.createElement('div');
        row.className = 'rollerRow';

        const name = makeCell('span', getDiceListString(request.diceTable.name));
        name.className = 'rollerName';
        const button = makeCell('button', 'Roll');
        button.type = 'button';
        button.className = 'secondary';
        const latestRoll = makeCell('div', '');
        latestRoll.className = 'latestRoll';
        latestRoll.setAttribute('aria-live', 'polite');
        const earlierRolls = makeCell('div', '');
        earlierRolls.className = 'earlierRolls';

        const showRolls = () => {
            const [latest, ...earlier] = request.rollHistory;
            latestRoll.textContent = latest ?? 'None';
            earlierRolls.textContent = earlier.join(', ');
        };
        button.addEventListener('click', () => {
            request.rollHistory.unshift(request.roller.roll());
            showRolls();
        });
        showRolls();

        row.append(name, button, latestRoll, earlierRolls);
        return row;
    }
}

async function fetchDiceTable(buildString) {
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
    const body = await parseJsonOrNull(response);
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

async function parseJsonOrNull(response) {
    try {
        return await response.json();
    } catch (notJson) {
        return null;
    }
}

function cloneTemplate(id) {
    return document.getElementById(id).content.firstElementChild.cloneNode(true);
}

function makeCell(tag, text) {
    const element = document.createElement(tag);
    element.textContent = text;
    return element;
}

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
        refitPlotAfterReveal(plot);
    }
}

function refitPlotAfterReveal(plot) {
    Plotly.Plots.resize(plot);
}

function saveMinimizedPanels() {
    const minimized = [...document.querySelectorAll('.panel.minimized')].map(panel => panel.id);
    try {
        localStorage.setItem(getMinimizedPanelsKey(), JSON.stringify(minimized));
    } catch (storageUnavailable) {
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

function setUpMenus() {
    const menus = [...document.querySelectorAll('details.menu')];
    closeOtherMenusWhenOneOpens(menus);
    closeMenusOnOutsideClick(menus);
    closeMenusOnEscape(menus);
}

function closeOtherMenusWhenOneOpens(menus) {
    menus.forEach(menu => menu.addEventListener('toggle', () => {
        if (menu.open) {
            menus.filter(other => other !== menu).forEach(other => {
                other.open = false;
            });
        }
    }));
}

function closeMenusOnOutsideClick(menus) {
    document.addEventListener('click', event => {
        menus.filter(menu => menu.open && !menu.contains(event.target)).forEach(menu => {
            menu.open = false;
        });
    });
}

function closeMenusOnEscape(menus) {
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
