/**
 * @param {string} buildString
 * @returns {Promise<DiceTable>}
 */
async function fetchDiceTable(buildString) {
    let response;
    try {
        // a plain-text body keeps this a "simple" cross-origin request (no preflight)
        response = await fetch(getLambdaEndpoint(), {
            method: 'POST',
            body: JSON.stringify({buildString}),
        });
    } catch (error) {
        throw new Error(`Could not reach the dice server at ${getLambdaEndpoint()}.`, {cause: error});
    }
    const body = await parseJsonOrNull(response);
    if (!response.ok) {
        const serverError = /** @type {{errorType?: string, errorMessage?: string} | null} */ (body);
        if (serverError && serverError.errorMessage) {
            throw new Error(serverError.errorType
                ? `${serverError.errorType}: ${serverError.errorMessage}`
                : serverError.errorMessage);
        }
        throw new Error(`The dice server answered ${response.status} ${response.statusText}.`);
    }
    if (body === null) {
        throw new Error('The dice server sent a response that was not JSON.');
    }
    return parseDiceTable(body);
}

/**
 * @param {Response} response
 * @returns {Promise<unknown>}
 */
async function parseJsonOrNull(response) {
    try {
        return await response.json();
    } catch {
        return null;
    }
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
