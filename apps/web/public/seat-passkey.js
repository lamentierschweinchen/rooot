/*
 * ROOOT — SEAT passkey: WebAuthn PRF -> deterministic ed25519 pubkey (browser wallet ceremony).
 *
 * Pure derivation (keyFromPrf, Task 9) + the browser ceremony (supportsPrf/passkeyClaim, Task 10).
 * Dual-mode file: require()'d directly in the Node test (scripts/_seat-passkey-test.mjs);
 * loaded as a plain <script> global in the browser.
 *
 * BROWSER LOAD ORDER: any page that uses window.seatPasskey MUST load plate/nacl.min.js
 * (a straight copy of node_modules/tweetnacl/nacl.min.js — it sets window.nacl) via a
 * <script> tag BEFORE this file. There is no bs58 in the browser: bs58 has no browser/UMD
 * build, so base58 is inlined below (b58encode) and used in BOTH Node and the browser; it
 * is cross-checked against bs58.encode in the Node test (scripts/_seat-passkey-test.mjs).
 *
 * NEVER store or log the derived seed/secret. Only the WebAuthn credential id (localStorage)
 * and the derived pubkey may be persisted or returned.
 */
(function (root) {
  'use strict';
  var nacl = (typeof require !== 'undefined') ? require('tweetnacl') : root.nacl;

  // ---- base58 (bitcoin/Solana alphabet), inlined ----
  // Ported from the same big-endian byte-array algorithm bs58/base-x uses (NOT a from-scratch
  // little-endian digit accumulator), specifically so the leading-zero-byte -> leading-'1'
  // handling matches bs58 exactly, including the all-zero-input edge case where a naive
  // digit accumulator tends to emit one spurious extra character. Cross-checked against
  // bs58.encode for fixed vectors (incl. leading zeros) in scripts/_seat-passkey-test.mjs.
  var B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  function b58encode(bytes) {
    var n = bytes.length;
    if (n === 0) return '';
    var zeros = 0;
    while (zeros < n && bytes[zeros] === 0) zeros++;
    var size = (((n - zeros) * 138 / 100) | 0) + 1; // log(256)/log(58) ~= 1.365; 138/100 is a safe upper bound
    var digits = new Uint8Array(size);
    var length = 0;
    for (var i = zeros; i < n; i++) {
      var carry = bytes[i];
      var j = 0;
      for (var k = size - 1; (carry !== 0 || j < length) && k >= 0; k--, j++) {
        carry += 256 * digits[k];
        digits[k] = carry % 58;
        carry = (carry / 58) | 0;
      }
      length = j;
    }
    var it = size - length;
    while (it < size && digits[it] === 0) it++;
    var out = '';
    for (var z = 0; z < zeros; z++) out += B58_ALPHABET[0];
    for (; it < size; it++) out += B58_ALPHABET[digits[it]];
    return out;
  }

  // ---- pure derivation (Task 9; unchanged other than bs58 -> b58encode) ----
  function keyFromPrf(prfBytes) {
    var seed = prfBytes.slice(0, 32);
    var kp = nacl.sign.keyPair.fromSeed(seed);
    return { pubkey: b58encode(kp.publicKey), secret: kp.secretKey };
  }
  root.keyFromPrf = keyFromPrf;

  // ---- WebAuthn PRF ceremony (Task 10) ----

  // Fixed app-scoped salt fed to extensions.prf.eval.first. Not a secret (it is sent to the
  // authenticator in the clear) -- it exists purely for domain separation, so ROOOT's derived
  // key differs from whatever any other site would derive from the same passkey/authenticator.
  // MUST stay stable forever: changing it re-derives a DIFFERENT key for every existing holder.
  var APP_SALT = (function () {
    var label = 'rooot.seat.prf.v1';
    var s = new Uint8Array(32); // right-padded with zero bytes; truncated if label > 32 bytes (it is not, at 17)
    for (var i = 0; i < label.length && i < s.length; i++) s[i] = label.charCodeAt(i);
    return s;
  })();

  var CRED_ID_KEY = 'rooot.seat.credId';

  function bytesToB64(bytes) {
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  function b64ToBytes(b64) {
    var bin = atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function storedCredId() {
    try { return localStorage.getItem(CRED_ID_KEY); } catch (_) { return null; }
  }
  function storeCredId(b64) {
    try { localStorage.setItem(CRED_ID_KEY, b64); } catch (_) {}
  }
  function randomChallenge() {
    var c = new Uint8Array(32);
    crypto.getRandomValues(c);
    return c;
  }

  // supportsPrf(): a coarse, no-ceremony pre-check only -- there is no static capability probe
  // that tells you whether THIS authenticator will actually enable PRF. The definitive gate is
  // the create-time getClientExtensionResults().prf?.enabled check inside createCredential()
  // below; passkeyClaim() throws Error('prf-unsupported') when that check fails, and callers
  // (Task 11's claim resolver) catch that specific error to fall back to Privy.
  function supportsPrf() {
    var ok = (typeof window !== 'undefined') && !!window.PublicKeyCredential;
    return Promise.resolve(ok);
  }

  function createCredential(anonId) {
    var userId = new TextEncoder().encode(anonId);
    return navigator.credentials.create({
      publicKey: {
        challenge: randomChallenge(),
        rp: { id: location.hostname, name: 'ROOOT' },
        user: { id: userId, name: anonId, displayName: anonId },
        // COSE alg IDs for the authenticator's OWN WebAuthn signing keypair (attestation /
        // assertion) -- unrelated to the Solana ed25519 keypair derived from the PRF secret.
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 }, // ES256
          { type: 'public-key', alg: -8 }  // EdDSA
        ],
        // platform = the device's own Face/Touch ID -- the thing the button promises
        // (a roaming security key would also be "a passkey", but not the product).
        authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'required', userVerification: 'required' },
        // eval at create: platforms that return PRF results here (Chromium, newer WebKit)
        // let the FIRST run derive with ONE biometric -- no second get() ceremony.
        extensions: { prf: { eval: { first: APP_SALT } } }
      }
    }).then(function (credential) {
      if (!credential) throw new Error('prf-unsupported');
      var ext = credential.getClientExtensionResults();
      if (!ext || !ext.prf || ext.prf.enabled !== true) throw new Error('prf-unsupported');
      storeCredId(bytesToB64(new Uint8Array(credential.rawId)));
      var first = ext.prf.results && ext.prf.results.first;
      return { credential: credential, prfFirst: first || null };
    });
  }

  function getAssertion() {
    var stored = storedCredId();
    if (!stored) throw new Error('prf-unsupported');
    return navigator.credentials.get({
      publicKey: {
        challenge: randomChallenge(),
        rpId: location.hostname,
        allowCredentials: [{ type: 'public-key', id: b64ToBytes(stored) }],
        userVerification: 'required',
        extensions: { prf: { eval: { first: APP_SALT } } }
      }
    });
  }

  // passkeyClaim(anonId): create-once-then-get ceremony. Always returns a Promise; the
  // WebAuthn call is invoked SYNCHRONOUSLY in the caller's (click) stack -- Safari's
  // transient-activation window must see it -- with a try/catch turning any synchronous
  // throw (WebAuthn globals missing entirely) into a rejection, never an uncaught exception.
  function deriveFromPrfBytes(first) {
    var seed = new Uint8Array(first); // ArrayBuffer -> Uint8Array: tweetnacl throws TypeError otherwise
    var derived = keyFromPrf(seed);
    return { pubkey: derived.pubkey, method: 'passkey' };
    // derived.secret is intentionally dropped here -- never returned, stored, or logged.
  }
  function passkeyClaim(anonId) {
    try {
      if (!anonId) return Promise.reject(new Error('anonId required'));
      if (storedCredId()) {
        return getAssertion().then(function (assertion) {
          if (!assertion) throw new Error('prf-unsupported');
          var ext = assertion.getClientExtensionResults();
          var first = ext && ext.prf && ext.prf.results && ext.prf.results.first;
          if (!first) throw new Error('prf-unsupported');
          return deriveFromPrfBytes(first);
        });
      }
      return createCredential(anonId).then(function (made) {
        if (made.prfFirst) return deriveFromPrfBytes(made.prfFirst);   // one ceremony was enough
        return getAssertion().then(function (assertion) {              // platform evals PRF only on get -- second ceremony, unavoidable there
          if (!assertion) throw new Error('prf-unsupported');
          var ext = assertion.getClientExtensionResults();
          var first = ext && ext.prf && ext.prf.results && ext.prf.results.first;
          if (!first) throw new Error('prf-unsupported');
          return deriveFromPrfBytes(first);
        });
      });
    } catch (err) {
      return Promise.reject(err);
    }
  }

  if (typeof window !== 'undefined') {
    window.seatPasskey = { supportsPrf: supportsPrf, passkeyClaim: passkeyClaim };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { keyFromPrf: keyFromPrf, b58encode: b58encode };
  }
})(typeof window !== 'undefined' ? window : this);
