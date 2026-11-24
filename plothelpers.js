/** @param {string} diceTableName */
function getDiceList(diceTableName) {
    const prefix = '<DiceTable containing ';
    if (diceTableName.startsWith(prefix) && diceTableName.endsWith('>')) {
        return diceTableName.slice(prefix.length, -1);
    }
    return diceTableName;
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
