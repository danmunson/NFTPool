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
import { Wallet, utils, BigNumber, BigNumberish } from "ethers";

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

import { PoolInterfaceFactory, PoolAdmin, PoolView, PoolRelay } from '../../../utils/PoolManager';

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

    async function deployNftMocks() {
        const MockERC721 = await ethers.getContractFactory("MockERC721");
        const erc721 = await MockERC721.deploy();
        await erc721.deployed();

        const MockERC1155 = await ethers.getContractFactory("MockERC1155");
        const erc1155 = await MockERC1155.deploy();
        await erc1155.deployed();

        return {erc721, erc1155};
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

        const {erc721, erc1155} = await deployNftMocks();

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

    async function fulfillRandom(random: BigNumberish, requestId: string) {
        await (
            await mocks.oracle.submitRandomness(sides.vrfClient.address, requestId, random)
        ).wait();
    }

    function getRandomFromTiers(...tiers: number[]) {
        const hexStrings = tiers.map(tier => {
            // create length 32 strings that will yield the correct tiers
            const binaryString = Array(tier).fill('1').join('') + Array(32 - tier).fill('0').join('');
            return parseInt(binaryString, 2).toString(16);
        });
        // reverse hex string to ensure that the first tier is also the first slice
        hexStrings.reverse();
        return '0x' + hexStrings.join('').padStart(64, '0');
    }

    before(async () => {
        await setSigners();
        await deployDependencies();
    });

    describe('Contract Validation', async () => {

        it('randomFromTiers', () => {
            const nums = [32, 25, 16, 2, 1];
            const hexString = getRandomFromTiers(...nums).slice(2);
            const extractedNums = [];
            for (let i = 0; i < nums.length; i++) {
                const slice = hexString.slice(64 - (8 * (i + 1)), 64 - (8 * i));
                const binaryString = parseInt(slice, 16).toString(2);
                let countOf1s = 0;
                for (const char of binaryString) if (char === '1') countOf1s++;
                extractedNums.push(countOf1s);
            }
            assert.deepStrictEqual(nums, extractedNums);
        });

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

                let canFulfill = pool.canFulfillReservation(buyer.address);
                assert(canFulfill);

                // fulfill claim with _maxCount = 0 so as to not draw
                await (
                    await pool.fulfillDraw(buyer.address, 0)
                ).wait();

                const newDrawsOccurred = (await pool.getReservationDetails(buyer.address))[2];
                assert.strictEqual(newDrawsOccurred.toNumber(), 0);
                const [_, randomSeed, computedRarities] = await pool.getPrivateReservationDetails(buyer.address);
                assert.strictEqual(randomSeed.toNumber(), 2 ** 32 - 1);
                assert.deepStrictEqual(computedRarities.map(x => x.toNumber()), [32, 0, 0, 0, 0, 0, 0, 0]);

                // check that vrf reference was deleted but use canFulfillReservation is still true
                const vrfRandom = await sides.vrfClient.getRandomNumber(requestId);
                assert.strictEqual(vrfRandom.toNumber(), 0);
                canFulfill = pool.canFulfillReservation(buyer.address);
                assert(canFulfill);
            });
        });
    });

    describe('Interface <-> Contract', async () => {
        let poolAdmin: PoolAdmin;
        let poolView: PoolView;
        let poolRelay: PoolRelay;

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
            it('setTier && forceTransfer && forceRemove', async () => {
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

                // force remove
                await poolAdmin.forceRemoveNft(sides.credits.address, 1);

                activeTiers = await poolView.getActiveTiers();
                indexesAt0 = await poolView.getIndexesByTier(0);
                info = await poolView.getNftInfo(sides.credits.address, 1);
                assert.deepStrictEqual(activeTiers, Array(33).fill(false));
                assert.strictEqual(indexesAt0.toNumber(), 0);
                assert.strictEqual(info.quantity, 0);

                // reset in final tier
                await poolAdmin.setTier(sides.credits.address, 1, true, 32);

                activeTiers = await poolView.getActiveTiers();
                let indexesAt32 = await poolView.getIndexesByTier(32);
                info = await poolView.getNftInfo(sides.credits.address, 1);
                assert.deepStrictEqual(activeTiers, Array(32).fill(false).concat([true]));
                assert.strictEqual(indexesAt32.toNumber(), 1);
                assert.strictEqual(info.quantity, 100);

                // check that main has no credits
                assert.strictEqual((await sides.credits.balanceOf(main.address, 1)).toNumber(), 0);

                // force transfer
                await poolAdmin.forceTransferNft(sides.credits.address, 1, true, main.address);

                activeTiers = await poolView.getActiveTiers();
                indexesAt32 = await poolView.getIndexesByTier(32);
                info = await poolView.getNftInfo(sides.credits.address, 1);
                assert.deepStrictEqual(activeTiers, Array(33).fill(false));
                assert.strictEqual(indexesAt32.toNumber(), 0);
                assert.strictEqual(info.quantity, 0);
                // check that main has the credits
                assert.strictEqual((await sides.credits.balanceOf(main.address, 1)).toNumber(), 100);
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

        describe('user experience', async () => {
            // get a fresh rest on every test
            beforeEach(async () => {
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
                poolRelay = await PoolIxFactory.makePoolRelay();
            });

            it('initiateDrawWithWeth', async () => {
                const quantity = 2;
                const {fsig, r, s, v} = await getTransferParameters('1.0', quantity);
                await poolRelay.drawWithWeth(buyer.address, quantity, fsig, r, s, v);

                const reservation = await poolView.getReservation(buyer.address);
                assert.strictEqual(reservation.user, buyer.address);
                assert.strictEqual(reservation.quantity.toNumber(), quantity);
                assert.strictEqual(reservation.drawsOccurred.toNumber(), 0);

                const reservedLogs = await poolView.getReservedWithWethEvents();
                assert.deepStrictEqual(
                    reservedLogs.map(l => [l.user, l.quantity.toNumber()]),
                    [[buyer.address, quantity]]
                );
            });

            it('initiateDrawWithCredits', async () => {
                // mint credits for user
                await poolAdmin.mintCredits(buyer.address, 6, 10);
                await poolAdmin.mintCredits(buyer.address, 3, 10);

                const quantity = 1;
                await poolRelay.drawWithCredits(buyer.address, quantity, [6, 3], [1, 2]);

                const reservation = await poolView.getReservation(buyer.address);
                assert.strictEqual(reservation.user, buyer.address);
                assert.strictEqual(reservation.quantity.toNumber(), quantity);
                assert.strictEqual(reservation.drawsOccurred.toNumber(), 0);

                const balances = await poolView.getCreditsBalance(buyer.address);
                assert.strictEqual(balances[6], 10 - 1);
                assert.strictEqual(balances[3], 10 - 2);

                const reservedLogs = await poolView.getReservedWithCreditsEvents();
                assert.deepStrictEqual(
                    reservedLogs.map(l => [l.user, l.quantity.toNumber()]),
                    [[buyer.address, quantity]]
                );
            });

            it('buyCredits', async () => {
                // set credit fee
                const creditQty = 10;
                await poolAdmin.updateCreditFee(creditQty, '0.5');
                const {fsig, r, s, v} = await getTransferParameters('0.5', creditQty);
                await poolRelay.buyCredits(buyer.address, creditQty, fsig, r, s, v);

                const balances = await poolView.getCreditsBalance(buyer.address);
                assert.strictEqual(balances[12], 10);

                const reservedLogs = await poolView.getBoughtCreditsEvents();
                assert.deepStrictEqual(
                    reservedLogs.map(l => [l.user, l.quantity.toNumber()]),
                    [[buyer.address, 10]]
                );
            });

            describe('fulfillDraw', async () => {
                async function drawAndSetRandom(quantity: number, random: BigNumberish) {
                    const {fsig, r, s, v} = await getTransferParameters('1.0', quantity);
                    await poolRelay.drawWithWeth(buyer.address, quantity, fsig, r, s, v);

                    const {requestId} = await poolView.getReservation(buyer.address);
                    await fulfillRandom(random, requestId);
                }

                type NFTSetting = {
                    ix: 'erc721'|'erc1155'|'credits',
                    tokenId: number,
                    qty: number,
                    tier: number
                }

                async function setupNfts(settings: NFTSetting[]) {
                    const {erc721, erc1155} = await deployNftMocks();
                    mocks.erc721 = erc721;
                    mocks.erc1155 = erc1155;
                    
                    for (const {ix, tokenId, qty, tier} of settings) {
                        switch (ix) {
                            case 'erc721':
                                await mocks.erc721.mint(tokenId);
                                await mocks.erc721.transferFrom(
                                    main.address, sides.nftDispenser.address, tokenId
                                );
                                await poolAdmin.setTier(
                                    mocks.erc721.address, tokenId, false, tier
                                );
                                break;
                            case 'erc1155':
                                for (let i = 0; i < qty; i++) {
                                    await mocks.erc1155.mint(tokenId);
                                }
                                await mocks.erc1155.safeTransferFrom(
                                    main.address, sides.nftDispenser.address, tokenId, qty, '0x'
                                );
                                await poolAdmin.setTier(
                                    mocks.erc1155.address, tokenId, true, tier
                                );
                                break;
                            case 'credits':
                                await poolAdmin.mintCredits(
                                    sides.nftDispenser.address, tokenId, qty
                                );
                                await poolAdmin.setTier(
                                    sides.credits.address, tokenId, true, tier
                                );
                                break;
                        }
                    }
                }
                
                it('emits expected events', async () => {
                    await setupNfts([
                        {ix: 'erc1155', tokenId: 100, qty: 2, tier: 0}
                    ]);
                    await drawAndSetRandom(2, 1);
                    await poolRelay.fulfill(buyer.address, 2);

                    const dispenseLogs = await poolView.getDispensedEvents();
                    assert.deepStrictEqual(
                        dispenseLogs.map(l => `${l.user}|${l.nftAddress}|${l.tokenId.toNumber()}`),
                        Array(2).fill(`${buyer.address}|${mocks.erc1155.address}|${100}`)
                    );

                    const resFulfilledLogs = await poolView.getReservationFulfilledEvents();
                    assert.deepStrictEqual(
                        resFulfilledLogs.map(l => [l.user, l.quantity.toNumber()]),
                        [[buyer.address, 2]]
                    );
                });

                // test ordering is exactly as expected
                // test both "maxToDraw" limit and "drawsOccurred" limit
                // test that drawing not possible if default tier is empty
                //      - drawing can resume once deck is reloaded
                // test with erc721s, erc1155s, and credits
                it('multi-round fulfillment; default tier guaranteed', async () => {
                    const tiers = [10, 5, 20, 3, 3];
                    const randomHexStr = getRandomFromTiers(...tiers);

                    // helper fn
                    async function relevantBalances() {
                        const b721 = (await mocks.erc721.ownerOf(1)) === buyer.address ? 1 : 0;
                        const b1155 = (await mocks.erc1155.balanceOf(buyer.address, 1)).toNumber();
                        const bcreds = (await sides.credits.balanceOf(buyer.address, 1)).toNumber();
                        return {erc721: b721, erc1155: b1155, credits: bcreds};
                    }

                    await setupNfts([
                        {ix: 'credits', tokenId: 1, qty: 1, tier: 0}, // set at tier 0
                        {ix: 'erc1155', tokenId: 1, qty: 1, tier: 8}, // set at tier 8
                        {ix: 'erc721', tokenId: 1, qty: 1, tier: 20} // set at tier 20
                    ]);

                    await drawAndSetRandom(5, randomHexStr);

                    assert.strictEqual(
                        (await poolView.getReservation(buyer.address)).quantity.toNumber(), 5
                    );

                    assert.deepStrictEqual(await relevantBalances(), {
                        erc721: 0, erc1155: 0, credits: 0
                    });

                    // step (1) - expect erc1155
                    await poolRelay.fulfill(buyer.address, 1);
                    assert.deepStrictEqual(await relevantBalances(), {
                        erc721: 0, erc1155: 1, credits: 0
                    });

                    // step (2) - expect credits
                    await poolRelay.fulfill(buyer.address, 1);
                    assert.deepStrictEqual(await relevantBalances(), {
                        erc721: 0, erc1155: 1, credits: 1
                    });

                    // check in
                    let dispenseLogs = await poolView.getDispensedEvents();
                    let res = await poolView.getReservation(buyer.address);
                    assert.strictEqual(dispenseLogs.length, 2);
                    assert.strictEqual(res.drawsOccurred.toNumber(), 2);

                    // step (3) draw again, but with no tier 0s -- expect to skip
                    await poolRelay.fulfill(buyer.address, 2);
                    assert.deepStrictEqual(await relevantBalances(), {
                        erc721: 0, erc1155: 1, credits: 1
                    });

                    // expect the dispensedEvents count and the drawsOccurred count to not change
                    dispenseLogs = await poolView.getDispensedEvents();
                    res = await poolView.getReservation(buyer.address);
                    assert.strictEqual(dispenseLogs.length, 2);
                    assert.strictEqual(res.drawsOccurred.toNumber(), 2);

                    // step (4) - add more credits to default tier
                    await poolAdmin.mintCredits(sides.nftDispenser.address, 1, 100);
                    await poolAdmin.setTier(sides.credits.address, 1, true, 0);

                    // step (5) - expect erc721 + 2 more credits
                    //          * as a catch, ask to draw 8
                    await poolRelay.fulfill(buyer.address, 8);
                    assert.deepStrictEqual(await relevantBalances(), {
                        erc721: 1, erc1155: 1, credits: 3
                    });

                    dispenseLogs = await poolView.getDispensedEvents();
                    res = await poolView.getReservation(buyer.address);
                    assert.strictEqual(dispenseLogs.length, 5); // all 5 drawn
                    assert.strictEqual(res.drawsOccurred.toNumber(), 0); // bc the res is gone

                    const info = await poolView.getNftInfo(sides.credits.address, 1);
                    assert.strictEqual(info.quantity, 98);
                });

                it('selects nfts in the right order', async () => {
                    const tiers = [10, 10, 11];
                    const randomHexStr = getRandomFromTiers(...tiers);

                    // helper fn
                    async function relevantBalances() {
                        const t0 = (await mocks.erc721.ownerOf(0)) === buyer.address ? 1 : 0;
                        const t8 = (await mocks.erc721.ownerOf(8)) === buyer.address ? 1 : 0;
                        const t9 = (await mocks.erc721.ownerOf(9)) === buyer.address ? 1 : 0;
                        const t11 = (await mocks.erc721.ownerOf(11)) === buyer.address ? 1 : 0;
                        return {t0, t8, t9, t11};
                    }

                    await setupNfts([
                        {ix: 'erc721', tokenId: 9, qty: 1, tier: 9},
                        {ix: 'erc721', tokenId: 8, qty: 1, tier: 8},
                        {ix: 'erc721', tokenId: 11, qty: 1, tier: 11},
                        {ix: 'erc721', tokenId: 0, qty: 1, tier: 0}
                    ]);

                    await drawAndSetRandom(3, randomHexStr);

                    await poolRelay.fulfill(buyer.address, 1);
                    assert.deepStrictEqual(await relevantBalances(), {t0: 0, t8: 0, t9: 1, t11: 0});

                    await poolRelay.fulfill(buyer.address, 1);
                    assert.deepStrictEqual(await relevantBalances(), {t0: 0, t8: 1, t9: 1, t11: 0});

                    await poolRelay.fulfill(buyer.address, 1);
                    assert.deepStrictEqual(await relevantBalances(), {t0: 0, t8: 1, t9: 1, t11: 1});
                });

                it('cycles through nfts in the same tier', async () => {
                    async function relevantBalances() {
                        return await Promise.all([1, 2, 3].map(async (tokenId) => {
                            return (
                                await mocks.erc1155.balanceOf(buyer.address, tokenId)
                            ).toNumber();
                        }));
                    }

                    await setupNfts([
                        {ix: 'erc1155', tokenId: 1, qty: 10, tier: 0},
                        {ix: 'erc1155', tokenId: 2, qty: 10, tier: 0},
                        {ix: 'erc1155', tokenId: 3, qty: 10, tier: 0},
                    ]);

                    await drawAndSetRandom(6, 1); // since the random is just 1, then all tiers will be 0

                    await poolRelay.fulfill(buyer.address, 3);
                    assert.deepStrictEqual(await relevantBalances(), [1, 1, 1]);

                    await poolRelay.fulfill(buyer.address, 3);
                    assert.deepStrictEqual(await relevantBalances(), [2, 2, 2]);
                });

                it('stress test - draw 8x, all 32 tier', async () => {
                    // set default tier to have 1000 credits
                    await poolAdmin.mintCredits(sides.nftDispenser.address, 1, 1000);
                    await poolAdmin.setTier(sides.credits.address, 1, true, 0);

                    // random number, 2**256 - 1
                    const unfuckinbelievable = '0x' + Array(64).fill('f').join('');
                    await drawAndSetRandom(8, unfuckinbelievable);

                    const res = await poolRelay.fulfill(buyer.address, 8);
                    console.log('Stress test gas consumption:', res.gasUsed.toNumber());

                    const balance = await poolView.getCreditsBalance(buyer.address);
                    assert.strictEqual(balance[1], 8);
                    // gas usage is expected to be 946785
                    assert.isBelow(res.gasUsed.toNumber(), 10 ** 6);

                    const {user, quantity} = await poolView.getReservation(buyer.address);
                    assert.strictEqual(quantity.toNumber(), 0);
                    assert.strictEqual(user, '0x' + Array(20 * 2).fill('0').join(''));

                    // check reservation logs
                    const reservedLogs = await poolView.getReservedWithWethEvents();
                    assert.deepStrictEqual(
                        reservedLogs.map(l => [l.user, l.quantity.toNumber()]),
                        [[buyer.address, 8]]
                    );

                    // check dispense logs
                    const dispenseLogs = await poolView.getDispensedEvents();
                    assert.strictEqual(dispenseLogs.length, 8);
                    assert(dispenseLogs.every(l => {
                        return (
                            l.user === buyer.address &&
                            l.nftAddress === sides.credits.address &&
                            l.tokenId.toNumber() === 1
                        );
                    }));

                    // check fulfilled logs
                    const resFulfilledLogs = await poolView.getReservationFulfilledEvents();
                    assert.deepStrictEqual(
                        resFulfilledLogs.map(l => [l.user, l.quantity.toNumber()]),
                        [[buyer.address, 8]]
                    );
                });
            });
        });
    });
});
