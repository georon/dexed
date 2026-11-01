const aesjs = require('aes-js')
const pbkdf2 = require('pbkdf2')

const SUFFIX = '.enc'
const { isEncPath } = require('./edit.js')

const keyFor = (password) => pbkdf2.pbkdf2Sync(password, 'saltmangotree', 1, 256 / 8, 'sha512')

// AES-256-CTR, as in the aes-js example: the same call encrypts and decrypts.
function encrypt(text, password) {
  const ctr = new aesjs.ModeOfOperation.ctr(keyFor(password), new aesjs.Counter(5))
  return Buffer.from(ctr.encrypt(aesjs.utils.utf8.toBytes(text)))
}

// CTR has no integrity check, so a wrong password shows up as invalid UTF-8 (or NUL bytes).
function decrypt(buf, password) {
  const ctr = new aesjs.ModeOfOperation.ctr(keyFor(password), new aesjs.Counter(5))
  const bytes = Buffer.from(ctr.decrypt(new Uint8Array(buf)))
  if (bytes.includes(0)) return null
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}

module.exports = { SUFFIX, encrypt, decrypt }
