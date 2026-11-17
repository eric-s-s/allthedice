// Helpers for turning lambda responses into plot traces and labels. No DOM access, so
// they can be tested on their own.

// "<DiceTable containing [2D4, 3D8]>" -> "[2D4, 3D8]"
function getDiceListString(diceTableName) {
    const prefix = '<DiceTable containing ';
    if (diceTableName.startsWith(prefix) && diceTableName.endsWith('>')) {
        return diceTableName.slice(prefix.length, -1);
    }
    return diceTableName;
}

// The line color for the nth calculated collection; Plotly's default palette, so the
// stats table and the plot agree.
function getTraceColor(index) {
    const colors = [
        '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
        '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf',
    ];
    return colors[index % colors.length];
}

// The fill color for one collection's area in one stats range: that collection's color,
// shifted a little per range so overlapping ranges can be told apart.
function getStatsFillColor(traceIndex, rangeIndex) {
    const colors = [
        [31, 119, 180], [255, 127, 14], [44, 160, 44], [214, 39, 40], [148, 103, 189],
        [140, 86, 75], [227, 119, 194], [127, 127, 127], [188, 189, 34], [23, 190, 207],
    ];
    const shifts = [
        [0, -10, 10], [10, 10, 10], [-10, -10, -10], [-10, 10, -10], [10, -10, 10],
        [-10, -10, 10], [10, -10, -10], [-10, 10, 10], [10, 10, -10], [10, 0, -10],
    ];
    const color = colors[traceIndex % colors.length];
    const shift = shifts[rangeIndex % shifts.length];
    const [r, g, b] = color.map((value, i) => Math.min(255, Math.max(0, value + shift[i])));
    return `rgba(${r},${g},${b},0.5)`;
}

// The x and y values for shading the area under a collection's curve from low to high.
// The shading reaches a little past the end rolls (toward the neighboring rolls) so a
// single roll shows up as a band instead of a line.
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
    const reach = 0.48;
    if (first > 0) {
        x.unshift(xs[first] - reach * (xs[first] - xs[first - 1]));
        y.unshift(reach * ys[first - 1] + (1 - reach) * ys[first]);
    }
    if (last < xs.length - 1) {
        x.push(xs[last] + reach * (xs[last + 1] - xs[last]));
        y.push(reach * ys[last + 1] + (1 - reach) * ys[last]);
    }
    return {x, y};
}

// "3 to 7", or just "3" for a single roll.
function getRangeLabel(low, high) {
    return low === high ? String(low) : `${low} to ${high}`;
}

// The legend entry for a stats range: "[2D6] 3 to 7: 41.67%"
function getStatsTraceName(diceName, low, high, pctChance) {
    return `${diceName} ${getRangeLabel(low, high)}: ${pctChance}%`;
}
