class SciNum {
    /**
     * @param {number | string} mantissa
     * @param {number | string} power
     */
    constructor(mantissa, power) {
        this.mantissa = parseFloat(String(mantissa));
        this.power = (this.mantissa === 0 || this.mantissa === Infinity || this.mantissa === -Infinity) ?
            0 : parseFloat(String(power));
        this.sigFigs = 4;
    }

    /** @param {SciNum} other */
    div(other) {
        let newMantissa = this.mantissa / other.mantissa;
        let newPow = this.power - other.power;
        if (Math.abs(newMantissa) < 1) {
            newMantissa *= 10;
            newPow -= 1;
        }
        return new SciNum(newMantissa, newPow);
    }

    /** @param {SciNum} other */
    mul(other) {
        let newMantissa = this.mantissa * other.mantissa;
        let newPow = this.power + other.power;
        if (Math.abs(newMantissa) >= 10) {
            newMantissa /= 10;
            newPow += 1;
        }
        return new SciNum(newMantissa, newPow);
    }

    toString() {
        return this.mantissa.toString() + "e" + toSignedStr(this.power);
    }

    toNum() {
        return parseFloat(this.toString());
    }

    toFancyStr() {
        const commaedCutOff = 5;
        const fixedCutoff = -3;

        if (this.mantissa === 0) {
            return this.mantissa.toFixed(this.sigFigs - 1);
        }

        if (this.mantissa === Infinity || this.mantissa === -Infinity) {
            const base = '∞';
            return (this.mantissa > 0) ? '+' + base : '-' + base;
        }

        if (this.power <= commaedCutOff && this.power >= 0) {
            const sigFigs = Math.max(this.sigFigs, this.power + 1);
            const answer = this.toNum().toLocaleString(
                'en-US', {maximumSignificantDigits: sigFigs, minimumSignificantDigits: sigFigs}
            );
            const lenLimit = commaedCutOff + Math.floor(sigFigs / 3);
            const intLen = answer.split(".")[0].length;
            return (intLen > lenLimit) ? this.toScientificStr() : answer;
        }
        if (this.power >= fixedCutoff && this.power < 0) {
            return this.toNum().toPrecision(this.sigFigs);
        }
        return this.toScientificStr();
    }

    toScientificStr() {
        let manStr = this.mantissa.toFixed(this.sigFigs - 1);
        let powToUse = this.power;
        if (manStr.indexOf("10.") === 0) {
            manStr = manStr.replace("10.", "1.");
            powToUse += 1;
        }
        return manStr + "e" + toSignedStr(powToUse);
    }
}

/** @param {number} num */
function toSignedStr(num) {
    return (num < 0 ? "" : "+") + num;
}

/** @param {SciNum[]} sciNumArray */
function sumSciNum(sciNumArray) {
    let maxPow = maxPower(sciNumArray);
    const maxPowerDiff = 15;
    let newMantissa = 0;
    sciNumArray.forEach(function (theNum) {
        const powerDiff = maxPow - theNum.power;
        if (powerDiff <= maxPowerDiff) {
            newMantissa += theNum.mantissa * Math.pow(10, -powerDiff);
        }
    });

    while (Math.abs(newMantissa) < 1 && newMantissa !== 0) {
        newMantissa *= 10;
        maxPow -= 1;
    }
    while (Math.abs(newMantissa) >= 10) {
        newMantissa /= 10;
        maxPow += 1;
    }
    return new SciNum(newMantissa, maxPow);
}

/** @param {SciNum[]} sciNumArray */
function maxPower(sciNumArray) {
    return Math.max(...sciNumArray.map(el => el.power));
}
