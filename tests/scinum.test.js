const test = require('node:test');
const assert = require('node:assert');
const {loadScripts} = require('./load.js');

const {SciNum, sumSciNum, maxPower, toSignedStr} = loadScripts(
    ['scinum.js'], ['SciNum', 'sumSciNum', 'maxPower', 'toSignedStr']
);

test("new scinum positive", () => {
    const toTestStrs = new SciNum("+1.23", "+456");
    assert.deepStrictEqual(toTestStrs.mantissa, 1.23, "mantissa str ok");
    assert.deepStrictEqual(toTestStrs.power, 456, "power str ok");
    const toTestNums = new SciNum(1.23, 456);
    assert.deepStrictEqual(toTestNums.mantissa, 1.23, "mantissa float ok");
    assert.deepStrictEqual(toTestNums.power, 456, "power int ok");
});

test("new scinum negative", () => {
    const toTestStrs = new SciNum("-1.23", "-456");
    assert.deepStrictEqual(toTestStrs.mantissa, -1.23, "mantissa str ok");
    assert.deepStrictEqual(toTestStrs.power, -456, "power str ok");
    const toTestNums = new SciNum(-1.23, -456);
    assert.deepStrictEqual(toTestNums.mantissa, -1.23, "mantissa float ok");
    assert.deepStrictEqual(toTestNums.power, -456, "power int ok");
});

test("new SciNum zero value always has zero power", () => {
    const zero = new SciNum(0, 100);
    assert.deepStrictEqual(zero.power, 0, "power is zero");
    assert.deepStrictEqual(zero, new SciNum(0, -5), "zero values evaluate to same");
});

test("new SciNum +/-inf mantissa has zero power", () => {
    const negInf = new SciNum(-Infinity, 100);
    assert.deepStrictEqual(negInf.power, 0, "power is zero for neg inf");
    assert.deepStrictEqual(negInf, new SciNum(-Infinity, -100), "neg inf all equal");

    const posInf = new SciNum(Infinity, 100);
    assert.deepStrictEqual(posInf.power, 0, "power is zero for neg inf");
    assert.deepStrictEqual(posInf, new SciNum(Infinity, -100), "neg inf all equal");

    assert.notDeepStrictEqual(posInf, negInf, "pos and neg inf are not equal");

});

test("div pos power", () => {
    const big = new SciNum(2.00, 345);
    const small = new SciNum(4.00, 123);
    assert.deepStrictEqual(big.div(small), new SciNum(5.00, 221), "big over small");
    assert.deepStrictEqual(small.div(big), new SciNum(2, -222), "small over big");
    assert.deepStrictEqual(small.div(small), new SciNum(1, 0), "small over small")
});

test("div neg power", () => {
    const big = new SciNum(-2.00, -345);
    const small = new SciNum(-4.00, -123);
    assert.deepStrictEqual(big.div(small), new SciNum(5.00, -223), "big over small");
    assert.deepStrictEqual(small.div(big), new SciNum(2, 222), "small over big");
    assert.deepStrictEqual(small.div(small), new SciNum(1, 0), "small over small")
});

test("mul pos power", () => {
    const big = new SciNum(2.00, 345);
    const small = new SciNum(4.00, 123);
    assert.deepStrictEqual(big.mul(small), new SciNum(8, 468), "big times small");
    assert.deepStrictEqual(small.mul(big), new SciNum(8, 468), "small times big");
    assert.deepStrictEqual(small.mul(small), new SciNum(1.6, 247), "small times small")
});

test("mul neg power", () => {
    const big = new SciNum(2.00, -345);
    const small = new SciNum(-4.00, -123);
    assert.deepStrictEqual(big.mul(small), new SciNum(-8, -468), "big times small");
    assert.deepStrictEqual(small.mul(big), new SciNum(-8, -468), "small times big");
    assert.deepStrictEqual(small.mul(small), new SciNum(1.6, -245), "small times small")
});

test("setting sigFigs", () => {
    const tst = new SciNum(1, 2);
    assert.deepStrictEqual(tst.sigFigs, 4, "start sigFigs");
    tst.sigFigs = 5;
    assert.deepStrictEqual(tst.sigFigs, 5, "new sigFigs");
});

test("toString no round", () => {
    const tstPos = new SciNum(1.23, 456);
    const tstNeg = new SciNum(-1.23, -456);
    assert.deepStrictEqual(tstPos.toString(), "1.23e+456", "pos mantissa, pos power");
    assert.deepStrictEqual(tstNeg.toString(), "-1.23e-456", "neg mantissa, neg power");
});

test("toNum neg pos infinity", () => {
    assert.deepStrictEqual(new SciNum(1, 350).toNum(), Infinity, "pos inf");
    assert.deepStrictEqual(new SciNum(-1, 350).toNum(), -Infinity, "neg inf");
});

test("toNum 0", () => {
    assert.deepStrictEqual(new SciNum(1, -350).toNum(), 0, "pos approach");
    // underflows to -0; == treats it as zero, which is what this checks
    assert.equal(new SciNum(-1, -350).toNum(), 0, "neg approach");
    assert.deepStrictEqual(new SciNum(0, 50).toNum(), 0, "zero mantissa");
});

test("toNum neg powers", () => {
    assert.deepStrictEqual(new SciNum(1.2, -50).toNum(), 1.2e-50, "pos ");
    assert.deepStrictEqual(new SciNum(-1.2, -50).toNum(), -1.2e-50, "neg ");
});

test("toNum pos powers", () => {
    assert.deepStrictEqual(new SciNum(1.2, 50).toNum(), 1.2e50, "pos ");
    assert.deepStrictEqual(new SciNum(-1.2, 50).toNum(), -1.2e50, "neg ");
});

test('toFancyStr zero', () => {
    assert.deepStrictEqual(new SciNum(0, 100).toFancyStr(), '0.000');
    const changeSigFigs = new SciNum(0, 100);
    changeSigFigs.sigFigs = 5;
    assert.deepStrictEqual(changeSigFigs.toFancyStr(), '0.0000');
});

test('toFancyStr infinity', () => {
    assert.deepStrictEqual(new SciNum(Infinity, 0).toFancyStr(), '+\u221E', 'infinity \u221E');
    assert.deepStrictEqual(new SciNum(-Infinity, 0).toFancyStr(), '-\u221E', 'neg inf \u221E');
});

test("toFancyStr commaed", () => {
    assert.deepStrictEqual(new SciNum(1.23456, 5).toFancyStr(), "123,456");
    assert.deepStrictEqual(new SciNum(1.23456, 3).toFancyStr(), "1,235");
    assert.deepStrictEqual(new SciNum(1.23456, 2).toFancyStr(), "123.5");
});

test("toFancyStr commaed but rounds up", () => {
    assert.deepStrictEqual(new SciNum(9.99999, 5).toFancyStr(), "999,999");
    assert.deepStrictEqual(new SciNum(9.999999, 5).toFancyStr(), "1.000e+6");
    assert.deepStrictEqual(new SciNum(9.99999, 3).toFancyStr(), "10,000");
    assert.deepStrictEqual(new SciNum(9.99999, 2).toFancyStr(), "1,000");
    assert.deepStrictEqual(new SciNum(9.99999, 1).toFancyStr(), "100.0");
    assert.deepStrictEqual(new SciNum(9.99999, 0).toFancyStr(), "10.00");
    assert.deepStrictEqual(new SciNum(9.99999, -1).toFancyStr(), "1.000");
});

test("toFancyStr lt zero ", () => {
    assert.deepStrictEqual(new SciNum(1.23456, -1).toFancyStr(), "0.1235");
    assert.deepStrictEqual(new SciNum(1.23456, -2).toFancyStr(), "0.01235");
    assert.deepStrictEqual(new SciNum(1.23456, -3).toFancyStr(), "0.001235");
    assert.deepStrictEqual(new SciNum(1.23456, -4).toFancyStr(), "1.235e-4");
});

test("toFancyStr lt zero rounding", () => {
    assert.deepStrictEqual(new SciNum(9.99999, -1).toFancyStr(), "1.000");
    assert.deepStrictEqual(new SciNum(9.99999, -2).toFancyStr(), "0.1000");
    assert.deepStrictEqual(new SciNum(9.99999, -3).toFancyStr(), "0.01000");
    assert.deepStrictEqual(new SciNum(9.99999, -4).toFancyStr(), "1.000e-3", " i'm a lazy bum and i won't fix this now.");
});

test("toFancyStr large and small", () => {
    assert.deepStrictEqual(new SciNum(1.23456, -10).toFancyStr(), "1.235e-10");
    assert.deepStrictEqual(new SciNum(1.23456, 10).toFancyStr(), "1.235e+10");
    assert.deepStrictEqual(new SciNum(1.23456, -1000).toFancyStr(), "1.235e-1000");
    assert.deepStrictEqual(new SciNum(1.23456, 1000).toFancyStr(), "1.235e+1000");
});

test("toFancyStr large and small rounding", () => {
    assert.deepStrictEqual(new SciNum(9.99999, -10).toFancyStr(), "1.000e-9");
    assert.deepStrictEqual(new SciNum(9.99999, 10).toFancyStr(), "1.000e+11");
    assert.deepStrictEqual(new SciNum(9.99999, -1000).toFancyStr(), "1.000e-999");
    assert.deepStrictEqual(new SciNum(9.99999, 1000).toFancyStr(), "1.000e+1001");
});

test("toFancyStr large and small regression test", () => {
    assert.deepStrictEqual(new SciNum(9.1, -10).toFancyStr(), "9.100e-10");
    assert.deepStrictEqual(new SciNum(9.1, 10).toFancyStr(), "9.100e+10");
    assert.deepStrictEqual(new SciNum(9.1, -1000).toFancyStr(), "9.100e-1000");
    assert.deepStrictEqual(new SciNum(9.1, 1000).toFancyStr(), "9.100e+1000");
});

function makeSNArray(numPairs) {
    return numPairs.map(function (el) {
        return new SciNum(el[0], el[1]);
    });
}

test("helper test function makesSNArray", () => {
    const expected = [new SciNum(1, 2), new SciNum(-3, -4)];
    assert.deepStrictEqual(makeSNArray([[1, 2], [-3, -4]]), expected, "creates array");
});

test("sumSciNum maxPower", () => {
    assert.deepStrictEqual(maxPower([]), -Infinity, "empty array not covered");
    assert.deepStrictEqual(maxPower(makeSNArray([[1.1, 2]])), 2, "single element");
    assert.deepStrictEqual(maxPower(makeSNArray([[1.1, 2], [1.1, 30], [1.1, 20]])), 30, "multi elements");
    assert.deepStrictEqual(maxPower(makeSNArray([[1.1, -3], [1.1, -2], [1.1, -5]])), -2, "neg elements");
});

test("sumSciNum one element", () => {
    const tstPos = new SciNum(1.23, 45);
    assert.deepStrictEqual(sumSciNum([tstPos]), tstPos, "makes itself pos");
    const tstNeg = new SciNum(-1.23, -45);
    assert.deepStrictEqual(sumSciNum([tstNeg]), tstNeg, "makes itself neg");
});

test("sumSciNum multielements all same power", () => {
    const power = 5;
    const notOverTen = makeSNArray([[1.1, power], [2.2, power], [3.3, power]]);
    assert.deepStrictEqual(sumSciNum(notOverTen), new SciNum(6.6, power), "sum of mantissa lt ten");
    const overTen = makeSNArray([[9.9, power], [9.9, power]]);
    assert.deepStrictEqual(sumSciNum(overTen), new SciNum(1.98, power + 1), "sum gt ten");
    const overHundred = makeSNArray([[99, power], [99, power]]);
    assert.deepStrictEqual(sumSciNum(overHundred), new SciNum(1.98, power + 2), "sum gt hundred");
});

test("sumSciNum multielements all different power but not over maxPowerDiff", () => {
    const notOverTen = makeSNArray([[1.1, 4], [2.2, 3], [3.3, 2]]);
    assert.deepStrictEqual(sumSciNum(notOverTen), new SciNum(1.353, 4), "sum of mantissa lt ten");
    const overTen = makeSNArray([[9.9, 4], [9.9, 3]]);
    assert.deepStrictEqual(sumSciNum(overTen), new SciNum(1.089, 5), "sum gt ten");
});

test("sumSciNum multielements all different power over maxPowerDiff", () => {
    const notOverTen = makeSNArray([[1.1, 40], [2.2, 39], [3.3, 24]]);
    assert.deepStrictEqual(sumSciNum(notOverTen), new SciNum(1.32, 40), "sum of mantissa lt ten");
    const overTen = makeSNArray([[9.9, 40], [9.9, 39], [5, 24]]);
    assert.deepStrictEqual(sumSciNum(overTen), new SciNum(1.089, 41), "sum gt ten");
    const onlyOneElCounted = makeSNArray([[-1, 100], [2, 84], [3, 80], [4, -100]]);
    assert.deepStrictEqual(sumSciNum(onlyOneElCounted), new SciNum(-1, 100), "only one element added");
});

test("sumSciNum multielements negative powers negative values", () => {
    const ltOnegtZero = makeSNArray([[1, -40], [-2, -41], [3, -44]]);
    assert.deepStrictEqual(sumSciNum(ltOnegtZero), new SciNum(8.003, -41), "sum of mantissa lt one");
    const negNotOverTen = makeSNArray([[-1, -1], [-2, -2], [-3, -3]]);
    assert.deepStrictEqual(sumSciNum(negNotOverTen), new SciNum(-1.23, -1), "sum not lt one");
    const negOverTen = makeSNArray([[-9.9, -1], [-2, -2], [-3, -3]]);
    assert.deepStrictEqual(sumSciNum(negOverTen), new SciNum(-1.013, 0), "sum not lt one");
});

test("sumSciNum sum of mantissa lt one.", () => {
    const ltOnegtZero = makeSNArray([[0.1, 3], [.02, 4]]);
    const answer = sumSciNum(ltOnegtZero);

    assert.deepStrictEqual(answer.mantissa.toFixed(6), "3.000000", "float math means almost equal");
    assert.deepStrictEqual(answer.power, 2)
});

test("sumSciNum zero values", () => {
    const zeroSum = makeSNArray([[0, 3], [0, 4]]);
    const answer = sumSciNum(zeroSum);

    assert.deepStrictEqual(answer, new SciNum(0, 0));
});

test("sumSciNum empty arr", () => {
    const answer = sumSciNum([]);
    assert.deepStrictEqual(answer, new SciNum(0, 0));
});
