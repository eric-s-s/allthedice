/** @typedef {{low: number, high: number}} RollRange */
/** @typedef {{primary: string, alternate: string, primaryHeight: string}} Alias */
/** @typedef {{roll: number, mantissa: string, exponent: string}} SciNumEntry */

/**
 * The parsed server response. Read-only after parsing.
 * @typedef {object} DiceTable
 * @property {string} name
 * @property {string} diceList
 * @property {string} diceStr
 * @property {{x: number[], y: number[]}} data
 * @property {SciNumEntry[]} forSciNum
 * @property {RollRange} range
 * @property {number} mean
 * @property {number} stddev
 * @property {{height: string, aliases: Alias[]}} roller
 */

/**
 * @typedef {object} AppState
 * @property {DiceTableRequest[]} diceTableRequests
 * @property {StatsRequest[]} statsRequests
 */

/**
 * @typedef {DiceTableRequest & {diceTable: DiceTable, roller: AliasTableRoller, colorIndex: number}}
 *     LoadedDiceTableRequest
 */
/** @typedef {StatsRequest & {submittedRange: RollRange, shiftIndex: number}} SubmittedStatsRequest */

class DiceTableRequest {
    constructor() {
        this.id = crypto.randomUUID();
        this.buildStringInput = '';
        this.isPending = false;
        /** '' means no error */
        this.error = '';
        /** @type {DiceTable | null} */
        this.diceTable = null;
        /** @type {AliasTableRoller | null} */
        this.roller = null;
        /** @type {number | null} */
        this.colorIndex = null;
        /** @type {string[]} newest first */
        this.rollHistory = [];
    }

    get isLoaded() {
        return this.diceTable !== null;
    }

    isBlank() {
        return !this.isLoaded && !this.isPending && this.buildStringInput.trim() === '';
    }

    /**
     * @param {DiceTable} diceTable
     * @param {number} colorIndex used only on the first load; a reload keeps the color it has
     */
    load(diceTable, colorIndex) {
        this.diceTable = diceTable;
        this.roller = new AliasTableRoller(diceTable.roller.height, diceTable.roller.aliases);
        this.rollHistory = [];
        if (this.colorIndex === null) {
            this.colorIndex = colorIndex;
        }
    }

    roll() {
        if (this.roller === null) {
            throw new Error('Cannot roll a dice table request that is not loaded.');
        }
        const roll = this.roller.roll();
        this.rollHistory.unshift(roll);
        return roll;
    }
}

class StatsRequest {
    constructor() {
        this.id = crypto.randomUUID();
        this.lowInput = '';
        this.highInput = '';
        /** @type {RollRange | null} stored sorted */
        this.submittedRange = null;
        /** @type {number | null} */
        this.shiftIndex = null;
    }

    /** @param {number} shiftIndex used only on the first submit; later submits keep the shift they have */
    submit(shiftIndex) {
        const low = parseInt(this.lowInput, 10);
        const high = parseInt(this.highInput, 10);
        this.submittedRange = {low: Math.min(low, high), high: Math.max(low, high)};
        if (this.shiftIndex === null) {
            this.shiftIndex = shiftIndex;
        }
    }
}

/**
 * @param {DiceTableRequest} request
 * @returns {request is LoadedDiceTableRequest}
 */
function isLoadedDiceTableRequest(request) {
    return request.isLoaded;
}

/**
 * @param {StatsRequest} request
 * @returns {request is SubmittedStatsRequest}
 */
function isSubmittedStatsRequest(request) {
    return request.submittedRange !== null;
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

/**
 * Checks the server's dice table once, when it arrives, so a malformed response is reported on its request
 * instead of breaking the plot or stats later.
 * @param {unknown} json
 * @returns {DiceTable}
 */
function parseDiceTable(json) {
    const table = requireObject(json, 'response');
    const data = requireObject(table.data, 'data');
    const x = requireArray(data.x, 'data.x', requireNumber);
    const y = requireArray(data.y, 'data.y', requireNumber);
    if (x.length !== y.length) {
        throw badDiceTable('"data.y" must be as long as "data.x"');
    }
    const range = requireArray(table.range, 'range', requireNumber);
    if (range.length !== 2) {
        throw badDiceTable('"range" must be [low, high]');
    }
    const roller = requireObject(table.roller, 'roller');
    const name = requireString(table.name, 'name');
    return {
        name,
        diceList: getDiceList(name),
        diceStr: requireString(table.diceStr, 'diceStr'),
        data: {x, y},
        forSciNum: requireArray(table.forSciNum, 'forSciNum', (value, field) => {
            const entry = requireObject(value, field);
            return {
                roll: requireNumber(entry.roll, `${field}.roll`),
                mantissa: requireString(entry.mantissa, `${field}.mantissa`),
                exponent: requireString(entry.exponent, `${field}.exponent`),
            };
        }),
        range: {low: range[0], high: range[1]},
        mean: requireNumber(table.mean, 'mean'),
        stddev: requireNumber(table.stddev, 'stddev'),
        roller: {
            height: requireString(roller.height, 'roller.height'),
            aliases: requireArray(roller.aliases, 'roller.aliases', (value, field) => {
                const alias = requireObject(value, field);
                return {
                    primary: requireString(alias.primary, `${field}.primary`),
                    alternate: requireString(alias.alternate, `${field}.alternate`),
                    primaryHeight: requireString(alias.primaryHeight, `${field}.primaryHeight`),
                };
            }),
        },
    };
}

/** @param {string} problem */
function badDiceTable(problem) {
    return new Error(`The dice server sent a bad dice table: ${problem}.`);
}

/**
 * @param {unknown} value
 * @param {string} field
 * @returns {Record<string, unknown>}
 */
function requireObject(value, field) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw badDiceTable(`"${field}" must be an object`);
    }
    return /** @type {Record<string, unknown>} */ (value);
}

/**
 * @template T
 * @param {unknown} value
 * @param {string} field
 * @param {(item: unknown, field: string) => T} requireItem
 * @returns {T[]}
 */
function requireArray(value, field, requireItem) {
    if (!Array.isArray(value)) {
        throw badDiceTable(`"${field}" must be an array`);
    }
    return value.map((item, index) => requireItem(item, `${field}[${index}]`));
}

/**
 * @param {unknown} value
 * @param {string} field
 */
function requireString(value, field) {
    if (typeof value !== 'string') {
        throw badDiceTable(`"${field}" must be a string`);
    }
    return value;
}

/**
 * @param {unknown} value
 * @param {string} field
 */
function requireNumber(value, field) {
    if (typeof value !== 'number') {
        throw badDiceTable(`"${field}" must be a number`);
    }
    return value;
}
