import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect, assert } from "chai";
import { ethers } from "hardhat";
import { Wallet, utils } from "ethers";
import { MockWETH, WETHManager } from "../../../typechain";
import { getSignatureParameters, getTypedData, MetaTxInput, signMetaTxTypedData} from "../../../utils/metaTxHelpers";

const TRANSFER_AMOUNT = utils.parseEther("1.0");

describe('WETHManager', async () => {
    let testSender: Wallet;
    let mainAcct: SignerWithAddress;
    let altAcct: SignerWithAddress;
    let mockWeth: MockWETH;
    let wethManager: WETHManager;
    let domainConstants: Pick<MetaTxInput, 'name'|'version'|'chainId'|'verifyingContract'>;
    
    async function getMessage(
        fromAddress: string,
        toAddress: string,
    ): Promise<Pick<MetaTxInput, 'from'|'functionSignature'|'nonce'>> {
        // get the "message" part of typed input
        const nonce = (await mockWeth.getNonce(fromAddress)).toNumber();
        const functionSignature = mockWeth.interface.encodeFunctionData('transfer', [toAddress, TRANSFER_AMOUNT]);
        return {
            from: fromAddress,
            functionSignature,
            nonce,
        }
    }

    before(async () => {
        testSender = ethers.Wallet.createRandom();
        const signers = await ethers.getSigners();
        mainAcct = signers[0];
        altAcct = signers[1];

        const MockWETH = await ethers.getContractFactory("MockWETH");
        mockWeth = await MockWETH.deploy();
        await mockWeth.deployed();

        const WETHManager = await ethers.getContractFactory("WETHManager");
        wethManager = await WETHManager.deploy(mockWeth.address, mainAcct.address);
        await wethManager.deployed();

        // set domain constants
        domainConstants = {
            name: 'Wrapped Ether',
            version: '1',
            chainId: (await mockWeth.getChainId()).toNumber(),
            verifyingContract: mockWeth.address,
        };
    });

    it('Can forward meta-transactions to the WETH contract and then transfer balances', async () => {
        // SEND META TRANSACTION
        const wethManagerStartingBalance = await mockWeth.balanceOf(wethManager.address);
        const message = await getMessage(testSender.address, wethManager.address);
        const typedData = getTypedData({...message, ...domainConstants});
        const signature = signMetaTxTypedData(typedData, testSender.privateKey);
        const {r, s, v} = getSignatureParameters(signature);
        const forwardTx = await wethManager.forwardMetaTransaction(
            TRANSFER_AMOUNT, // expected amount
            testSender.address, typedData.message.functionSignature, r, s, v,
        );
        await forwardTx.wait();

        const wethManagerEndingBalance = await mockWeth.balanceOf(wethManager.address);
        const wethManagerBalanceDiff = wethManagerEndingBalance.sub(wethManagerStartingBalance);
        // confirm balance transfer
        assert.equal(wethManagerBalanceDiff.toString(), TRANSFER_AMOUNT.toString());

        // TRANSFER TO MAIN
        const mainStartingBalance = await mockWeth.balanceOf(mainAcct.address);
        const transferTx = await wethManager.transfer(mainAcct.address, TRANSFER_AMOUNT);
        await transferTx.wait();

        const mainEndingBalance = await mockWeth.balanceOf(mainAcct.address);
        const mainBalanceDiff = mainEndingBalance.sub(mainStartingBalance);
        // confirm balance transfer
        assert.equal(mainBalanceDiff.toString(), TRANSFER_AMOUNT.toString());
    });

    describe('admin', async () => {
        it('only admin can transfer', async () => {
            await expect(
                wethManager.connect(altAcct).transfer(mainAcct.address, TRANSFER_AMOUNT)
            ).to.be.revertedWith('Must be admin');
        });

        it('only admin can forwardMetaTx', async () => {
            const message = await getMessage(testSender.address, wethManager.address);
            const typedData = getTypedData({...message, ...domainConstants});
            const signature = signMetaTxTypedData(typedData, testSender.privateKey);
            const {r, s, v} = getSignatureParameters(signature);
            await expect(
                wethManager.connect(altAcct).forwardMetaTransaction(
                    TRANSFER_AMOUNT, // expected amount
                    testSender.address,
                    typedData.message.functionSignature,
                    r, s, v,
            )).to.be.revertedWith('Must be admin');
        });
    });

    describe('validates function call', async () => {
        it('checks the function signature', async () => {
            const message = await getMessage(testSender.address, wethManager.address);
            const typedData = getTypedData({...message, ...domainConstants});
            // replace function signature with call to approve
            typedData.message.functionSignature = mockWeth.interface.encodeFunctionData(
                'approve', [wethManager.address, TRANSFER_AMOUNT]
            );
            const signature = signMetaTxTypedData(typedData, testSender.privateKey);
            const {r, s, v} = getSignatureParameters(signature);
            await expect(wethManager.forwardMetaTransaction(
                TRANSFER_AMOUNT, // expected amount
                testSender.address, typedData.message.functionSignature, r, s, v,
            )).to.be.revertedWith('Transfer not target function');
        });

        it('checks the recipient', async () => {
            const message = await getMessage(testSender.address, mainAcct.address);
            const typedData = getTypedData({...message, ...domainConstants});
            const signature = signMetaTxTypedData(typedData, testSender.privateKey);
            const {r, s, v} = getSignatureParameters(signature);
            await expect(wethManager.forwardMetaTransaction(
                TRANSFER_AMOUNT, // different expected amount
                testSender.address, typedData.message.functionSignature, r, s, v,
            )).to.be.revertedWith('Transfer to wrong recipient');
        });

        it('checks the amount', async () => {
            const message = await getMessage(testSender.address, wethManager.address);
            const typedData = getTypedData({...message, ...domainConstants});
            const signature = signMetaTxTypedData(typedData, testSender.privateKey);
            const {r, s, v} = getSignatureParameters(signature);
            await expect(wethManager.forwardMetaTransaction(
                TRANSFER_AMOUNT.div(2), // different expected amount
                testSender.address, typedData.message.functionSignature, r, s, v,
            )).to.be.revertedWith('Transfer is for wrong amount');
        });
    });
});