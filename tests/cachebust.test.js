const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');

function getLocalAssetLinks() {
    const links = [...indexHtml.matchAll(/(?:src|href)="([^"]+\.(?:js|css)(?:\?[^"]*)?)"/g)].map(match => match[1]);
    return links.filter(link => !/^[a-z]+:\/\//i.test(link));
}

function getContentHash(fileName) {
    return crypto.createHash('sha256').update(fs.readFileSync(path.join(repoRoot, fileName))).digest('hex').slice(0, 8);
}

test('index.html links local scripts and styles', () => {
    assert.ok(getLocalAssetLinks().length > 0);
});

for (const link of getLocalAssetLinks()) {
    const [fileName] = link.split('?');
    test(`${fileName} is linked with its current content hash (run "make cache-bust" if this fails)`, () => {
        assert.strictEqual(link, `${fileName}?v=${getContentHash(fileName)}`);
    });
}
