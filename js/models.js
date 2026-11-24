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
