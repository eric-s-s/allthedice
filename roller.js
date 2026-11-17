// Rolls a dice collection using the alias table the lambda sends (Vose's alias method):
// pick a column uniformly, then pick a height in that column uniformly; below the
// column's primaryHeight is the primary roll, otherwise the alternate.
// Heights are BigInt, so tables with more than 2^53 combinations stay exact.
class Roller {
    constructor(height, aliases, randBetween = randomBigIntBetween) {
        this.height = BigInt(height);
        this.aliases = aliases.map(alias => ({
            primary: alias.primary,
            alternate: alias.alternate,
            primaryHeight: BigInt(alias.primaryHeight),
        }));
        this.randBetween = randBetween;
    }

    roll() {
        const column = Number(this.randBetween(0n, BigInt(this.aliases.length - 1)));
        const alias = this.aliases[column];
        const height = this.randBetween(0n, this.height - 1n);
        return height < alias.primaryHeight ? alias.primary : alias.alternate;
    }
}

// A uniformly random BigInt from low to high inclusive, in either order.
function randomBigIntBetween(low, high) {
    let start = BigInt(low);
    let stop = BigInt(high);
    if (start > stop) {
        [start, stop] = [stop, start];
    }
    return start + randomBigIntBelow(stop - start + 1n);
}

// A uniformly random BigInt from 0 to limit - 1, from crypto.getRandomValues.
// Draws just enough random bits to cover the range and draws again whenever the result
// is too big (rejection sampling), so every value is equally likely. Each draw succeeds
// with probability over 1/2.
function randomBigIntBelow(limit) {
    if (limit <= 0n) {
        throw new RangeError('limit must be positive, got ' + limit);
    }
    const bitLength = (limit - 1n).toString(2).length;
    const bytes = new Uint8Array(Math.ceil(bitLength / 8));
    const extraBits = BigInt(bytes.length * 8 - bitLength);
    while (true) {
        crypto.getRandomValues(bytes);
        let value = 0n;
        for (const byte of bytes) {
            value = (value << 8n) | BigInt(byte);
        }
        value >>= extraBits;
        if (value < limit) {
            return value;
        }
    }
}
