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
 * @property {string} replacedText the row's text when it could not be parsed; '' otherwise
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

/** the poolings the builder writes, by their build string name */
const builderPools = /** @type {const} */ ({BestOfDicePool: 'best', WorstOfDicePool: 'worst'});

/**
 * Reads the build strings the builder writes (see specs/dice-builder.html), with any whitespace between tokens and
 * an optional 1*.
 * @param {string} text
 * @returns {DiceBuilder | null} an empty builder for blank text, and null for text the builder can't show
 */
function parseBuildString(text) {
    const builder = new DiceBuilder();
    const tokens = tokenizeBuildString(text);
    if (tokens === null) {
        return null;
    }
    if (tokens.length === 0) {
        return builder;
    }
    const reader = new TokenReader(tokens);
    try {
        do {
            if (reader.accept('Modifier')) {
                reader.expect('(');
                builder.modifierInput = String(reader.readWholeNumber());
                reader.expect(')');
                break;
            }
            builder.parts.push(readPart(reader));
        } while (reader.accept('&'));
        reader.expectEnd();
    } catch (error) {
        if (error instanceof BuildStringSyntaxError) {
            return null;
        }
        throw error;
    }
    return builder;
}

/**
 * @param {string} text
 * @returns {string[] | null} null when the text holds a character no token starts with
 */
function tokenizeBuildString(text) {
    const tokenPattern = /\s*(-?[0-9]+|[A-Za-z]+|[(){},:*&])\s*/y;
    /** @type {string[]} */
    const tokens = [];
    const end = text.trimEnd().length;
    while (tokenPattern.lastIndex < end) {
        const match = tokenPattern.exec(text);
        if (match === null) {
            return null;
        }
        tokens.push(match[1]);
    }
    return tokens;
}

class BuildStringSyntaxError extends Error {}

class TokenReader {
    /** @param {string[]} tokens */
    constructor(tokens) {
        this.tokens = tokens;
        this.index = 0;
    }

    /** @param {string} token */
    accept(token) {
        if (this.tokens[this.index] !== token) {
            return false;
        }
        this.index++;
        return true;
    }

    /** @param {string} token */
    expect(token) {
        if (!this.accept(token)) {
            throw new BuildStringSyntaxError(`expected ${token}`);
        }
    }

    nextIsWholeNumber() {
        return /^-?[0-9]+$/.test(this.tokens[this.index] ?? '');
    }

    /**
     * @param {number} [min]
     * @param {number} [max]
     */
    readWholeNumber(min = -Infinity, max = Infinity) {
        if (!this.nextIsWholeNumber()) {
            throw new BuildStringSyntaxError('expected a whole number');
        }
        const number = parseInt(this.tokens[this.index], 10);
        if (number < min || number > max) {
            throw new BuildStringSyntaxError(`expected ${min} to ${max}`);
        }
        this.index++;
        return number;
    }

    readName() {
        const name = this.tokens[this.index] ?? '';
        if (!/^[A-Za-z]+$/.test(name)) {
            throw new BuildStringSyntaxError('expected a name');
        }
        this.index++;
        return name;
    }

    expectEnd() {
        if (this.index !== this.tokens.length) {
            throw new BuildStringSyntaxError('expected the end');
        }
    }
}

/**
 * @param {TokenReader} reader
 * @returns {BuilderPart}
 */
function readPart(reader) {
    let count = 1;
    if (reader.nextIsWholeNumber()) {
        count = reader.readWholeNumber(1);
        reader.expect('*');
    }
    const part = readWrappedDie(reader);
    part.countInput = String(count);
    return part;
}

/**
 * @param {TokenReader} reader
 * @returns {BuilderPart}
 */
function readWrappedDie(reader) {
    if (reader.accept('Exploding')) {
        reader.expect('(');
        const part = new BuilderPart(readDie(reader));
        reader.expect(')');
        part.wrapper = 'exploding';
        return part;
    }
    if (reader.accept('StrongDie')) {
        reader.expect('(');
        const part = new BuilderPart(readDie(reader));
        reader.expect(',');
        part.multiplierInput = String(reader.readWholeNumber(1));
        reader.expect(')');
        part.wrapper = 'strong';
        return part;
    }
    for (const [name, wrapper] of Object.entries(builderPools)) {
        if (reader.accept(name)) {
            reader.expect('(');
            reader.expect('DicePool');
            reader.expect('(');
            const part = new BuilderPart(readDie(reader));
            reader.expect(',');
            const poolSize = reader.readWholeNumber(1);
            reader.expect(')');
            reader.expect(',');
            const keep = reader.readWholeNumber(1, poolSize);
            reader.expect(')');
            part.wrapper = wrapper;
            part.poolSizeInput = String(poolSize);
            part.keepInput = String(keep);
            return part;
        }
    }
    return new BuilderPart(readDie(reader));
}

/**
 * @param {TokenReader} reader
 * @returns {BuilderDie}
 */
function readDie(reader) {
    const name = reader.readName();
    reader.expect('(');
    /** @type {BuilderDie} */
    let die;
    if (name === 'Die') {
        die = {kind: 'Die', sides: reader.readWholeNumber(1)};
    } else if (name === 'ModDie') {
        const sides = reader.readWholeNumber(1);
        reader.expect(',');
        die = {kind: 'ModDie', sides, modifier: reader.readWholeNumber()};
    } else if (name === 'WeightedDie') {
        die = {kind: 'WeightedDie', weights: readWeights(reader)};
    } else if (name === 'ModWeightedDie') {
        const weights = readWeights(reader);
        reader.expect(',');
        die = {kind: 'ModWeightedDie', weights, modifier: reader.readWholeNumber()};
    } else {
        throw new BuildStringSyntaxError(`the builder has no ${name}`);
    }
    reader.expect(')');
    return die;
}

/**
 * @param {TokenReader} reader
 * @returns {number[]} weights[i] is the weight of face i + 1, with 0 for faces the text leaves out
 */
function readWeights(reader) {
    reader.expect('{');
    /** @type {Map<number, number>} */
    const weightsByFace = new Map();
    do {
        const face = reader.readWholeNumber(1, maxWeightedSides);
        reader.expect(':');
        if (weightsByFace.has(face)) {
            throw new BuildStringSyntaxError(`face ${face} is weighted twice`);
        }
        weightsByFace.set(face, reader.readWholeNumber(0));
    } while (reader.accept(','));
    reader.expect('}');
    const weights = Array.from({length: Math.max(...weightsByFace.keys())}, (_, index) =>
        weightsByFace.get(index + 1) ?? 0);
    if (!weights.some(weight => weight > 0)) {
        throw new BuildStringSyntaxError('every weight is 0');
    }
    return weights;
}
