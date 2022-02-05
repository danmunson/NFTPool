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
import { Wallet, utils, BigNumber } from "ethers";

import {
    Credits,
    MockERC1155,
    MockERC721,
    MockLINK,
    MockVRFOracle,
    MockWETH,
    NFTDispenser,
    Pool,
    VRFClient
} from "../../../typechain";

import {
    getSignatureParameters,
    getTypedData,
    MetaTxInput,
    signMetaTxTypedData
} from "../../../utils/metaTxHelpers";

import { PoolInterfaceFactory, PoolAdmin, PoolView } from '../../../utils/PoolManager';

type Mocks = {
    weth: MockWETH,
    oracle: MockVRFOracle,
    link: MockLINK,
    erc721: MockERC721,
    erc1155: MockERC1155
};

type SideContracts = {
    credits: Credits,
    nftDispenser: NFTDispenser,
    vrfClient: VRFClient,
};

const drawFee = utils.parseEther('1.0');
const vrfFee = utils.parseEther('0.0001');
const creditsTokenUri = 'https:url.com/token/{id}';
const creditsContractUri = 'https:url.com/contract';
const keyhash = '0x6e75b569a01ef56d18cab6a8e71e6600d6ce853834d4a5748b720d06f878b3a4';

describe('NFTPool', async () => {
    let buyer: Wallet;
    let admin: Wallet;
    let main: SignerWithAddress;
    let feeRecipient: SignerWithAddress;
    let pool: Pool;
    let mocks: Mocks;
    let sides: SideContracts;
    let domainConstants: Pick<MetaTxInput, 'name'|'version'|'chainId'|'verifyingContract'>;

    async function setSigners() {
        buyer = ethers.Wallet.createRandom();
        admin = ethers.Wallet.createRandom().connect(ethers.provider);

        const signers = await ethers.getSigners();
        main = signers[0];
        feeRecipient = signers[1];

        // have main send funds to admin
        await main.sendTransaction({
            to: admin.address,
            value: utils.parseEther('10.0')
        });
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

        domainConstants = {
            name: 'Wrapped Ether',
            version: '1',
            chainId: (await weth.getChainId()).toNumber(),
            verifyingContract: weth.address,
        };

        mocks = {weth, oracle, link, erc721, erc1155};
    }

    async function deployPool(adminWallet?: Wallet) {
        const Pool = await ethers.getContractFactory('Pool');
        pool = await Pool.deploy(
            adminWallet ? adminWallet.address : main.address, // _eoaAdmin
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

        const [creditsAddress, nftdispenserAddress, vrfClientAddress] = await pool.connect(
            adminWallet || main
        ).getSideContractAddresses();
        const credits = await ethers.getContractAt('Credits', creditsAddress);
        const nftDispenser = await ethers.getContractAt('NFTDispenser', nftdispenserAddress);
        const vrfClient = await ethers.getContractAt('VRFClient', vrfClientAddress);
        sides = {credits, nftDispenser, vrfClient};

        await fundLink();
    }

    async function fundLink() {
        const amount = utils.parseEther('1000');
        await (
            await mocks.link.setBalance(sides.vrfClient.address, amount)
        ).wait();
    }

    async function getMessage(
        fromAddress: string,
        toAddress: string,
        amount: BigNumber,
    ): Promise<Pick<MetaTxInput, 'from'|'functionSignature'|'nonce'>> {
        // get the "message" part of typed input
        const nonce = (await mocks.weth.getNonce(fromAddress)).toNumber();
        const functionSignature = mocks.weth.interface.encodeFunctionData('transfer', [toAddress, amount]);
        return {
            from: fromAddress,
            functionSignature,
            nonce,
        }
    }

    async function getTransferParameters(amount: string, quantity: number = 1) {
        const message = await getMessage(
            buyer.address, feeRecipient.address, utils.parseEther(amount).mul(quantity)
        );
        const typedData = getTypedData({...message, ...domainConstants});
        const signature = signMetaTxTypedData(typedData, buyer.privateKey);
        const {r, s, v} = getSignatureParameters(signature);
        return {
            fsig: typedData.message.functionSignature,
            r, s, v
        };
    }

    async function fulfillRandom(random: number, requestId: string) {
        await (
            await mocks.oracle.submitRandomness(sides.vrfClient.address, requestId, random)
        ).wait();
    }

    before(async () => {
        await setSigners();
        await deployDependencies();
    });

    describe('Contract Validation', async () => {

        describe('input validation', async () => {
            before(async () => {
                await deployPool();
            });
            
            it('amount != drawFee', async () => {
                const {fsig, r, s, v} = await getTransferParameters('0.1');
                await expect(
                    pool.initiateDrawWithWeth(buyer.address, 1, fsig, r, s, v)
                ).to.be.revertedWith('Transfer is for wrong amount');
            });
            
            it('quantity = 0', async () => {
                const {fsig, r, s, v} = await getTransferParameters('1.0');
                await expect(
                    pool.initiateDrawWithWeth(buyer.address, 0, fsig, r, s, v)
                ).to.be.revertedWith('Quantity == 0');
            });
            
            it('quantity > 8', async () => {
                const {fsig, r, s, v} = await getTransferParameters('1.0');
                await expect(
                    pool.initiateDrawWithWeth(buyer.address, 9, fsig, r, s, v)
                ).to.be.revertedWith('Quantity > 8');
            });

            it('reservation does not exist', async () => {
                await expect(
                    pool.fulfillDraw(buyer.address, 0)
                ).to.be.revertedWith('Reservation does not exist');
            });

            it('reservation already exists', async () => {
                const {fsig, r, s, v} = await getTransferParameters('1.0');

                await (
                    await pool.initiateDrawWithWeth(buyer.address, 1, fsig, r, s, v)
                ).wait();

                await expect(
                    pool.initiateDrawWithWeth(buyer.address, 1, fsig, r, s, v)
                ).to.be.revertedWith('Reservation for user exists');
            });

            it('random seed not ready', async () => {
                await expect(
                    pool.fulfillDraw(buyer.address, 0)
                ).to.be.revertedWith('Random seed not ready');
            });
        });

        describe('views', async () => {
            before(async () => {
                await deployPool();
            });

            it('getSideContractAddresses', async () => {
                const zeroAddr = '0x0000000000000000000000000000000000000000';
                const [credits, nftdispenser, vrfclient, wethmanager] = await pool.getSideContractAddresses();
                assert.notEqual(credits, zeroAddr);
                assert.notEqual(nftdispenser, zeroAddr);
                assert.notEqual(vrfclient, zeroAddr);
                assert.notEqual(wethmanager, zeroAddr);
            });
            
            it('reservation details', async () => {
                const {fsig, r, s, v} = await getTransferParameters('4.0');
                await (
                    await pool.initiateDrawWithWeth(buyer.address, 4, fsig, r, s, v)
                ).wait();

                const [user, quantity, drawsOccurred] = await pool.getReservationDetails(buyer.address);
                assert.strictEqual(user, buyer.address);
                assert.strictEqual(quantity.toNumber(), 4);
                assert.strictEqual(drawsOccurred.toNumber(), 0);

                const [requestId] = await pool.getPrivateReservationDetails(buyer.address);
                await fulfillRandom(2 ** 32 - 1, requestId);

                const canFulfill = pool.canFulfillReservation(buyer.address);
                assert(canFulfill);

                // fulfill claim with _maxCount = 0 so as to not draw
                await (
                    await pool.fulfillDraw(buyer.address, 0)
                ).wait();

                const [_, randomSeed, computedRarities] = await pool.getPrivateReservationDetails(buyer.address);
                assert.strictEqual(randomSeed.toNumber(), 2 ** 32 - 1);
                assert.deepStrictEqual(computedRarities.map(x => x.toNumber()), [32, 0, 0, 0, 0, 0, 0, 0]);
            });
        });
    });

    describe('Interface <-> Contract', async () => {
        let poolAdmin: PoolAdmin;
        let poolView: PoolView;

        describe('admin & views', async () => {
            before(async () => {
                await deployPool(admin);
                const [
                    creditsAddress,
                    nftDispenserAddress,
                    vrfClientAddress
                ] = await pool.connect(admin).getSideContractAddresses();

                const PoolIxFactory = new PoolInterfaceFactory(
                    admin, pool.address, creditsAddress, nftDispenserAddress, vrfClientAddress
                );

                poolAdmin = await PoolIxFactory.makePoolAdmin();
                poolView = await PoolIxFactory.makePoolView();
            });

            it('updateFeeRecipient', async () => {
                const currentRecipient = await pool.feeRecipient();
                await poolAdmin.updateFeeRecipient(main.address);
                const newFeeRecipient = await pool.feeRecipient();
                assert.strictEqual(newFeeRecipient, main.address);
                assert.notEqual(newFeeRecipient, currentRecipient);
                // test pool view
                const view = await poolView.getFeeRecipient();
                assert.strictEqual(view, newFeeRecipient);
                // reset
                await poolAdmin.updateFeeRecipient(currentRecipient);
            });

            it('updateDrawFee', async () => {
                const currentFee = await pool.drawFee();
                await poolAdmin.updateDrawFee('0.001');
                const newFee = await pool.drawFee();
                assert.strictEqual(newFee.toString(), utils.parseEther('0.001').toString());
                assert.notEqual(newFee.toString(), currentFee.toString());
                // test pool view
                const view = await poolView.getDrawFee();
                assert.strictEqual(view, newFee);
            });

            it('updateCreditFee', async () => {
                const currentFee = await pool.creditFeeByQuantity(10);
                assert.strictEqual(currentFee.toNumber(), 0);

                await poolAdmin.updateCreditFee(10, '0.0009');
                const newFee = await pool.creditFeeByQuantity(10);
                assert.strictEqual(newFee.toString(), utils.parseEther('0.0009').toString());

                // test pool view
                const view = await poolView.getCreditFee(10);
                assert.strictEqual(view, newFee);
            });

            it('refundUser', async () => {
                const {fsig, r, s, v} = await getTransferParameters('0.001', 2);
                await (
                    await pool.initiateDrawWithWeth(buyer.address, 2, fsig, r, s, v)
                ).wait();

                const [_, quantity] = await pool.getReservationDetails(buyer.address);
                assert.strictEqual(quantity.toNumber(), 2);

                // test pool view
                const view = await poolView.getReservation(buyer.address);
                assert.strictEqual(view.quantity.toNumber(), quantity.toNumber());

                let balance = await sides.credits.balanceOf(buyer.address, 12);
                assert.strictEqual(balance.toNumber(), 0);

                // REFUND
                await poolAdmin.refundUser(buyer.address);

                const [__, newQuantity] = await pool.getReservationDetails(buyer.address);
                assert.strictEqual(newQuantity.toNumber(), 0);

                balance = await sides.credits.balanceOf(buyer.address, 12);
                assert.strictEqual(balance.toNumber(), 2);

                // test pool view
                const creditsView = await poolView.getCreditsBalance(buyer.address);
                assert.strictEqual(creditsView[12], balance.toNumber());
            });

            it('setUris', async () => {
                const currentUris = await poolView.getUris();
                await poolAdmin.setUris('tokenUri.com', 'contractUri.com');
                const newUris = await poolView.getUris();
                assert.notEqual(currentUris.contractUri, newUris.contractUri);
                assert.strictEqual(newUris.tokenUri, 'tokenUri.com');
                assert.strictEqual(newUris.contractUri, 'contractUri.com');
            });

            it('mintCredits', async () => {
                let currentBalances = await poolView.getCreditsBalance(sides.nftDispenser.address);
                assert.strictEqual(currentBalances[1], 0);

                await poolAdmin.mintCredits(sides.nftDispenser.address, 1, 100);

                currentBalances = await poolView.getCreditsBalance(sides.nftDispenser.address);
                assert.strictEqual(currentBalances[1], 100);
            });

            // this test is dependent on the state created by the preceding test
            it('setTier', async () => {
                let activeTiers = await poolView.getActiveTiers();
                let indexesAt0 = await poolView.getIndexesByTier(0);
                let info = await poolView.getNftInfo(sides.credits.address, 1);

                assert.deepStrictEqual(activeTiers, Array(33).fill(false));
                assert.strictEqual(indexesAt0.toNumber(), 0);
                assert.strictEqual(info.quantity, 0);

                // set tier
                await poolAdmin.setTier(sides.credits.address, 1, true, 0);

                // check again
                activeTiers = await poolView.getActiveTiers();
                indexesAt0 = await poolView.getIndexesByTier(0);
                info = await poolView.getNftInfo(sides.credits.address, 1);

                assert.deepStrictEqual(activeTiers, [true].concat(Array(32).fill(false)));
                assert.strictEqual(indexesAt0.toNumber(), 1);
                assert.strictEqual(info.quantity, 100);
            });

            it('update vrf', async () => {
                const currentFee = await poolView.vrfFee();
                const currentKeyhash = await poolView.vrfKeyhash();

                await poolAdmin.updateVrfFee(utils.parseEther("100.0"));
                await poolAdmin.updateKeyhash('0x' + Array(64).fill('f').join(''));

                const newFee = await poolView.vrfFee();
                const newKeyhash = await poolView.vrfKeyhash();

                assert.notEqual(newKeyhash, currentKeyhash);
                assert.notEqual(newFee.toString(), currentFee.toString());

                assert.strictEqual(newFee.toString(), utils.parseEther("100.0").toString());
                assert.strictEqual(newKeyhash, '0x' + Array(64).fill('f').join(''));
            });
        });
    });
});