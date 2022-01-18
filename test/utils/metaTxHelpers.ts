import { assert, expect } from "chai";
import { Wallet } from 'ethers';
import { getTypedData, signMetaTxTypedData, recoverMetaTxSignature, toBuffer } from '../../utils/metaTxHelpers';

describe('Meta-transaction helpers', async () => {
    let testWallet: Wallet;
    
    before(() => {
        testWallet = Wallet.createRandom();
    });

    it('should properly convert hex strings to buffer', () => {
        const straightHex = '6b241f2a7b90e576e0a000ae5afebac47916a404d7942df43075a61a6295ae2d';
        const prefixedHex = '0x' + straightHex;
        const oddHex = '0x123';
        const notHex = '0x12z';

        assert.strictEqual(toBuffer(straightHex).toString('hex'), straightHex);
        assert.strictEqual(toBuffer(prefixedHex).toString('hex'), straightHex);

        expect(() => toBuffer(oddHex).toString('hex')).to.throw();
        expect(() => toBuffer(notHex).toString('hex')).to.throw();
    });

    it('should sign data then recover the signing address', () => {
        const testTypedData = getTypedData({
            name: 'Fake Data',
            version: '1',
            chainId: 123,
            verifyingContract: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
            nonce: 0,
            from: '0x0123456789abcdef0123456789abcdefdeadbeef',
            functionSignature: '0x0123456789012345678901234567890123456789'
        });
        const signature = signMetaTxTypedData(testTypedData, testWallet.privateKey);
        const recoveredAddress = recoverMetaTxSignature(testTypedData, signature);
        assert.strictEqual(recoveredAddress.toLowerCase(), testWallet.address.toLowerCase());
    });
});