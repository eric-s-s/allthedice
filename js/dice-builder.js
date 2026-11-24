/**
 * A die that has been added to the builder. weights[i] is the weight of face i + 1.
 * @typedef {{kind: 'Die', sides: number}
 *     | {kind: 'ModDie', sides: number, modifier: number}
 *     | {kind: 'WeightedDie', weights: number[]}
 *     | {kind: 'ModWeightedDie', weights: number[], modifier: number}} BuilderDie
 */
/** @typedef {BuilderDie['kind']} BuilderDieKind */
/** @typedef {'none' | 'best' | 'worst' | 'exploding' | 'strong'} BuilderWrapper */

/**
 * @typedef {object} DiceBuilderSession
 * @property {DiceTableRequest} diceTableRequest the row that Done writes to
 * @property {DiceBuilder} builder
 * @property {string} unreadableText the row's text when the builder could not read it, so Done will discard it;
 *     '' otherwise
 */

/** a weighted die gets one weight box per side, so its sides are capped */
const maxWeightedSides = 100;

/** One part of the collection: a count of a die, with at most one wrapper. Every box keeps its raw text. */
class BuilderPart {
    /** @param {BuilderDie} die */
    constructor(die) {
        this.id = crypto.randomUUID();
        this.die = die;
        this.countInput = '1';
        /** @type {BuilderWrapper} */
        this.wrapper = 'none';
        this.poolSizeInput = '2';
        this.keepInput = '1';
        this.multiplierInput = '2';
    }

    /** @returns {number | null} null when the box breaks its limit */
    getCount() {
        return limitWholeNumber(this.countInput, 1);
    }

    /** @returns {number | null} */
    getPoolSize() {
        return limitWholeNumber(this.poolSizeInput, 1);
    }

    /** @returns {number | null} null when below 1 or above a valid pool size */
    getKeep() {
        return limitWholeNumber(this.keepInput, 1, this.getPoolSize() ?? Infinity);
    }

    /** @returns {number | null} */
    getMultiplier() {
        return limitWholeNumber(this.multiplierInput, 1);
    }
}

/** The custom die form, before Add. */
class CustomDieDraft {
    constructor() {
        /** @type {BuilderDieKind} */
        this.kind = 'Die';
        this.sidesInput = '6';
        this.modifierInput = '0';
        /** @type {string[]} one per side */
        this.weightInputs = Array(6).fill('1');
    }

    get isWeighted() {
        return this.kind === 'WeightedDie' || this.kind === 'ModWeightedDie';
    }

    get hasModifier() {
        return this.kind === 'ModDie' || this.kind === 'ModWeightedDie';
    }

    /**
     * Sets the sides box, and when it holds 1 to 100, gives the weights that many boxes. Weights still in range
     * are kept, and new sides start at 1.
     * @param {string} text
     */
    setSides(text) {
        this.sidesInput = text;
        const sides = limitWholeNumber(text, 1, maxWeightedSides);
        if (sides !== null) {
            this.weightInputs = Array.from({length: sides}, (_, index) => this.weightInputs[index] ?? '1');
        }
    }

    /** @returns {number | null} */
    getSides() {
        return limitWholeNumber(this.sidesInput, 1, this.isWeighted ? maxWeightedSides : Infinity);
    }

    /** @returns {number | null} */
    getModifier() {
        return parseWholeNumber(this.modifierInput);
    }

    /**
     * @param {number} index
     * @returns {number | null}
     */
    getWeight(index) {
        return limitWholeNumber(this.weightInputs[index], 0);
    }

    /** @returns {number[] | null} null when a weight is invalid or every weight is 0 */
    getWeights() {
        /** @type {number[]} */
        const weights = [];
        for (let index = 0; index < this.weightInputs.length; index++) {
            const weight = this.getWeight(index);
            if (weight === null) {
                return null;
            }
            weights.push(weight);
        }
        return weights.some(weight => weight > 0) ? weights : null;
    }

    /** @returns {BuilderDie | null} null when a box this kind uses breaks its limit */
    toDie() {
        const sides = this.getSides();
        const modifier = this.getModifier();
        if (sides === null || (this.hasModifier && modifier === null)) {
            return null;
        }
        if (!this.isWeighted) {
            return this.kind === 'ModDie' ? {kind: 'ModDie', sides, modifier: modifier ?? 0} : {kind: 'Die', sides};
        }
        const weights = this.getWeights();
        if (weights === null) {
            return null;
        }
        return this.kind === 'ModWeightedDie'
            ? {kind: 'ModWeightedDie', weights, modifier: modifier ?? 0}
            : {kind: 'WeightedDie', weights};
    }
}

class DiceBuilder {
    constructor() {
        /** @type {BuilderPart[]} in the order they were added */
        this.parts = [];
        this.modifierInput = '0';
        this.draft = new CustomDieDraft();
    }

    /**
     * Adds 1 to the count of a plain Die(sides) part, or adds one when there is none.
     * @param {number} sides
     */
    addPreset(sides) {
        const match = this.parts.find(part =>
            part.wrapper === 'none' && part.die.kind === 'Die' && part.die.sides === sides);
        if (match === undefined) {
            this.parts.push(new BuilderPart({kind: 'Die', sides}));
        } else {
            match.countInput = stepWholeNumber(match.countInput, 1, 1);
        }
    }

    /** Adds the draft's die. Does nothing when the draft is invalid. The draft keeps its values. */
    addCustomDie() {
        const die = this.draft.toDie();
        if (die !== null) {
            this.parts.push(new BuilderPart(die));
        }
    }

    /** @param {string} id */
    removePart(id) {
        this.parts = this.parts.filter(part => part.id !== id);
    }

    /**
     * A count never steps below 1; parts are removed with their own button.
     * @param {string} id
     * @param {number} delta
     */
    stepCount(id, delta) {
        const part = this.parts.find(each => each.id === id);
        if (part === undefined) {
            throw new Error(`The builder has no part ${id}.`);
        }
        part.countInput = stepWholeNumber(part.countInput, delta, 1);
    }

    /** @param {number} delta */
    stepModifier(delta) {
        this.modifierInput = stepWholeNumber(this.modifierInput, delta);
    }

    /** @returns {number | null} */
    getModifier() {
        return parseWholeNumber(this.modifierInput);
    }

    /** @returns {string | null} '' when there is nothing to build, and null when any box breaks its limit */
    toBuildString() {
        const modifier = this.getModifier();
        if (modifier === null) {
            return null;
        }
        /** @type {string[]} */
        const parts = [];
        for (const part of this.parts) {
            const partString = partToBuildString(part);
            if (partString === null) {
                return null;
            }
            parts.push(partString);
        }
        if (modifier !== 0) {
            parts.push(`Modifier(${modifier})`);
        }
        return parts.join('&');
    }
}

/**
 * @param {string} text
 * @returns {number | null} null when the trimmed text is not a whole number
 */
function parseWholeNumber(text) {
    const trimmed = text.trim();
    return /^-?[0-9]+$/.test(trimmed) ? parseInt(trimmed, 10) : null;
}

/**
 * @param {string} text
 * @param {number} min
 * @param {number} [max]
 * @returns {number | null} the whole number, or null when it isn't one or is outside min to max
 */
function limitWholeNumber(text, min, max = Infinity) {
    const number = parseWholeNumber(text);
    return number !== null && number >= min && number <= max ? number : null;
}

/**
 * @param {string} text invalid text steps as 0
 * @param {number} delta
 * @param {number} [min]
 * @returns {string}
 */
function stepWholeNumber(text, delta, min = -Infinity) {
    return String(Math.max((parseWholeNumber(text) ?? 0) + delta, min));
}

/**
 * @param {BuilderDie} die
 * @returns {string}
 */
function dieToBuildString(die) {
    switch (die.kind) {
        case 'Die':
            return `Die(${die.sides})`;
        case 'ModDie':
            return `ModDie(${die.sides}, ${die.modifier})`;
        case 'WeightedDie':
            return `WeightedDie(${weightsToBuildString(die.weights)})`;
        case 'ModWeightedDie':
            return `ModWeightedDie(${weightsToBuildString(die.weights)}, ${die.modifier})`;
    }
}

/**
 * @param {number[]} weights weights[i] is the weight of face i + 1
 * @returns {string} faces with weight 0 are left out
 */
function weightsToBuildString(weights) {
    const entries = weights.flatMap((weight, index) => weight > 0 ? [`${index + 1}: ${weight}`] : []);
    return `{${entries.join(', ')}}`;
}

/**
 * @param {BuilderPart} part
 * @returns {string | null} null when the count or a box the wrapper uses breaks its limit
 */
function partToBuildString(part) {
    const count = part.getCount();
    const wrapped = wrappedDieToBuildString(part);
    if (count === null || wrapped === null) {
        return null;
    }
    return count === 1 ? wrapped : `${count}*${wrapped}`;
}

/**
 * @param {BuilderPart} part
 * @returns {string | null}
 */
function wrappedDieToBuildString(part) {
    const die = dieToBuildString(part.die);
    switch (part.wrapper) {
        case 'none':
            return die;
        case 'exploding':
            return `Exploding(${die})`;
        case 'strong': {
            const multiplier = part.getMultiplier();
            return multiplier === null ? null : `StrongDie(${die}, ${multiplier})`;
        }
        case 'best':
        case 'worst': {
            const poolSize = part.getPoolSize();
            const keep = part.getKeep();
            if (poolSize === null || keep === null) {
                return null;
            }
            const pool = part.wrapper === 'best' ? 'BestOfDicePool' : 'WorstOfDicePool';
            return `${pool}(DicePool(${die}, ${poolSize}), ${keep})`;
        }
    }
}
