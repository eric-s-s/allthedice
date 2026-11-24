/**
 * @param {number} low
 * @param {number} high
 */
function getEveryRollFrom(low, high) {
    const start = Math.min(low, high);
    const stop = Math.max(low, high);
    /** @type {number[]} */
    const rolls = [];
    for (let roll = start; roll <= stop; roll++) {
        rolls.push(roll);
    }
    return rolls;
}

/**
 * @param {SciNumEntry[]} rollMantissaExponentObjects
 * @param {number[]} rollsQueryArray
 */
function getStats(rollMantissaExponentObjects, rollsQueryArray) {
    const sciNumObj = createSciNumObj(rollMantissaExponentObjects);
    return getStatsFromSciNumObj(sciNumObj, rollsQueryArray)
}

/**
 * @param {SciNumEntry[]} rollMantissaExponentObjects
 * @returns {Record<string, SciNum>} each roll's count, and the "total"
 */
function createSciNumObj(rollMantissaExponentObjects) {
    /** @type {Record<string, SciNum>} */
    const outObj = {};
    /** @type {SciNum[]} */
    const forTotal = [];
    rollMantissaExponentObjects.forEach((element) => {
        const number = new SciNum(element.mantissa, element.exponent);
        outObj[element.roll] = number;
        forTotal.push(number);
    });

    outObj["total"] = sumSciNum(forTotal);

    return outObj;
}

/**
 * @param {Record<string, SciNum>} sciNumObj
 * @param {number[]} rollsQueryArray
 */
function getStatsFromSciNumObj(sciNumObj, rollsQueryArray) {
    const sciNumArr = rollsQueryArray.map(function (roll) {
        return getSciNumValue(sciNumObj, roll);
    });
    return createStatsObj(sciNumObj.total, sciNumArr);
}

/**
 * @param {Record<string, SciNum>} obj
 * @param {number} key
 */
function getSciNumValue(obj, key) {
    return Object.hasOwn(obj, key) ? obj[key] : new SciNum(0, 0);
}

/**
 * @param {SciNum} total
 * @param {SciNum[]} sciNumArr
 */
function createStatsObj(total, sciNumArr) {
    const statsObj = {};
    const arrSum = sumSciNum(sciNumArr);
    statsObj.occurrences = arrSum.toFancyStr();
    statsObj.oneInChance = total.div(arrSum).toFancyStr();
    const pct = arrSum.div(total).mul(new SciNum(1, 2));
    statsObj.pctChance = pct.toFancyStr();
    statsObj.total = total.toFancyStr();
    return statsObj;
}

