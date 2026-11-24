/** @typedef {{low: number, high: number}} RollRange */
/** @typedef {number | 'MIN' | 'MAX'} RollBound */
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
/**
 * @typedef {StatsRequest & {submittedBounds: {low: RollBound, high: RollBound}, shiftIndex: number}}
 *     SubmittedStatsRequest
 */

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
        this.lowInput = 'MIN';
        this.highInput = 'MAX';
        /** @type {{low: RollBound, high: RollBound} | null} stored as typed, not sorted */
        this.submittedBounds = null;
        /** @type {number | null} */
        this.shiftIndex = null;
    }

    /** @param {number} shiftIndex used only on the first submit; later submits keep the shift they have */
    submit(shiftIndex) {
        const low = parseRollBound(this.lowInput);
        const high = parseRollBound(this.highInput);
        if (low === null || high === null) {
            throw new Error(`Cannot submit the range ${this.lowInput} to ${this.highInput}.`);
        }
        this.submittedBounds = {low, high};
        if (this.shiftIndex === null) {
            this.shiftIndex = shiftIndex;
        }
    }

    /**
     * @param {RollRange} rollLimits the rolls the loaded dice tables can make
     * @returns {RollRange} sorted, with MIN and MAX replaced by the lowest and highest roll
     */
    resolveRange(rollLimits) {
        if (this.submittedBounds === null) {
            throw new Error('Cannot resolve a stats request that is not submitted.');
        }
        const low = resolveRollBound(this.submittedBounds.low, rollLimits);
        const high = resolveRollBound(this.submittedBounds.high, rollLimits);
        return {low: Math.min(low, high), high: Math.max(low, high)};
    }

    /**
     * Turns numbers below the lowest roll into MIN and numbers above the highest roll into MAX,
     * in both the inputs and the submitted bounds.
     * @param {RollRange} rollLimits the rolls the loaded dice tables can make
     */
    snapToRollLimits(rollLimits) {
        this.lowInput = snapRollBoundText(this.lowInput, rollLimits);
        this.highInput = snapRollBoundText(this.highInput, rollLimits);
        if (this.submittedBounds !== null) {
            this.submittedBounds = {
                low: snapRollBound(this.submittedBounds.low, rollLimits),
                high: snapRollBound(this.submittedBounds.high, rollLimits),
            };
        }
    }
}

/**
 * @param {string} text
 * @returns {RollBound | null} null when the text is not MIN, MAX (in any case) or a whole number
 */
function parseRollBound(text) {
    const trimmed = text.trim();
    if (/^min$/i.test(trimmed)) {
        return 'MIN';
    }
    if (/^max$/i.test(trimmed)) {
        return 'MAX';
    }
    if (/^-?[0-9]+$/.test(trimmed)) {
        return parseInt(trimmed, 10);
    }
    return null;
}

/**
 * Does not snap: MIN - 1 gives the lowest roll - 1, and the next render snaps that back to MIN.
 * @param {string} text the box text
 * @param {number} delta
 * @param {RollRange | null} rollLimits the rolls the loaded dice tables can make, or null when none are loaded
 * @returns {string} the new box text; unchanged when the text is unparseable, or MIN/MAX with no rollLimits
 */
function stepRollBound(text, delta, rollLimits) {
    const bound = parseRollBound(text);
    if (typeof bound === 'number') {
        return String(bound + delta);
    }
    if (bound === null || rollLimits === null) {
        return text;
    }
    return String(resolveRollBound(bound, rollLimits) + delta);
}

/**
 * @param {RollBound} bound
 * @param {RollRange} rollLimits
 */
function resolveRollBound(bound, rollLimits) {
    if (bound === 'MIN') {
        return rollLimits.low;
    }
    if (bound === 'MAX') {
        return rollLimits.high;
    }
    return bound;
}

/**
 * @param {RollBound} bound
 * @param {RollRange} rollLimits
 * @returns {RollBound}
 */
function snapRollBound(bound, rollLimits) {
    if (typeof bound === 'number' && bound < rollLimits.low) {
        return 'MIN';
    }
    if (typeof bound === 'number' && bound > rollLimits.high) {
        return 'MAX';
    }
    return bound;
}

/**
 * @param {string} text
 * @param {RollRange} rollLimits
 * @returns {string} the text, or MIN/MAX when it is a number outside the rollLimits
 */
function snapRollBoundText(text, rollLimits) {
    const bound = parseRollBound(text);
    if (typeof bound !== 'number') {
        return text;
    }
    const snapped = snapRollBound(bound, rollLimits);
    return snapped === bound ? text : String(snapped);
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
    return request.submittedBounds !== null;
}
