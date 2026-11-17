function getDiceList(diceTableName) {
    const prefix = '<DiceTable containing ';
    if (diceTableName.startsWith(prefix) && diceTableName.endsWith('>')) {
        return diceTableName.slice(prefix.length, -1);
    }
    return diceTableName;
}

function getTraceColor(index) {
    const plotlyDefaultColors = [
        '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
        '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf',
    ];
    return plotlyDefaultColors[index % plotlyDefaultColors.length];
}

function getStatsFillColor(traceIndex, rangeIndex) {
    const plotlyDefaultRgb = [
        [31, 119, 180], [255, 127, 14], [44, 160, 44], [214, 39, 40], [148, 103, 189],
        [140, 86, 75], [227, 119, 194], [127, 127, 127], [188, 189, 34], [23, 190, 207],
    ];
    const perRangeShifts = [
        [0, -10, 10], [10, 10, 10], [-10, -10, -10], [-10, 10, -10], [10, -10, 10],
        [-10, -10, 10], [10, -10, -10], [-10, 10, 10], [10, 10, -10], [10, 0, -10],
    ];
    const color = plotlyDefaultRgb[traceIndex % plotlyDefaultRgb.length];
    const shift = perRangeShifts[rangeIndex % perRangeShifts.length];
    const [r, g, b] = color.map((value, i) => Math.min(255, Math.max(0, value + shift[i])));
    return `rgba(${r},${g},${b},0.5)`;
}

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

function getRangeLabel(low, high) {
    return low === high ? String(low) : `${low} to ${high}`;
}

function getStatsTraceName(diceList, low, high, pctChance) {
    return `${diceList} ${getRangeLabel(low, high)}: ${pctChance}%`;
}
