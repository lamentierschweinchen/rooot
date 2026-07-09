(function (root) {
  'use strict';
  // nacl + bs58 are bundled for the browser build; in Node tests they resolve from node_modules.
  var nacl = (typeof require !== 'undefined') ? require('tweetnacl') : root.nacl;
  var bs58 = (typeof require !== 'undefined') ? require('bs58') : root.bs58;
  function keyFromPrf(prfBytes) {
    var seed = prfBytes.slice(0, 32);
    var kp = nacl.sign.keyPair.fromSeed(seed);
    var pub = bs58.encode ? bs58.encode(kp.publicKey) : bs58.default.encode(kp.publicKey);
    return { pubkey: pub, secret: kp.secretKey };
  }
  root.keyFromPrf = keyFromPrf;
  if (typeof module !== 'undefined' && module.exports) module.exports = { keyFromPrf: keyFromPrf };
})(typeof window !== 'undefined' ? window : this);
