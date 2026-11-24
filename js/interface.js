document.addEventListener('DOMContentLoaded', onPageLoad);

/**
 * @typedef {object} StatsCell
 * @property {LoadedDiceTableRequest} diceTableRequest
 * @property {ReturnType<typeof getStats>} stats
 */

/** @typedef {{statsRequest: SubmittedStatsRequest, range: RollRange, cells: StatsCell[]}} StatsRow */

function onPageLoad() {
    /** @type {AppState} */
    const state = {diceTableRequests: [], statsRequests: [], diceBuilder: null};
    window.allTheDice = {state};

    /** @type {Map<string, DiceTableRequestView>} */
    const diceTableRequestViews = new Map();
    /** @type {Map<string, StatsRequestView>} */
    const statsRequestViews = new Map();
    const diceTableRequestList = getElement('diceTableRequestList');
    const statsRequestList = getElement('statsRequestList');

    setUpPanels();
    setUpMenus();

    const diceBuilderView = new DiceBuilderView(() => state.diceBuilder, {
        // only the builder changed, so the plot, stats and roller are left alone
        change: () => diceBuilderView.update(state.diceBuilder),
        done: finishDiceBuilder,
        cancel: () => {
            state.diceBuilder = null;
            render();
        },
    });

    getElement('addDiceTableRequest').addEventListener('click', () => {
        const diceTableRequest = addDiceTableRequest();
        render();
        getView(diceTableRequestViews, diceTableRequest.id).input.focus();
    });
    getElement('addStatsRequest').addEventListener('click', () => {
        const statsRequest = addStatsRequest();
        render();
        getView(statsRequestViews, statsRequest.id).low.focus();
    });
    document.querySelectorAll('.example').forEach(element => {
        const button = /** @type {HTMLButtonElement} */ (element);
        button.addEventListener('click', () => {
            const menu = button.closest('details');
            if (menu !== null) {
                menu.open = false;
            }
            getExampleDiceTable(button.dataset.build ?? '');
        });
    });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', render);

    addDiceTableRequest();
    addStatsRequest();
    render();

    function addDiceTableRequest() {
        const diceTableRequest = new DiceTableRequest();
        state.diceTableRequests.push(diceTableRequest);
        return diceTableRequest;
    }

    /** @param {DiceTableRequest} diceTableRequest */
    function removeDiceTableRequest(diceTableRequest) {
        state.diceTableRequests.splice(state.diceTableRequests.indexOf(diceTableRequest), 1);
        if (state.diceTableRequests.length === 0) {
            addDiceTableRequest();
        }
        render();
    }

    /** @param {string} buildString */
    function getExampleDiceTable(buildString) {
        const diceTableRequest = state.diceTableRequests.find(request => request.isBlank()) || addDiceTableRequest();
        diceTableRequest.buildStringInput = buildString;
        getDiceTable(diceTableRequest);
    }

    /** @param {DiceTableRequest} diceTableRequest */
    async function getDiceTable(diceTableRequest) {
        if (diceTableRequest.isPending) {
            return;
        }
        diceTableRequest.isPending = true;
        diceTableRequest.error = '';
        render();
        try {
            const diceTable = await fetchDiceTable(diceTableRequest.buildStringInput);
            diceTableRequest.load(diceTable, getUnusedColorIndex(state));
        } catch (error) {
            diceTableRequest.error = error instanceof Error ? error.message : String(error);
        } finally {
            diceTableRequest.isPending = false;
        }
        render();
    }

    /** @param {DiceTableRequest} diceTableRequest */
    function openDiceBuilder(diceTableRequest) {
        const builder = parseBuildString(diceTableRequest.buildStringInput);
        state.diceBuilder = builder === null
            ? {diceTableRequest, builder: new DiceBuilder(), replacedText: diceTableRequest.buildStringInput.trim()}
            : {diceTableRequest, builder, replacedText: ''};
        render();
    }

    function finishDiceBuilder() {
        const session = state.diceBuilder;
        const buildString = session?.builder.toBuildString();
        if (!session || !buildString) {
            return;
        }
        session.diceTableRequest.buildStringInput = buildString;
        state.diceBuilder = null;
        render();
        getDiceTable(session.diceTableRequest);
    }

    function addStatsRequest() {
        const statsRequest = new StatsRequest();
        state.statsRequests.push(statsRequest);
        return statsRequest;
    }

    /** @param {StatsRequest} statsRequest */
    function submitStatsRequest(statsRequest) {
        statsRequest.submit(getUnusedShiftIndex(state));
        render();
    }

    /** @param {StatsRequest} statsRequest */
    function removeStatsRequest(statsRequest) {
        state.statsRequests.splice(state.statsRequests.indexOf(statsRequest), 1);
        if (state.statsRequests.length === 0) {
            addStatsRequest();
        }
        render();
    }

    /**
     * Changes the box only; Calculate recalculates.
     * @param {StatsRequest} statsRequest
     * @param {'low' | 'high'} bound
     * @param {number} delta
     */
    function stepStatsRequest(statsRequest, bound, delta) {
        const rollLimits = getRollLimits();
        if (bound === 'low') {
            statsRequest.lowInput = stepRollBound(statsRequest.lowInput, delta, rollLimits);
        } else {
            statsRequest.highInput = stepRollBound(statsRequest.highInput, delta, rollLimits);
        }
        render();
    }

    /** @returns {RollRange | null} the rolls the loaded dice tables can make, or null when none are loaded */
    function getRollLimits() {
        const loadedDiceTableRequests = state.diceTableRequests.filter(isLoadedDiceTableRequest);
        return loadedDiceTableRequests.length === 0 ? null : getLowestAndHighestRolls(loadedDiceTableRequests);
    }

    function render() {
        const loadedDiceTableRequests = state.diceTableRequests.filter(isLoadedDiceTableRequest);
        const rollLimits = getRollLimits();
        if (rollLimits !== null) {
            state.statsRequests.forEach(statsRequest => statsRequest.snapToRollLimits(rollLimits));
        }

        syncViews(
            state.diceTableRequests,
            diceTableRequestViews,
            diceTableRequestList,
            model => new DiceTableRequestView(model, {
                submit: () => getDiceTable(model),
                remove: () => removeDiceTableRequest(model),
                build: () => openDiceBuilder(model),
            }),
            (view, model) => view.update(model),
        );
        syncViews(
            state.statsRequests,
            statsRequestViews,
            statsRequestList,
            model => new StatsRequestView(model, {
                submit: () => submitStatsRequest(model),
                remove: () => removeStatsRequest(model),
                step: (bound, delta) => stepStatsRequest(model, bound, delta),
            }),
            (view, model) => view.update(model),
        );
        diceBuilderView.update(state.diceBuilder);

        const statsRows = getStatsRows(loadedDiceTableRequests, rollLimits);
        renderPlot(loadedDiceTableRequests, statsRows);
        renderStatsTable(loadedDiceTableRequests, statsRows);
        renderRoller(loadedDiceTableRequests);
    }

    /**
     * @param {LoadedDiceTableRequest[]} loadedDiceTableRequests
     * @param {RollRange | null} rollLimits the rolls the loaded dice tables can make, or null when none are loaded
     * @returns {StatsRow[]}
     */
    function getStatsRows(loadedDiceTableRequests, rollLimits) {
        if (rollLimits === null) {
            return [];
        }
        return state.statsRequests.filter(isSubmittedStatsRequest).map(statsRequest => {
            const range = statsRequest.resolveRange(rollLimits);
            const rolls = getEveryRollFrom(range.low, range.high);
            return {
                statsRequest,
                range,
                cells: loadedDiceTableRequests.map(diceTableRequest => ({
                    diceTableRequest,
                    stats: getStats(diceTableRequest.diceTable.forSciNum, rolls),
                })),
            };
        });
    }
}

/**
 * @param {LoadedDiceTableRequest[]} loadedDiceTableRequests
 * @param {StatsRow[]} statsRows
 */
function renderPlot(loadedDiceTableRequests, statsRows) {
    const plotDiv = getElement('plotDiv');
    getElement('plotEmpty').hidden = loadedDiceTableRequests.length > 0;
    if (typeof Plotly === 'undefined') {
        plotDiv.textContent = 'The plotting library did not load, so the plot is unavailable.';
        return;
    }

    /** @type {object[]} */
    const traces = loadedDiceTableRequests.map(({diceTable, colorIndex}) => ({
        x: diceTable.data.x,
        y: diceTable.data.y,
        name: diceTable.diceList,
        mode: diceTable.data.x.length <= 100 ? 'lines+markers' : 'lines',
        line: {color: getTraceColor(colorIndex)},
        marker: {color: getTraceColor(colorIndex)},
    }));
    statsRows.forEach(({statsRequest, range: {low, high}, cells}) => {
        cells.forEach(({diceTableRequest: {diceTable, colorIndex}, stats}) => {
            traces.push({
                ...getStatsFillTrace(low, high, diceTable.data),
                type: 'scatter',
                mode: 'none',
                fill: 'tozeroy',
                fillcolor: getStatsFillColor(colorIndex, statsRequest.shiftIndex),
                hoverinfo: 'skip',
                name: getStatsTraceName(diceTable.diceList, low, high, stats.pctChance),
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

/**
 * @param {LoadedDiceTableRequest[]} loadedDiceTableRequests
 * @param {StatsRow[]} statsRows
 */
function renderStatsTable(loadedDiceTableRequests, statsRows) {
    const table = /** @type {HTMLTableElement} */ (getElement('statsTable'));
    getElement('statsEmpty').hidden = loadedDiceTableRequests.length > 0;
    table.hidden = loadedDiceTableRequests.length === 0;

    const head = document.createElement('tr');
    head.append(makeElement('th', ''));
    loadedDiceTableRequests.forEach(({diceTable, colorIndex}) => {
        const cell = makeElement('th', diceTable.diceList);
        cell.scope = 'col';
        cell.style.color = getTraceColor(colorIndex);
        cell.title = diceTable.diceStr;
        head.append(cell);
    });

    /** @type {[string, (diceTable: DiceTable) => string][]} */
    const summaryRows = [
        ['Range', diceTable => getRangeLabel(diceTable.range.low, diceTable.range.high)],
        ['Mean', diceTable => String(diceTable.mean)],
        ['Std dev', diceTable => String(diceTable.stddev)],
    ];
    const rows = summaryRows.map(([label, getValue]) => {
        const row = document.createElement('tr');
        row.append(makeElement('th', label));
        loadedDiceTableRequests.forEach(({diceTable}) => row.append(makeElement('td', getValue(diceTable))));
        return row;
    });

    statsRows.forEach(({range, cells}) => {
        const row = document.createElement('tr');
        row.append(makeElement('th', getRangeLabel(range.low, range.high)));
        cells.forEach(({stats}) => {
            const cell = makeElement('td', stats.pctChance + '%');
            const oneInChance = makeElement('span', '1 in ' + stats.oneInChance);
            oneInChance.className = 'oneInChance';
            cell.append(oneInChance);
            cell.title = `${stats.occurrences} of ${stats.total} combinations`;
            row.append(cell);
        });
        rows.push(row);
    });

    table.tHead?.replaceChildren(head);
    table.tBodies[0].replaceChildren(...rows);
}

/** @param {LoadedDiceTableRequest[]} loadedDiceTableRequests */
function renderRoller(loadedDiceTableRequests) {
    getElement('rollerEmpty').hidden = loadedDiceTableRequests.length > 0;
    getElement('rollerRows').replaceChildren(...loadedDiceTableRequests.map(makeRollerRow));
}

/** @param {LoadedDiceTableRequest} diceTableRequest */
function makeRollerRow(diceTableRequest) {
    const row = document.createElement('div');
    row.className = 'rollerRow';

    const diceList = makeElement('span', diceTableRequest.diceTable.diceList);
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
        diceTableRequest.roll();
        showRolls();
    });
    showRolls();

    row.append(diceList, button, latestRoll, earlierRolls);
    return row;
}

/**
 * @param {LoadedDiceTableRequest[]} diceTableRequests
 * @returns {RollRange}
 */
function getLowestAndHighestRolls(diceTableRequests) {
    const low = Math.min(...diceTableRequests.map(({diceTable}) => diceTable.range.low));
    const high = Math.max(...diceTableRequests.map(({diceTable}) => diceTable.range.high));
    return {low, high};
}

/** @param {string} id */
function getElement(id) {
    const element = document.getElementById(id);
    if (element === null) {
        throw new Error(`The page has no #${id}.`);
    }
    return element;
}

/**
 * @param {ParentNode} parent
 * @param {string} selector
 */
function findElement(parent, selector) {
    const element = parent.querySelector(selector);
    if (!(element instanceof HTMLElement)) {
        throw new Error(`Found no ${selector}.`);
    }
    return element;
}

/**
 * @template {keyof HTMLElementTagNameMap} Tag
 * @param {Tag} tag
 * @param {string} text
 */
function makeElement(tag, text) {
    const element = document.createElement(tag);
    element.textContent = text;
    return element;
}

const minimizedPanelsStorageKey = 'minimizedPanels';

function setUpPanels() {
    const minimized = loadMinimizedPanels();
    document.querySelectorAll('.panel').forEach(panel => {
        findElement(panel, '.panelToggle').addEventListener('click', () => {
            setPanelMinimized(panel, !panel.classList.contains('minimized'));
            saveMinimizedPanels();
        });
        if (minimized.includes(panel.id)) {
            setPanelMinimized(panel, true);
        }
    });
}

/**
 * @param {Element} panel
 * @param {boolean} isMinimized
 */
function setPanelMinimized(panel, isMinimized) {
    panel.classList.toggle('minimized', isMinimized);
    findElement(panel, '.panelToggle').setAttribute('aria-expanded', String(!isMinimized));
    const plot = panel.querySelector('.js-plotly-plot');
    if (!isMinimized && plot !== null) {
        refitPlotAfterReveal(plot);
    }
}

/** @param {Element} plot */
function refitPlotAfterReveal(plot) {
    Plotly.Plots.resize(plot);
}

function saveMinimizedPanels() {
    const minimized = [...document.querySelectorAll('.panel.minimized')].map(panel => panel.id);
    try {
        localStorage.setItem(minimizedPanelsStorageKey, JSON.stringify(minimized));
    } catch {
        // storage is unavailable (private window, blocked site data): the panels just aren't remembered
    }
}

function loadMinimizedPanels() {
    try {
        const stored = JSON.parse(localStorage.getItem(minimizedPanelsStorageKey) ?? 'null');
        return Array.isArray(stored) ? stored : [];
    } catch {
        return [];
    }
}

function setUpMenus() {
    const menus = /** @type {HTMLDetailsElement[]} */ ([...document.querySelectorAll('details.menu')]);
    closeOtherMenusWhenOneOpens(menus);
    closeMenusOnOutsideClick(menus);
    closeMenusOnEscape(menus);
}

/** @param {HTMLDetailsElement[]} menus */
function closeOtherMenusWhenOneOpens(menus) {
    menus.forEach(menu => menu.addEventListener('toggle', () => {
        if (menu.open) {
            menus.filter(other => other !== menu).forEach(other => {
                other.open = false;
            });
        }
    }));
}

/** @param {HTMLDetailsElement[]} menus */
function closeMenusOnOutsideClick(menus) {
    document.addEventListener('click', event => {
        menus.filter(menu => menu.open && !menu.contains(/** @type {Node | null} */ (event.target))).forEach(menu => {
            menu.open = false;
        });
    });
}

/** @param {HTMLDetailsElement[]} menus */
function closeMenusOnEscape(menus) {
    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape') {
            return;
        }
        menus.filter(menu => menu.open).forEach(menu => {
            menu.open = false;
            findElement(menu, 'summary').focus();
        });
    });
}
