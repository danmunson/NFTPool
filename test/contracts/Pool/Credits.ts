import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect, assert } from "chai";
import { ethers } from "hardhat";
import { Credits } from "../../../typechain/Credits";

const TOKEN_URI = 'https://uri.com/{id}';
const CONTRACT_URI = 'https://uri.com/contract';
const THRESHOLD = 12;
const validTokens = [1, 2, 3, 4, 6, 12];

describe('Credits NFT', async () => {
    let main: SignerWithAddress;
    let alt: SignerWithAddress;
    let credits: Credits;

    async function mintCredits(to: string, tokenId: number, qty: number) {
        await (await credits.mintCredits(to, tokenId, qty)).wait();
    }

    async function mintAllTokensForUser(user: string, qty: number) {
        for (const tokenId of validTokens) {
            await mintCredits(user, tokenId, qty);
        }
    }

    async function spendCredits(user: string, qty: number, tokens: number[], amounts: number[]) {
        await (await credits.spendCredits(user, qty, tokens, amounts)).wait();
    }

    async function tokenBalances(user: string): Promise<Map<number, number>> {
        const repeatAddress = validTokens.map(_ => user);
        const balances = await credits.balanceOfBatch(repeatAddress, validTokens);
        const balanceMap = new Map();
        for (let i = 0; i < balances.length; i++) {
            balanceMap.set(validTokens[i], balances[i].toNumber());
        }
        return balanceMap;
    }

    async function transfer(from: string, to: string, tokenId: number, qty: number) {
        await (await credits.safeTransferFrom(from, to, tokenId, qty, "0x")).wait()
    }

    async function batchTransfer(from: string, to: string, tokenIds: number[], qtys: number[]) {
        await (await credits.safeBatchTransferFrom(from, to, tokenIds, qtys, "0x")).wait()
    }

    beforeEach(async () => {
        const signers = await ethers.getSigners();
        main = signers[0];
        alt = signers[1];

        const Credits = await ethers.getContractFactory('Credits');
        credits = await Credits.deploy(main.address, TOKEN_URI, CONTRACT_URI);
        await credits.deployed();
    });

    describe('mints credits', async () => {
        it('mints credits for address', async () => {
            await mintAllTokensForUser(alt.address, 100);

            const balances = await tokenBalances(alt.address);
            for (const tokenId of validTokens) {
                assert.strictEqual(balances.get(tokenId), 100);
            }
        });

        it('does not mint tokenId above threshold', async () => {
            // succeeds
            await (await credits.mintCredits(alt.address, THRESHOLD, 1)).wait();
            // fails
            await expect(
                credits.mintCredits(alt.address, THRESHOLD + 1, 1)
            ).to.be.revertedWith('Token ID not allowed');
        });

        // explicit test but it's nice to be clear
        it('does not mint 0 credit', async () => {
            await expect(
                credits.mintCredits(alt.address, 0, 1)
            ).to.be.revertedWith('Token ID not allowed');
        });

        it('does not mint tokens that do not divide the threshold', async () => {
            for (let tokenId = 0; tokenId <= THRESHOLD; tokenId++) {
                if (THRESHOLD % tokenId === 0) {
                    await mintCredits(alt.address, tokenId, 1);
                } else {
                    await expect(
                        credits.mintCredits(alt.address, tokenId, 1)
                    ).to.be.revertedWith('Token ID not allowed');
                }
            }
        });
    })

    describe('spends credits', async () => {
        describe('spends credits for address', async () => {
            beforeEach(async () => {
                await mintAllTokensForUser(alt.address, 100);
            });

            it('12x1 | 6x2 | 4x3', async () => {
                const tokensAndAmounts = [
                    [12, 1],
                    [6, 2],
                    [4, 3],
                ];

                for (const [n1, n2] of tokensAndAmounts) {
                    // do it both ways
                    await spendCredits(alt.address, 1, [n1], [n2]);
                    await spendCredits(alt.address, 1, [n2], [n1]);
                }

                const balances = await tokenBalances(alt.address);
                assert.strictEqual(balances.get(12), 100 - 1);
                assert.strictEqual(balances.get(6), 100 - 2);
                assert.strictEqual(balances.get(4), 100 - 3);
                assert.strictEqual(balances.get(3), 100 - 4);
                assert.strictEqual(balances.get(2), 100 - 6);
                assert.strictEqual(balances.get(1), 100 - 12);
            });
            
            it('1+2+3+6', async () => {
                const tokens = [1, 2, 3, 6];
                const amounts = tokens.map(_ => 1);
                await spendCredits(alt.address, 1, tokens, amounts);
                const balances = await tokenBalances(alt.address);
                assert.strictEqual(balances.get(6), 100 - 1);
                assert.strictEqual(balances.get(3), 100 - 1);
                assert.strictEqual(balances.get(2), 100 - 1);
                assert.strictEqual(balances.get(1), 100 - 1);
            });

            it('purchase quantity greater than 1', async () => {
                const tokens = [1, 2, 3, 4, 6, 12];
                const amounts = tokens.map(_ => 100);
                await spendCredits(alt.address, 10, tokens, amounts);
                const balances = await tokenBalances(alt.address);
                for (const balance of balances.values()) {
                    assert.strictEqual(balance, 0);
                }
            });
        });

        it('fails if tokenIds and amounts are not even', async () => {
            await expect(
                credits.spendCredits(alt.address, 1, [1], [2, 3])
            ).to.be.revertedWith('Tokens and amounts uneven');
        });

        it('fails if credits do not amount to threshold', async () => {
            await mintAllTokensForUser(alt.address, 10);
            const tokens = [1, 4];
            const amounts = [2, 2];

            await expect(
                credits.spendCredits(alt.address, 1, tokens, amounts)
            ).to.be.revertedWith('Credits are insufficient');
        });

        it('fails if credits do not amount to multiplied threshold', async () => {
            await mintAllTokensForUser(alt.address, 10);
            const tokens = [12, 4, 3];
            const amounts = [9, 1, 1];

            await expect(
                credits.spendCredits(alt.address, 10, tokens, amounts)
            ).to.be.revertedWith('Credits are insufficient');
        });

        it('fails if user does not have enough', async () => {
            await mintAllTokensForUser(alt.address, 1);
            const tokens = [4];
            const amounts = [3];

            await expect(
                credits.spendCredits(alt.address, 1, tokens, amounts)
            ).to.be.revertedWith('ERC1155: burn amount exceeds balance');
        });

        // relies on the fact that these tokens can't exist,
        // so by definition their balances will be 0
        it('ignores non-existent tokenIds', async () => {
            await mintAllTokensForUser(alt.address, 10);
            const tokens = [10];
            const amounts = [5];

            await expect(
                credits.spendCredits(alt.address, 1, tokens, amounts)
            ).to.be.revertedWith('ERC1155: burn amount exceeds balance');
        });
    });

    describe('views', async () => {
        it('threshold', async () => {
            const threshold = await credits.threshold();
            assert.strictEqual(threshold.toNumber(), THRESHOLD);
        });
    });

    describe('implements all expected NFT functionality', async () => {
        it('uri', async () => {
            const uri = await credits.uri(2);
            assert.strictEqual(uri, TOKEN_URI);
        });

        it('contractURI', async () => {
            const uri = await credits.contractURI();
            assert.strictEqual(uri, CONTRACT_URI);
        });

        it('balanceOf', async () => {
            await mintCredits(alt.address, 12, 5);
            const balance12 = await credits.balanceOf(alt.address, 12);
            assert.strictEqual(balance12.toNumber(), 5);
        });

        it('balanceOfBatch', async () => {
            await mintAllTokensForUser(alt.address, 10);
            const balances = await tokenBalances(alt.address);
            assert.strictEqual(balances.size, validTokens.length);
            for (const balance of balances.values()) {
                assert.strictEqual(balance, 10);
            }
        });

        it('safeTransferFrom', async () => {
            await mintCredits(main.address, 12, 5);
            await transfer(main.address, alt.address, 12, 2);

            const mainBalances = await tokenBalances(main.address);
            assert.strictEqual(mainBalances.get(12), 3);

            const altBalances = await tokenBalances(alt.address);
            assert.strictEqual(altBalances.get(12), 2);
        });

        it('safeBatchTransferFrom', async () => {
            await mintCredits(main.address, 12, 5);
            await mintCredits(main.address, 6, 5);
            await batchTransfer(main.address, alt.address, [12, 6], [2, 2]);

            const mainBalances = await tokenBalances(main.address);
            assert.strictEqual(mainBalances.get(12), 3);
            assert.strictEqual(mainBalances.get(6), 3);

            const altBalances = await tokenBalances(alt.address);
            assert.strictEqual(altBalances.get(12), 2);
            assert.strictEqual(altBalances.get(6), 2);
        });

        it('setApprovalForAll | isApprovedForAll', async () => {
            await mintCredits(main.address, 12, 5);

            await expect(
                credits.connect(alt).safeTransferFrom(main.address, alt.address, 12, 1, '0x')
            ).to.be.revertedWith('ERC1155: caller is not owner nor approved');

            await (await credits.setApprovalForAll(alt.address, true)).wait();

            // implicit check of isApprovedForAll
            await (
                await credits.connect(alt).safeTransferFrom(main.address, alt.address, 12, 1, '0x')
            ).wait();

            const mainBalances = await tokenBalances(main.address);
            assert.strictEqual(mainBalances.get(12), 4);

            const altBalances = await tokenBalances(alt.address);
            assert.strictEqual(altBalances.get(12), 1);
        });

        describe('restricted to owner and admin', async () => {
            it('safeTransferFrom', async () => {
                await expect(
                    credits.safeTransferFrom(alt.address, main.address, 12, 1, '0x')
                ).to.be.revertedWith('ERC1155: caller is not owner nor approved');
            });

            it('safeBatchTransferFrom', async () => {
                await expect(
                    credits.safeBatchTransferFrom(alt.address, main.address, [12], [1], '0x')
                ).to.be.revertedWith('ERC1155: transfer caller is not owner nor approved');
            });
        });
    });

    describe('admin only', async () => {
        it('mintCredits', async () => {
            await expect(
                credits.connect(alt).mintCredits(alt.address, 12, 1)
            ).to.be.revertedWith('Must be admin');
        });

        it('spendCredits', async () => {
            await expect(
                credits.connect(alt).spendCredits(alt.address, 1, [12], [1])
            ).to.be.revertedWith('Must be admin');
        });
    });
});