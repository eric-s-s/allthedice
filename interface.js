document.addEventListener('DOMContentLoaded', onPageLoad);

function onPageLoad() {
    const diceTableRequests = [];
    const statsRequests = [];

    const diceTableRequestList = document.getElementById('diceTableRequestList');
    const statsRequestList = document.getElementById('statsRequestList');

    setUpPanels();
    setUpMenus();

    document.getElementById('addDiceTableRequest').addEventListener('click', () =>
        addDiceTableRequest().domElements.input.focus()
    );
    document.getElementById('addStatsRequest').addEventListener('click', () =>
        addStatsRequest().domElements.low.focus()
    );
    document.querySelectorAll('.example').forEach(button => {
        button.addEventListener('click', () => {
            button.closest('details').open = false;
            getExampleDiceTable(button.dataset.build);
        });
    });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', render);

    addDiceTableRequest();
    addStatsRequest();
    render();

    function addDiceTableRequest() {
        const form = cloneTemplate('diceTableRequestTemplate');
        const diceTableRequest = {
            domElements: {
                form,
                input: form.elements.buildString,
                submit: form.querySelector('[type=submit]'),
                error: form.querySelector('.diceTableRequestError'),
                swatch: form.querySelector('.swatch'),
            },
            isPending: false,
            diceTable: null,
            roller: null,
            rollHistory: [],
        };
        form.addEventListener('submit', event => {
            event.preventDefault();
            getDiceTable(diceTableRequest);
        });
        form.querySelector('.remove').addEventListener('click', () => removeDiceTableRequest(diceTableRequest));
        diceTableRequests.push(diceTableRequest);
        diceTableRequestList.append(form);
        return diceTableRequest;
    }

    function removeDiceTableRequest(diceTableRequest) {
        diceTableRequests.splice(diceTableRequests.indexOf(diceTableRequest), 1);
        diceTableRequest.domElements.form.remove();
        if (diceTableRequests.length === 0) {
            addDiceTableRequest();
        }
        render();
    }

    function getExampleDiceTable(buildString) {
        const diceTableRequest = diceTableRequests.find(isBlank) || addDiceTableRequest();
        diceTableRequest.domElements.input.value = buildString;
        getDiceTable(diceTableRequest);
    }

    function isBlank(diceTableRequest) {
        return diceTableRequest.diceTable === null
            && !diceTableRequest.isPending
            && diceTableRequest.domElements.input.value.trim() === '';
    }

    async function getDiceTable(diceTableRequest) {
        if (diceTableRequest.isPending) {
            return;
        }
        setPending(diceTableRequest, true);
        showError(diceTableRequest, '');
        try {
            const diceTable = await fetchDiceTable(diceTableRequest.domElements.input.value);
            diceTableRequest.diceTable = diceTable;
            diceTableRequest.roller = new AliasTableRoller(diceTable.roller.height, diceTable.roller.aliases);
            diceTableRequest.rollHistory = [];
            render();
        } catch (error) {
            showError(diceTableRequest, error.message);
        } finally {
            setPending(diceTableRequest, false);
        }
    }

    function setPending(diceTableRequest, isPending) {
        diceTableRequest.isPending = isPending;
        diceTableRequest.domElements.submit.disabled = isPending;
        diceTableRequest.domElements.form.setAttribute('aria-busy', String(isPending));
    }

    function showError(diceTableRequest, message) {
        diceTableRequest.domElements.error.textContent = message;
        diceTableRequest.domElements.error.hidden = message === '';
    }

    function addStatsRequest() {
        const form = cloneTemplate('statsRequestTemplate');
        const statsRequest = {
            domElements: {form, low: form.elements.low, high: form.elements.high},
            submittedRollRange: null,
        };
        form.addEventListener('submit', event => {
            event.preventDefault();
            const low = parseInt(statsRequest.domElements.low.value, 10);
            const high = parseInt(statsRequest.domElements.high.value, 10);
            statsRequest.submittedRollRange = [Math.min(low, high), Math.max(low, high)];
            render();
        });
        form.querySelector('.remove').addEventListener('click', () => removeStatsRequest(statsRequest));
        statsRequests.push(statsRequest);
        statsRequestList.append(form);
        limitInputsToLoadedRolls(statsRequest, getLoadedDiceTableRequests());
        fillBlankInputsWithLoadedRolls(statsRequest, getLoadedDiceTableRequests());
        return statsRequest;
    }

    function removeStatsRequest(statsRequest) {
        statsRequests.splice(statsRequests.indexOf(statsRequest), 1);
        statsRequest.domElements.form.remove();
        if (statsRequests.length === 0) {
            addStatsRequest();
        }
        render();
    }

    function limitInputsToLoadedRolls(statsRequest, loadedDiceTableRequests) {
        const inputs = [statsRequest.domElements.low, statsRequest.domElements.high];
        if (loadedDiceTableRequests.length === 0) {
            inputs.forEach(input => {
                input.removeAttribute('min');
                input.removeAttribute('max');
            });
            return;
        }
        const [lowest, highest] = getLowestAndHighestRolls(loadedDiceTableRequests);
        inputs.forEach(input => {
            input.min = lowest;
            input.max = highest;
        });
    }

    function fillBlankInputsWithLoadedRolls(statsRequest, loadedDiceTableRequests) {
        if (loadedDiceTableRequests.length === 0) {
            return;
        }
        const {low, high} = statsRequest.domElements;
        const [lowest, highest] = getLowestAndHighestRolls(loadedDiceTableRequests);
        if (low.value === '') {
            low.value = lowest;
        }
        if (high.value === '') {
            high.value = highest;
        }
    }

    function getLoadedDiceTableRequests() {
        return diceTableRequests.filter(diceTableRequest => diceTableRequest.diceTable !== null);
    }

    function render() {
        const loadedDiceTableRequests = getLoadedDiceTableRequests();
        const submittedStatsResults = getSubmittedStatsResults(loadedDiceTableRequests);

        diceTableRequests.forEach(diceTableRequest => {
            const loadedIndex = loadedDiceTableRequests.indexOf(diceTableRequest);
            const swatch = diceTableRequest.domElements.swatch;
            swatch.classList.toggle('active', loadedIndex !== -1);
            swatch.style.background = loadedIndex === -1 ? '' : getTraceColor(loadedIndex);
        });
        statsRequests.forEach(statsRequest => {
            limitInputsToLoadedRolls(statsRequest, loadedDiceTableRequests);
            fillBlankInputsWithLoadedRolls(statsRequest, loadedDiceTableRequests);
        });

        renderPlot(loadedDiceTableRequests, submittedStatsResults);
        renderStatsTable(loadedDiceTableRequests, submittedStatsResults);
        renderRoller(loadedDiceTableRequests);
    }

    function getSubmittedStatsResults(loadedDiceTableRequests) {
        const submittedStatsRequests = statsRequests.filter(({submittedRollRange}) => submittedRollRange !== null);
        return submittedStatsRequests.map(statsRequest => {
            const [low, high] = statsRequest.submittedRollRange;
            const rolls = getEveryRollFrom(low, high);
            return {
                low,
                high,
                colorShiftIndex: statsRequests.indexOf(statsRequest),
                statsPerLoadedDiceTable: loadedDiceTableRequests.map(({diceTable}) =>
                    getStats(diceTable.forSciNum, rolls)
                ),
            };
        });
    }

    function renderPlot(loadedDiceTableRequests, submittedStatsResults) {
        const plotDiv = document.getElementById('plotDiv');
        document.getElementById('plotEmpty').hidden = loadedDiceTableRequests.length > 0;
        if (typeof Plotly === 'undefined') {
            plotDiv.textContent = 'The plotting library did not load, so the plot is unavailable.';
            return;
        }

        const traces = loadedDiceTableRequests.map((diceTableRequest, loadedIndex) => ({
            x: diceTableRequest.diceTable.data.x,
            y: diceTableRequest.diceTable.data.y,
            name: getDiceList(diceTableRequest.diceTable.name),
            mode: diceTableRequest.diceTable.data.x.length <= 100 ? 'lines+markers' : 'lines',
            line: {color: getTraceColor(loadedIndex)},
            marker: {color: getTraceColor(loadedIndex)},
        }));
        submittedStatsResults.forEach(({low, high, colorShiftIndex, statsPerLoadedDiceTable}) => {
            loadedDiceTableRequests.forEach((diceTableRequest, loadedIndex) => {
                const diceList = getDiceList(diceTableRequest.diceTable.name);
                const {pctChance} = statsPerLoadedDiceTable[loadedIndex];
                traces.push({
                    ...getStatsFillTrace(low, high, diceTableRequest.diceTable.data),
                    type: 'scatter',
                    mode: 'none',
                    fill: 'tozeroy',
                    fillcolor: getStatsFillColor(loadedIndex, colorShiftIndex),
                    hoverinfo: 'skip',
                    name: getStatsTraceName(diceList, low, high, pctChance),
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

    function renderStatsTable(loadedDiceTableRequests, submittedStatsResults) {
        const table = document.getElementById('statsTable');
        document.getElementById('statsEmpty').hidden = loadedDiceTableRequests.length > 0;
        table.hidden = loadedDiceTableRequests.length === 0;

        const head = document.createElement('tr');
        head.append(makeElement('th', ''));
        loadedDiceTableRequests.forEach((diceTableRequest, loadedIndex) => {
            const cell = makeElement('th', getDiceList(diceTableRequest.diceTable.name));
            cell.scope = 'col';
            cell.style.color = getTraceColor(loadedIndex);
            cell.title = diceTableRequest.diceTable.diceStr;
            head.append(cell);
        });

        const rows = [
            ['Range', diceTable => getRangeLabel(diceTable.range[0], diceTable.range[1])],
            ['Mean', diceTable => String(diceTable.mean)],
            ['Std dev', diceTable => String(diceTable.stddev)],
        ].map(([label, getValue]) => {
            const row = document.createElement('tr');
            row.append(makeElement('th', label));
            loadedDiceTableRequests.forEach(({diceTable}) => row.append(makeElement('td', getValue(diceTable))));
            return row;
        });

        submittedStatsResults.forEach(({low, high, statsPerLoadedDiceTable}) => {
            const row = document.createElement('tr');
            row.append(makeElement('th', getRangeLabel(low, high)));
            statsPerLoadedDiceTable.forEach(stat => {
                const cell = makeElement('td', stat.pctChance + '%');
                const oneInChance = makeElement('span', '1 in ' + stat.oneInChance);
                oneInChance.className = 'oneInChance';
                cell.append(oneInChance);
                cell.title = `${stat.occurrences} of ${stat.total} combinations`;
                row.append(cell);
            });
            rows.push(row);
        });

        table.tHead.replaceChildren(head);
        table.tBodies[0].replaceChildren(...rows);
    }

    function renderRoller(loadedDiceTableRequests) {
        document.getElementById('rollerEmpty').hidden = loadedDiceTableRequests.length > 0;
        document.getElementById('rollerRows').replaceChildren(...loadedDiceTableRequests.map(makeRollerRow));
    }

    function makeRollerRow(diceTableRequest) {
        const row = document.createElement('div');
        row.className = 'rollerRow';

        const diceList = makeElement('span', getDiceList(diceTableRequest.diceTable.name));
        diceList.className = 'rollerDiceList';
        const button = makeElement('button', 'Roll');
        button.type = 'button';
        button.className = 'secondary';
        const latestRoll = makeElement('div', '');
        latestRoll.className = 'latestRoll';
        latestRoll.setAttribute('aria-live', 'polite');
        const earlierRolls = makeElement('div', '');
        earlierRolls.className = 'earlierRolls';

        const showRolls = () => {
            const [latest, ...earlier] = diceTableRequest.rollHistory;
            latestRoll.textContent = latest ?? 'None';
            earlierRolls.textContent = earlier.join(', ');
        };
        button.addEventListener('click', () => {
            diceTableRequest.rollHistory.unshift(diceTableRequest.roller.roll());
            showRolls();
        });
        showRolls();

        row.append(diceList, button, latestRoll, earlierRolls);
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

function getLowestAndHighestRolls(diceTableRequests) {
    const lowest = Math.min(...diceTableRequests.map(({diceTable}) => diceTable.range[0]));
    const highest = Math.max(...diceTableRequests.map(({diceTable}) => diceTable.range[1]));
    return [lowest, highest];
}

function cloneTemplate(id) {
    return document.getElementById(id).content.firstElementChild.cloneNode(true);
}

function makeElement(tag, text) {
    const element = document.createElement(tag);
    element.textContent = text;
    return element;
}

const minimizedPanelsStorageKey = 'minimizedPanels';

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
        localStorage.setItem(minimizedPanelsStorageKey, JSON.stringify(minimized));
    } catch (storageUnavailable) {
    }
}

function loadMinimizedPanels() {
    try {
        const stored = JSON.parse(localStorage.getItem(minimizedPanelsStorageKey));
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
