/** the only list of trace colors: plotly's default color cycle */
const plotlyDefaultRgb = [
    [31, 119, 180], [255, 127, 14], [44, 160, 44], [214, 39, 40], [148, 103, 189],
    [140, 86, 75], [227, 119, 194], [127, 127, 127], [188, 189, 34], [23, 190, 207],
];

/** @param {number} index */
function getTraceColor(index) {
    const rgb = plotlyDefaultRgb[index % plotlyDefaultRgb.length];
    return '#' + rgb.map(value => value.toString(16).padStart(2, '0')).join('');
}

/**
 * @param {number} traceIndex
 * @param {number} rangeIndex
 */
function getStatsFillColor(traceIndex, rangeIndex) {
    const perRangeShifts = [
        [0, -10, 10], [10, 10, 10], [-10, -10, -10], [-10, 10, -10], [10, -10, 10],
        [-10, -10, 10], [10, -10, -10], [-10, 10, 10], [10, 10, -10], [10, 0, -10],
    ];
    const color = plotlyDefaultRgb[traceIndex % plotlyDefaultRgb.length];
    const shift = perRangeShifts[rangeIndex % perRangeShifts.length];
    const [r, g, b] = color.map((value, i) => Math.min(255, Math.max(0, value + shift[i])));
    return `rgba(${r},${g},${b},0.5)`;
}

/** @param {number[]} usedIndexes */
function lowestUnusedIndex(usedIndexes) {
    let index = 0;
    while (usedIndexes.includes(index)) {
        index++;
    }
    return index;
}

/** @param {AppState} state */
function getUnusedColorIndex(state) {
    return lowestUnusedIndex(state.diceTableRequests.filter(isLoadedDiceTableRequest).map(r => r.colorIndex));
}

/** @param {AppState} state */
function getUnusedShiftIndex(state) {
    return lowestUnusedIndex(state.statsRequests.filter(isSubmittedStatsRequest).map(r => r.shiftIndex));
}
