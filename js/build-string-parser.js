// Reads build strings back into a DiceBuilder, so the builder can open on a row's text. It reads exactly what
// DiceBuilder.toBuildString writes (see specs/dice-builder.html), and needs dice-builder.js loaded first.

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
     * @returns {number} the whole number, after stepping past it
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

    /** @returns {string} the name, after stepping past it */
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
