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
            transferTx = await erc1155.safeTransferFrom(from, to, token.tokenId, 1, '0x'); 
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
            tier: info[4],
            index: info[5].toNumber(),
        }
    }

    before(async () => {
        const signers = await ethers.getSigners();
        mainAcct = signers[0];
        altAcct = signers[1];
    });

    beforeEach(async () => {
        const NFTDispenser = await ethers.getContractFactory("NFTDispenser");
        nftDispenser = await NFTDispenser.deploy(mainAcct.address);
        await nftDispenser.deployed();

        tokens = [];

        const MockERC721 = await ethers.getContractFactory("MockERC721");
        erc721 = await MockERC721.deploy();
        await erc721.deployed();
        for (let i = 1; i <= 3; i ++) {
            const tx = await erc721.mint(i);
            await tx.wait();
            tokens.push({
                address: erc721.address,
                tokenId: i,
                isErc1155: false,
            });
        }

        const MockERC1155 = await ethers.getContractFactory("MockERC1155");
        erc1155 = await MockERC1155.deploy();
        await erc1155.deployed();
        // qty = 3, spread out over 2 tokens
        for (const i of [1, 1, 2]) {
            const tx = await erc1155.mint(i);
            await tx.wait();
            tokens.push({
                address: erc1155.address,
                tokenId: i,
                isErc1155: true,
            });
        }
    });

    describe('should accept ownership of nfts', async () => {
        it('accepts transfers', async () => {
            await transfer(tokens[0], mainAcct.address, nftDispenser.address); // ERC721
            assert(await ownsToken(nftDispenser.address, tokens[0]));

            await transfer(tokens[1], mainAcct.address, nftDispenser.address, true); // ERC721 unsafe transfer
            assert(await ownsToken(nftDispenser.address, tokens[1]));

            await transfer(tokens[5], mainAcct.address, nftDispenser.address); //  ERC1155
            assert(await ownsToken(nftDispenser.address, tokens[5]));
        });
    });

    describe('setTier and view functions', async () => {
        it('sets tokens in the same tier', async () => {
            // NOTE: implicit test of setTier
            await initializeTokens(true);

            const tiers = await nftDispenser.getActiveTiers();
            assert.strictEqual(tiers.filter((x: boolean) => x).length, 1);

            const nftsInPlay = await nftDispenser.getNftsInPlay();
            assert.strictEqual(nftsInPlay.toNumber(), 6);
            
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

            const nftsInPlay = await nftDispenser.getNftsInPlay();
            // there should still be 6 tokens in play
            assert.strictEqual(nftsInPlay.toNumber(), 6);

            // expect tier 4 to have been skipped
            const countOfTier4 = await nftDispenser.getIndexesByTier(4);
            assert.strictEqual(countOfTier4.toNumber(), 0);
            const countOfTier5 = await nftDispenser.getIndexesByTier(5);
            assert.strictEqual(countOfTier5.toNumber(), 1);

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

        it('refuses to set the same ERC721 token twice', async () => {
            await initializeTokens(false);
            const token = tokens[0];
            await expect(
                nftDispenser.setTier(token.address, token.tokenId, token.isErc1155, 1)
            ).to.be.revertedWith('ERC721 is already tracked');
        });
    });

    describe('dispense', async () => {
        it('will dispense an nft it owns and clear from storage');
        it('will not fail if dispensing an nft it does not own, and will clear from storage');
        it('can dispense all NFTs in a tier successfully');
        it('will fail if attempt to dispense nft at greater index than exists');
    });

    describe('admin functions', async () => {

    });
});