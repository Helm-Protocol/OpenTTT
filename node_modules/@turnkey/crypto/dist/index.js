'use strict';

var crypto = require('./crypto.js');
var turnkey = require('./turnkey.js');
var proof = require('./proof.js');



exports.buildAdditionalAssociatedData = crypto.buildAdditionalAssociatedData;
exports.compressRawPublicKey = crypto.compressRawPublicKey;
exports.extractPrivateKeyFromPKCS8Bytes = crypto.extractPrivateKeyFromPKCS8Bytes;
exports.formatHpkeBuf = crypto.formatHpkeBuf;
exports.fromDerSignature = crypto.fromDerSignature;
exports.generateP256KeyPair = crypto.generateP256KeyPair;
exports.getPublicKey = crypto.getPublicKey;
exports.hpkeAuthEncrypt = crypto.hpkeAuthEncrypt;
exports.hpkeDecrypt = crypto.hpkeDecrypt;
exports.hpkeEncrypt = crypto.hpkeEncrypt;
exports.quorumKeyEncrypt = crypto.quorumKeyEncrypt;
exports.toDerSignature = crypto.toDerSignature;
exports.uncompressRawPublicKey = crypto.uncompressRawPublicKey;
Object.defineProperty(exports, "Enclave", {
	enumerable: true,
	get: function () { return turnkey.Enclave; }
});
exports.decryptCredentialBundle = turnkey.decryptCredentialBundle;
exports.decryptExportBundle = turnkey.decryptExportBundle;
exports.encryptOauth2ClientSecret = turnkey.encryptOauth2ClientSecret;
exports.encryptOnRampSecret = turnkey.encryptOnRampSecret;
exports.encryptPrivateKeyToBundle = turnkey.encryptPrivateKeyToBundle;
exports.encryptToEnclave = turnkey.encryptToEnclave;
exports.encryptWalletToBundle = turnkey.encryptWalletToBundle;
exports.verifySessionJwtSignature = turnkey.verifySessionJwtSignature;
exports.verifyStampSignature = turnkey.verifyStampSignature;
exports.getCryptoInstance = proof.getCryptoInstance;
exports.verify = proof.verify;
exports.verifyAppProofSignature = proof.verifyAppProofSignature;
exports.verifyCertificateChain = proof.verifyCertificateChain;
exports.verifyCoseSign1Sig = proof.verifyCoseSign1Sig;
//# sourceMappingURL=index.js.map
