import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect, assert } from "chai";
import { ethers } from "hardhat";
import { NFTDispenser, MockERC1155, MockERC721 } from "../../../typechain";

type Token = {
    address: string,
    tokenId: number,
    isErc1155: boolean,
};

describe('NFTDispenser', async () => {
    let mainAcct: SignerWithAddress;
    let altAcct: SignerWithAddress;
    let nftDispenser: NFTDispenser;
    let erc721: MockERC721;
    let erc1155: MockERC1155;
    let tokens: Token[];

    async function transfer(
        token: Token, from: string, to: string, erc721UnsafeTransfer?: boolean
    ) {
        let transferTx: any;
        if (token.isErc1155) {
            const balance = (await erc1155.balanceOf(from, token.tokenId)).toNumber();
            transferTx = await erc1155.safeTransferFrom(from, to, token.tokenId, balance, '0x'); 
        } else {
            if (erc721UnsafeTransfer) {
                transferTx = await erc721['safeTransferFrom(address,address,uint256)'](from, to, token.tokenId);
            } else {
                transferTx = await erc721.transferFrom(from, to, token.tokenId);
            }
        }
        await transferTx.wait();
    }

    /*
    transfers a token and sets it's tier.
        * NOTE: implicitly tests the onXYZReceived functionality
    */
    async function transferAndSetTier(token: Token, tier: number) {
        await transfer(token, mainAcct.address, nftDispenser.address);
        const tierTx = await nftDispenser.setTier(
            token.address,
            token.tokenId,
            token.isErc1155,
            tier
        );
        await tierTx.wait();
    }

    async function initializeTokens(sameTier: boolean) {
        let count = 0;
        for (const token of tokens) {
            const tier = sameTier ? 0 : count;
            await transferAndSetTier(token, tier);
            count++;
        }
    }

    async function ownsToken(address: string, token: Token): Promise<boolean> {
        if (token.isErc1155) {
            const balance = await erc1155.balanceOf(address, token.tokenId);
            return balance.toNumber() > 0;
        } else {
            const owner = await erc721.ownerOf(token.tokenId);
            return owner === address;
        }
    }

    async function getNftInfo(token: Token) {
        const info = await nftDispenser.getNftInfo(token.address, token.tokenId);
        return {
            address: info[0],
            tokenId: info[1].toNumber(),
            isErc1155: info[2],
            quantity: info[3].toNumber(),
            tier: info[4].toNumber(),
            index: info[5].toNumber(),
        }
    }

    /**
     * 
     * 
     * SETUP
     * 
     */

    before(async () => {
        const signers = await ethers.getSigners();
        mainAcct = signers[0];
        altAcct = signers[1];
    });

    beforeEach(async () => {
        const NFTDispenser = await ethers.getContractFactory("NFTDispenser");
        nftDispenser = await NFTDispenser.deploy(mainAcct.address);
        await nftDispenser.deployed();

        const MockERC721 = await ethers.getContractFactory("MockERC721");
        erc721 = await MockERC721.deploy();
        await erc721.deployed();

        const MockERC1155 = await ethers.getContractFactory("MockERC1155");
        erc1155 = await MockERC1155.deploy();
        await erc1155.deployed();

        /**
         * MINT:
         *  erc721 tokens
         *      #1, #2, #3
         *  erc1155 tokens
         *      #1 x2
         *      #2 x1
         */

        tokens = [];

        for (let i = 1; i <= 3; i ++) {
            await (await erc721.mint(i)).wait();
            tokens.push({address: erc721.address, tokenId: i, isErc1155: false});
        }

        await (await erc1155.mint(1)).wait();
        await (await erc1155.mint(1)).wait();
        tokens.push({address: erc1155.address, tokenId: 1, isErc1155: true});
        // confirm double balance
        assert.strictEqual((await erc1155.balanceOf(mainAcct.address, 1)).toNumber(), 2);

        await (await erc1155.mint(2)).wait();
        tokens.push({address: erc1155.address, tokenId: 2, isErc1155: true});
    });

    /**
     * 
     * TESTS
     * 
     */

    describe('should accept ownership of nfts', async () => {
        it('accepts transfers', async () => {
            await transfer(tokens[0], mainAcct.address, nftDispenser.address); // ERC721
            assert(await ownsToken(nftDispenser.address, tokens[0]));

            await transfer(tokens[1], mainAcct.address, nftDispenser.address, true); // ERC721 unsafe transfer
            assert(await ownsToken(nftDispenser.address, tokens[1]));

            await transfer(tokens[4], mainAcct.address, nftDispenser.address); //  ERC1155
            assert(await ownsToken(nftDispenser.address, tokens[4]));
        });
    });

    describe('setTier and view functions', async () => {
        it('sets tokens in the same tier', async () => {
            // NOTE: implicit test of setTier
            await initializeTokens(true);

            const tiers = await nftDispenser.getActiveTiers();
            assert.strictEqual(tiers.filter((x: boolean) => x).length, 1);
            
            for (const token of tokens) {
                const info = await getNftInfo(token);
                assert.strictEqual(info.address, token.address);
                assert.strictEqual(info.tokenId, token.tokenId);
                assert.strictEqual(info.isErc1155, token.isErc1155);

                // confirm double token
                assert(!(info.address === erc1155.address && info.tokenId === 1) || info.quantity === 2);
            }

            const countOfTier0 = await nftDispenser.getIndexesByTier(0);
            // since one of the tokens has quantity of 2, we only expect 5 indexes
            assert.strictEqual(countOfTier0.toNumber(), 5);
        });

        it('sets tokens in different tiers, does not change tier of token that already exists', async () => {
            // NOTE: implicit test of setTier
            await initializeTokens(false);

            const tiers = await nftDispenser.getActiveTiers();
            // 5 tiers should be active since one of the NFTs is "duplicated"
            assert.strictEqual(tiers.filter((x: boolean) => x).length, 5);

            // expect all tiers to have 1 spot
            for (let i = 0; i < 5; i++) {
                const countOfTier = await nftDispenser.getIndexesByTier(4);
                assert.strictEqual(countOfTier.toNumber(), 1);
            }

            // expect double token to be tier 3
            const doubleToken = tokens.find(token => token.isErc1155 && token.tokenId === 1)!;
            const info = await getNftInfo(doubleToken);
            assert.strictEqual(info.tier, 3);
        });

        it('refuses to set tier if not owner of token', async () => {
            const token = tokens[0];
            await expect(
                nftDispenser.setTier(token.address, token.tokenId, token.isErc1155, 1)
            ).to.be.revertedWith('Not owner of NFT');
        });

        it('rejects if tier > 32', async () => {
            const token = tokens[0];
            await expect(
                nftDispenser.setTier(token.address, token.tokenId, token.isErc1155, 33)
            ).to.be.revertedWith('Largest tier is 32');
        });
    });

    describe('dispense', async () => {

        it('can dispense all NFTs in a tier successfully', async () => {
            await initializeTokens(true);
            for (let i = 0; i < 6; i++) {
                await nftDispenser.dispenseNft(0, 0, mainAcct.address);
            }
            
            const activeTiers = await nftDispenser.getActiveTiers();
            assert.deepStrictEqual(activeTiers, Array(33).fill(false));

            const indexes = await Promise.all([0,1,2,3,4].map(async (i) => {
                return (await nftDispenser.getIndexesByTier(i)).toNumber();
            }));
            assert.deepStrictEqual(indexes, Array(5).fill(0));

            for (const token of tokens) {
                const info = await getNftInfo(token);
                assert.deepStrictEqual(info, {
                    address: '0x0000000000000000000000000000000000000000',
                    index: 0,
                    isErc1155: false,
                    quantity: 0,
                    tier: 0,
                    tokenId: 0
                });
                assert(await ownsToken(mainAcct.address, token));
            }
        });

        it('will not fail if dispensing an nft it does not own, and will clear from storage', async () => {
            const token = tokens[0];
            await transferAndSetTier(token, 0);
            // wouldn't exist on actual NFT, just here for testing
            await (await erc721.transferOverride(
                nftDispenser.address, mainAcct.address, token.tokenId
            )).wait();
            assert(await ownsToken(mainAcct.address, token));

            // nft dispenser no longer controls token, but it is still registered
            assert.strictEqual((await nftDispenser.getIndexesByTier(0)).toNumber(), 1);
            await (await nftDispenser.dispenseNft(0, 0, altAcct.address)).wait();

            // confirm main account is still owner, but registered nft is gone
            assert(await ownsToken(mainAcct.address, token));
            assert.strictEqual((await nftDispenser.getIndexesByTier(0)).toNumber(), 0);
        });
        
        it('will fail if attempt to dispense nft at greater index than exists in a tier', async () => {
            await expect(
                nftDispenser.dispenseNft(0, 0, mainAcct.address)
            ).to.be.revertedWith('Not enough NFTs in tier');
        });

        it('will dispense only one of a multi-quantity NFT', async () => {
            const multiToken = tokens.find(token => token.isErc1155 && token.tokenId === 1)!;
            await transferAndSetTier(multiToken, 0);

            assert(!(await ownsToken(mainAcct.address, multiToken)));
            assert.strictEqual((await nftDispenser.getIndexesByTier(0)).toNumber(), 1);

            // dispense
            await (await nftDispenser.dispenseNft(0, 0, mainAcct.address)).wait();

            // confirm main account is still owner, but registered nft is gone
            assert.strictEqual(
                (await erc1155.balanceOf(mainAcct.address, multiToken.tokenId)).toNumber(), 1
            );
            assert.strictEqual(
                (await erc1155.balanceOf(nftDispenser.address, multiToken.tokenId)).toNumber(), 1
            );
            assert.strictEqual((await nftDispenser.getIndexesByTier(0)).toNumber(), 1);
        });
    });

    describe('admin functions', async () => {
        describe('force transfer', async () => {
            it('will transfer and untrack an ERC721', async () => {
                const token = tokens[0];
                await transferAndSetTier(token, 0);

                assert(!(await ownsToken(mainAcct.address, token)));
                assert.strictEqual((await nftDispenser.getIndexesByTier(0)).toNumber(), 1);

                // admin force transfer
                await (await nftDispenser.adminForceTransferNft(
                    token.address, token.tokenId, token.isErc1155, mainAcct.address
                )).wait();

                assert((await ownsToken(mainAcct.address, token)));
                assert.strictEqual((await nftDispenser.getIndexesByTier(0)).toNumber(), 0);
            });

            it('will transfer all units of an ERC1155', async () => {
                const multiToken = tokens.find(token => token.isErc1155 && token.tokenId === 1)!;
                await transferAndSetTier(multiToken, 0);

                assert(!(await ownsToken(mainAcct.address, multiToken)));
                assert.strictEqual((await nftDispenser.getIndexesByTier(0)).toNumber(), 1);

                // admin force transfer
                await (await nftDispenser.adminForceTransferNft(
                    multiToken.address, multiToken.tokenId, multiToken.isErc1155, mainAcct.address
                )).wait();

                // check that main account owns all tokens
                assert.strictEqual(
                    (await erc1155.balanceOf(mainAcct.address, multiToken.tokenId)).toNumber(), 2
                );
                assert.strictEqual(
                    (await erc1155.balanceOf(nftDispenser.address, multiToken.tokenId)).toNumber(), 0
                );
                assert.strictEqual((await nftDispenser.getIndexesByTier(0)).toNumber(), 0);
            });

            it('will transfer an nft even if not tracked', async () => {
                const token = tokens[0];
                await transfer(token, mainAcct.address, nftDispenser.address);

                assert(!(await ownsToken(mainAcct.address, token)));

                // admin force transfer
                await (await nftDispenser.adminForceTransferNft(
                    token.address, token.tokenId, token.isErc1155, mainAcct.address
                )).wait();

                assert((await ownsToken(mainAcct.address, token)));
            });

            it('will untrack an nft if tracked but not owned', async () => {
                const token = tokens[0];
                await transferAndSetTier(token, 0);
                // wouldn't exist on actual NFT, just here for testing
                await (await erc721.transferOverride(
                    nftDispenser.address, mainAcct.address, token.tokenId
                )).wait();
                assert(await ownsToken(mainAcct.address, token));

                assert.strictEqual((await nftDispenser.getIndexesByTier(0)).toNumber(), 1);

                await (await nftDispenser.adminForceTransferNft(
                    token.address, token.tokenId, token.isErc1155, mainAcct.address
                )).wait();

                assert(await ownsToken(mainAcct.address, token));
                assert.strictEqual((await nftDispenser.getIndexesByTier(0)).toNumber(), 0);
            });
        });

        // most cases are covered above
        describe('force remove', async () => {
            it('will properly untrack an nft in the last index', async () => {
                await initializeTokens(true);
                const token = tokens[tokens.length - 1];

                // confirm token is in last index and is only quantity = 1
                const indexCount = (await nftDispenser.getIndexesByTier(0)).toNumber();
                const info = await getNftInfo(token);
                assert.strictEqual(info.index, indexCount - 1);
                assert.strictEqual(info.quantity, 1);

                // remove
                await (await nftDispenser.adminForceRemoveNft(
                    token.address, token.tokenId
                )).wait();

                // assert nftDispenser still owns token
                assert(await ownsToken(nftDispenser.address, token));

                // assert token was removed
                const newIndexCount = (await nftDispenser.getIndexesByTier(0)).toNumber();
                assert.strictEqual(newIndexCount, indexCount - 1);
                const newInfo = await getNftInfo(token);
                assert.deepStrictEqual(newInfo, {
                    address: '0x0000000000000000000000000000000000000000',
                    index: 0,
                    isErc1155: false,
                    quantity: 0,
                    tier: 0,
                    tokenId: 0
                });
            });

            it('will properly untrack an nft in the first index', async () => {
                await initializeTokens(true);
                const token = tokens[0];

                // confirm token is in last index and is only quantity = 1
                const indexCount = (await nftDispenser.getIndexesByTier(0)).toNumber();
                const info = await getNftInfo(token);
                assert.strictEqual(info.index, 0);
                assert.strictEqual(info.quantity, 1);

                // remove
                await (await nftDispenser.adminForceRemoveNft(
                    token.address, token.tokenId
                )).wait();

                // assert nftDispenser still owns token
                assert(await ownsToken(nftDispenser.address, token));

                // assert token was removed
                const newIndexCount = (await nftDispenser.getIndexesByTier(0)).toNumber();
                assert.strictEqual(newIndexCount, indexCount - 1);
                const newInfo = await getNftInfo(token);
                assert.deepStrictEqual(newInfo, {
                    address: '0x0000000000000000000000000000000000000000',
                    index: 0,
                    isErc1155: false,
                    quantity: 0,
                    tier: 0,
                    tokenId: 0
                });
            });

            it('attempt on an untracked nft is a no-op', async () => {
                // have not yet transferred tokens
                const token = tokens[0];
                assert(!(await ownsToken(nftDispenser.address, token)));
                await (await nftDispenser.adminForceRemoveNft(
                    token.address, token.tokenId
                )).wait();
            });

            it('can unset and reset tier', async () => {
                await initializeTokens(false);
                let activeTiers = await nftDispenser.getActiveTiers();
                assert.deepStrictEqual(
                    activeTiers,
                    [true, true, true, true, true].concat(Array(33 - 5).fill(false))
                );

                const token = tokens[0];
                let info = await getNftInfo(token);
                assert.strictEqual(info.tier, 0);

                // remove token
                await (await nftDispenser.adminForceRemoveNft(
                    token.address, token.tokenId
                )).wait();

                // setToken to 6th tier
                await (await nftDispenser.setTier(
                    token.address, token.tokenId, token.isErc1155, 5
                )).wait();

                // confirm that token has moved tiers
                activeTiers = await nftDispenser.getActiveTiers();
                assert.deepStrictEqual(
                    activeTiers,
                    [false, true, true, true, true, true].concat(Array(33 - 6).fill(false))
                );
                info = await getNftInfo(token);
                assert.strictEqual(info.tier, 5);
            });
        })
    });

    describe('require ownership for external functions', async () => {
        it('setTier', async () => {
            const token = tokens[0];
            await expect(
                nftDispenser.connect(altAcct).setTier(token.address, token.tokenId, token.isErc1155, 0)
            ).to.be.revertedWith('Must be admin');
        });

        it('dispenseNft', async () => {
            await expect(
                nftDispenser.connect(altAcct).dispenseNft(0, 0, mainAcct.address)
            ).to.be.revertedWith('Must be admin');
        });

        it('adminForceTransferNft', async () => {
            const token = tokens[0];
            await expect(
                nftDispenser.connect(altAcct).adminForceTransferNft(
                    token.address, token.tokenId, token.isErc1155, mainAcct.address
                )
            ).to.be.revertedWith('Must be admin');
        });

        it('adminForceRemoveNft', async () => {
            const token = tokens[0];
            await expect(
                nftDispenser.connect(altAcct).adminForceRemoveNft(
                    token.address, token.tokenId
                )
            ).to.be.revertedWith('Must be admin');
        });

    });
});