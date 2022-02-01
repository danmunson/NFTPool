/**
 * CASES TO TEST
 * 
 *      * no default tiers results in skipping selection
 *      * fulfillment can be spread across multiple transactions
 *      * quantity purchased limit is respected
 *      * reservations are made correctly
 *       
 * 
 * PROCESSES
 *      * user refund
 *      * make reservation with weth
 *      * make reservation with credits
 *      * buy credits
 *      * ALL ADMIN FUNCTIONS
 */

import { expect, assert } from "chai";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ethers } from "hardhat";
import { Wallet, utils } from "ethers";

import {
    MockERC1155,
    MockERC721,
    MockLINK,
    MockVRFOracle,
    MockWETH,
    Pool
} from "../../../typechain";

type Mocks = {
    weth: MockWETH,
    oracle: MockVRFOracle,
    link: MockLINK,
    erc721: MockERC721,
    erc1155: MockERC1155
};

const drawFee = utils.parseEther('1.0');
const vrfFee = utils.parseEther('0.0001');
const creditsTokenUri = 'https:url.com/token/{id}';
const creditsContractUri = 'https:url.com/contract';
const keyhash = '0x6e75b569a01ef56d18cab6a8e71e6600d6ce853834d4a5748b720d06f878b3a4';

describe('NFTPool', async () => {
    let buyer: Wallet;
    let main: SignerWithAddress;
    let feeRecipient: SignerWithAddress;
    let pool: Pool;
    let mocks: Mocks;

    async function setSigners() {
        buyer = ethers.Wallet.createRandom();
        const signers = await ethers.getSigners();
        main = signers[0];
        feeRecipient = signers[1];
    }

    async function deployDependencies() {
        const MockWETH = await ethers.getContractFactory('MockWETH');
        const weth = await MockWETH.deploy();
        await weth.deployed();

        const MockLINK = await ethers.getContractFactory('MockLINK');
        const link = await MockLINK.deploy();
        await link.deployed();

        const MockVRFOracle = await ethers.getContractFactory('MockVRFOracle');
        const oracle = await MockVRFOracle.deploy();
        await oracle.deployed();

        const MockERC721 = await ethers.getContractFactory("MockERC721");
        const erc721 = await MockERC721.deploy();
        await erc721.deployed();

        const MockERC1155 = await ethers.getContractFactory("MockERC1155");
        const erc1155 = await MockERC1155.deploy();
        await erc1155.deployed();

        mocks = {weth, oracle, link, erc721, erc1155};
    }

    async function deployPool() {
        const Pool = await ethers.getContractFactory('Pool');
        pool = await Pool.deploy(
            main.address, // _eoaAdmin
            feeRecipient.address, // _feeRecipient
            drawFee, // _drawFee
            creditsTokenUri, // _tokenUri
            creditsContractUri, // _contractUri
            mocks.oracle.address, // _vrfOracleAddress
            mocks.link.address, // _linkTokenAddress
            vrfFee, // _vrfFee
            keyhash, // _vrfKeyHash
            mocks.weth.address // _wethAddress
        );
        await pool.deployed();
    }

    before(async () => {
        await setSigners();
        await deployDependencies();
        await deployPool();
    });

    describe('Contract', async () => {

        it('deployment test', async () => {
            const zeroAddr = '0x0000000000000000000000000000000000000000';
            const [credits, nftdispenser, vrfclient, wethmanager] = await pool.getSideContractAddresses();
            assert.notEqual(credits, zeroAddr);
            assert.notEqual(nftdispenser, zeroAddr);
            assert.notEqual(vrfclient, zeroAddr);
            assert.notEqual(wethmanager, zeroAddr);
        });

        describe('fulfills reservation over multiple requests', async () => {

        });
    });

    describe('Interface <-> Contract', async () => {});
});