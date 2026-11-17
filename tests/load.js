const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadScripts(fileNames, names) {
    for (const fileName of fileNames) {
        const filePath = path.join(__dirname, '..', fileName);
        vm.runInThisContext(fs.readFileSync(filePath, 'utf8'), {filename: filePath});
    }
    return vm.runInThisContext(`({${names.join(', ')}})`);
}

module.exports = {loadScripts};
