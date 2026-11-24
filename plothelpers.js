/** @param {string} diceTableName */
function getDiceList(diceTableName) {
    const prefix = '<DiceTable containing ';
    if (diceTableName.startsWith(prefix) && diceTableName.endsWith('>')) {
        return diceTableName.slice(prefix.length, -1);
    }
    return diceTableName;
}

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

/**
 * @param {number} low
 * @param {number} high
 * @param {{x: number[], y: number[]}} data
 */
function getStatsFillTrace(low, high, data) {
    const xs = data.x;
    const ys = data.y;
    const first = xs.findIndex(x => x >= low);
    const last = xs.findLastIndex(x => x <= high);
    if (first === -1 || last === -1 || first > last) {
        return {x: [], y: []};
    }
    const x = xs.slice(first, last + 1);
    const y = ys.slice(first, last + 1);
    const reachTowardNeighborRolls = 0.48;
    if (first > 0) {
        x.unshift(xs[first] - reachTowardNeighborRolls * (xs[first] - xs[first - 1]));
        y.unshift(reachTowardNeighborRolls * ys[first - 1] + (1 - reachTowardNeighborRolls) * ys[first]);
    }
    if (last < xs.length - 1) {
        x.push(xs[last] + reachTowardNeighborRolls * (xs[last + 1] - xs[last]));
        y.push(reachTowardNeighborRolls * ys[last + 1] + (1 - reachTowardNeighborRolls) * ys[last]);
    }
    return {x, y};
}

/**
 * @param {number} low
 * @param {number} high
 */
function getRangeLabel(low, high) {
    return low === high ? String(low) : `${low} to ${high}`;
}

/**
 * @param {string} diceList
 * @param {number} low
 * @param {number} high
 * @param {string} pctChance
 */
function getStatsTraceName(diceList, low, high, pctChance) {
    return `${diceList} ${getRangeLabel(low, high)}: ${pctChance}%`;
}
