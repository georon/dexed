const test = require('node:test')
const assert = require('node:assert')
const { encrypt, decrypt } = require('../lib/crypt.js')
const { isEncPath, modeForPath } = require('../lib/edit.js')

test('round trip', () => {
  const enc = encrypt('héllo wörld, any length', 'pw')
  assert.notStrictEqual(enc.toString('utf8'), 'héllo wörld, any length')
  assert.strictEqual(decrypt(enc, 'pw'), 'héllo wörld, any length')
})

test('wrong password is detected', () => {
  assert.strictEqual(decrypt(encrypt('héllo wörld, this is some text', 'pw'), 'nope'), null)
})

test('isEncPath', () => {
  assert.ok(isEncPath('/a/b.txt.enc'))
  assert.ok(!isEncPath('/a/b.txt'))
})

test('file type comes from the name before .enc', () => {
  assert.strictEqual(modeForPath('a.md.enc'), 'markdown')
  assert.strictEqual(modeForPath('a.htm.enc'), 'rich')
  assert.strictEqual(modeForPath('a.txt.enc'), 'text')
})
