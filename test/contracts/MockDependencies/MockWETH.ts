import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect, assert } from "chai";
import { ethers } from "hardhat";
import { Wallet, utils } from "ethers";
import { MockWETH } from "../../../typechain";
import { getSignatureParameters, getTypedData, MetaTxInput, signMetaTxTypedData} from "../../../utils/metaTxHelpers";

const TRANSFER_AMOUNT = utils.parseEther("1.0");

describe('MockWETH', async () => {
    let testSender: Wallet;
    let mainAcct: SignerWithAddress;
    let mockWeth: MockWETH;
    let domainConstants: Pick<MetaTxInput, 'name'|'version'|'chainId'|'verifyingContract'>;
    
    async function getMessage(
        fromAddress: string,
        toAddress: string
    ): Promise<Pick<MetaTxInput, 'from'|'functionSignature'|'nonce'>> {
        // get the "message" part of typed input
        const nonce = (await mockWeth.getNonce(fromAddress)).toNumber();
        const functionSignature = mockWeth.interface.encodeFunctionData("transfer", [toAddress, TRANSFER_AMOUNT]);
        return {
            from: fromAddress,
            functionSignature,
            nonce,
        }
    }

    before(async () => {
        testSender = ethers.Wallet.createRandom();
        mainAcct = (await ethers.getSigners())[0];
        const MockWETH = await ethers.getContractFactory("MockWETH");
        mockWeth = await MockWETH.deploy();
        await mockWeth.deployed();

        // set domain constants
        domainConstants = {
            name: 'Wrapped Ether',
            version: '1',
            chainId: (await mockWeth.getChainId()).toNumber(),
            verifyingContract: mockWeth.address,
        };
    });

    /**
     * There are two things that need to be confirmed to know that these tests are useful:
     *      1) a meta transaction can be executed with proper values
     *      2) a meta transaction cannot be executed with improper values
     */

    // TEST (1)
    it('completes a properly formatted meta transaction', async () => {
        // get starting balance & nonce of recipient
        const recipientStartingBalance = await mockWeth.balanceOf(mainAcct.address);
        const senderStartingNonce = await mockWeth.getNonce(testSender.address);
        // construct and send meta transaction
        const message = await getMessage(testSender.address, mainAcct.address);
        const typedData = getTypedData({...message, ...domainConstants});
        const signature = signMetaTxTypedData(typedData, testSender.privateKey);
        const {r, s, v} = getSignatureParameters(signature);
        const metaTx = await mockWeth.executeMetaTransaction(
            testSender.address, typedData.message.functionSignature, r, s, v,
        );
        await metaTx.wait();
        // get new balance & nonce of recipient
        const recipientEndingBalance = await mockWeth.balanceOf(mainAcct.address);
        const balanceDiff = recipientEndingBalance.sub(recipientStartingBalance);
        const senderEndingNonce = await mockWeth.getNonce(testSender.address);
        const nonceDiff = senderEndingNonce.sub(senderStartingNonce);
        // assert that the diff is equal to the transaction amount
        assert.strictEqual(balanceDiff.toString(), TRANSFER_AMOUNT.toString());
        assert.strictEqual(nonceDiff.toString(), "1");
    });

    describe('does not complete corrupted meta transactions', async () => {
        it('does not succeed with incorrect domain constants', async () => {
            const incorrectValues = [
                {name: 'Regular Ether'},
                {version: '2'},
                {chainId: 80002},
                {verifyingContract: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'},
            ];
            for (const fragment of incorrectValues) {
                const message = await getMessage(testSender.address, mainAcct.address);
                const typedData = getTypedData({...message, ...domainConstants, ...fragment});
                const signature = signMetaTxTypedData(typedData, testSender.privateKey);
                const {r, s, v} = getSignatureParameters(signature);
                await expect(mockWeth.executeMetaTransaction(
                    testSender.address, typedData.message.functionSignature, r, s, v
                )).to.be.revertedWith('Signer and signature do not match');
            }
        });

        it('does not allow transfer to be called with wrong user', async () => {
            const message = await getMessage(testSender.address, mainAcct.address);
            const typedData = getTypedData({...message, ...domainConstants});
            const signature = signMetaTxTypedData(typedData, testSender.privateKey);
            const {r, s, v} = getSignatureParameters(signature);
            await expect(mockWeth.executeMetaTransaction(
                // mainAcct is incorrect here
                mainAcct.address, typedData.message.functionSignature, r, s, v
            )).to.be.revertedWith('Signer and signature do not match');
        });

        it('does not allow transfer to be called with bad signature', async () => {
            const message = await getMessage(testSender.address, mainAcct.address);
            const typedData = getTypedData({...message, ...domainConstants});
            const signature = signMetaTxTypedData(typedData, testSender.privateKey);
            const {r, s, v} = getSignatureParameters(signature);
            await expect(mockWeth.executeMetaTransaction(
                // should be r, s, v
                testSender.address, typedData.message.functionSignature, s, r, v
            )).to.be.revertedWith('Signer and signature do not match');
        });

        it('does not allow transfer to be called with bad function signature', async () => {
            const message = await getMessage(testSender.address, mainAcct.address);
            const typedData = getTypedData({...message, ...domainConstants});
            const signature = signMetaTxTypedData(typedData, testSender.privateKey);
            const {r, s, v} = getSignatureParameters(signature);
            const fsig = typedData.message.functionSignature;
            let badfsig: string;
            if (fsig.slice(fsig.length - 1) === '0') {
                badfsig = fsig.slice(0, fsig.length - 1) + '1';
            } else {
                badfsig = fsig.slice(0, fsig.length - 1) + '0';
            }
            assert.strictEqual(fsig.length, badfsig.length);
            await expect(mockWeth.executeMetaTransaction(
                // should be r, s, v
                testSender.address, badfsig, r, s, v
            )).to.be.revertedWith('Signer and signature do not match');
        });
    });
});