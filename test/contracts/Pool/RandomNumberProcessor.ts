import { expect, assert } from "chai";
import { ethers } from "hardhat";
import { RandomNumberProcessor } from "../../../typechain";

const max32Bit = (2 ** 32) - 1;
const eightNumbers = [0, 1, 2, 3, 4, 5, 6, 7].map(x => max32Bit - x);

// converts a number to a 32-bit hex string
function numTo32BitHexStr(num: number) {
    return num.toString(16).padStart(8, '0');
}

function makeUint256(numbers: number[]) {
    return '0x' + numbers.map(numTo32BitHexStr).join('').padStart(64, '0');
}

describe('RandomNumberProcessor', async () => {
    let RNP: RandomNumberProcessor;

    before(async () => {
        // only need to deploy once, contract is stateless
        const RandomNumberProcessor = await ethers.getContractFactory('RandomNumberProcessor');
        RNP = await RandomNumberProcessor.deploy();
        await RNP.deployed();
    });

    describe('_getMask', async () => {
        async function testMask(inclusiveStart: number, exclusiveEnd: number) {
            const mask = await RNP._getMask(inclusiveStart, exclusiveEnd);
            const maskBinaryString = mask.toBigInt().toString(2).padStart(256, '0');
            // reverse the string so that we deal with little end first
            const reversedString = maskBinaryString.split('').reverse().join('');
            for (let i = 0; i < reversedString.length; i++) {
                const bit = reversedString[i];
                const expectedBit = i >= inclusiveStart && i < exclusiveEnd ? '1' : '0';
                assert.strictEqual(bit, expectedBit, `Wrong bit at ${i}`);
            }
        }

        it('returns correct mask if exclusiveEnd < 256', async () => {
            await testMask(0, 50);
            await testMask(32, 64);
            await testMask(128, 164);

            // sanity check
            const mask = await RNP._getMask(2, 6);
            const maskBinaryString = mask.toBigInt().toString(2).padStart(256, '0');
            assert.strictEqual(
                maskBinaryString,
                Array(250).fill('0').join('') + '111100'
            );
        });

        it('returns correct mask if exclusiveEnd == 256', async () => {
            await testMask(224, 256);
            await testMask(0, 256);

            // sanity check
            const mask = await RNP._getMask(250, 256);
            const maskBinaryString = mask.toBigInt().toString(2).padStart(256, '0');
            assert.strictEqual(
                maskBinaryString,
                '111111' + Array(250).fill('0').join('')
            );
        });

        // NOTE: Hardhat currently returns the wrong error message,
        //      "Error: Transaction reverted: library was called directly"
        // making it impossible to test this
        it.skip('fails if exclusiveEnd > 256', async () => {
            await expect(
                RNP._getMask(0, 257)
            ).to.be.revertedWith('exclusiveEnd > 256');
        });
    });

    describe('_getSliceFromUint', async () => {
        it('gets correct slices from uint256', async () => {
            const randomNumber = makeUint256(eightNumbers);
            let inclusiveStart = 0;
            const numBits = 32;

            // reverse order, since the first number will appear at the big end of the random number, etc.
            for (const number of eightNumbers.slice().reverse()) {
                const slicedNumber = await RNP._getSliceFromUint(randomNumber, inclusiveStart, numBits);
                assert.strictEqual(slicedNumber.toNumber(), number);
                inclusiveStart += numBits;
            }

            assert.strictEqual(inclusiveStart, numBits * eightNumbers.length);
        });
    });

    describe('_getRarity', async () => {
        it('binary string check', async () => {
            const expectedRarities: any = {
                '11111111111111111111111111111111' : 32,
                '11111111111111111111111111111110' : 31,
                '11111111111111111111111111111100' : 30,
                '11111111111111111111111111000000' : 26,
                '11111111111111111110000000000000' : 19,
                '11111111111111111110000000000001' : 19,
                '11111111111111111100001000000001' : 18,
                '11111111111111110000000000010001' : 16,
                '00000000000000000000000000000000' : 0,
                '01000000000000000000000000000000' : 0,
                '01000000000000000000000000000001' : 0,
                '10000000000000000000000000000000' : 1,
                '11010000000000000000000000000000' : 2,
                '11111110100000000000000000000000' : 7,
            };

            const keys = Object.keys(expectedRarities);
            for (const key of keys) {
                const keyNum = parseInt(key, 2);
                const rarity = await RNP._getRarity(keyNum);
                const expectedRarity = expectedRarities[key];
                assert.strictEqual(rarity.toNumber(), expectedRarity);
            }
        });
        
        it('numerical check', async () => {
            const expectedRarities = [
                [2 ** 31, 1],
                [2 ** 30, 0],
                [2 ** 31 + 2 ** 30, 2],
                [2 ** 31 + 2 ** 29, 1],
                [2 ** 31 + 2 ** 30 + 2 ** 29 + 2 ** 28, 4],
            ];

            for (const [num, expectedRarity] of expectedRarities) {
                const rarity = await RNP._getRarity(num);
                assert.strictEqual(rarity.toNumber(), expectedRarity);
            }
        });
    });

    describe('getRarityLevels', async () => {
        const testvals = [
            ['11111111111111111111111111111111', 32],
            ['11111111111111111111111111111101', 30],
            ['11111111111111110000000000010001', 16],
            ['00000000000000000000000000000000', 0],
            ['01000000000000000000000000000001', 0],
            ['11111110100000000000000000000000', 7],
            ['11111111111111111100001000000001', 18],
            ['11111111111111111111111111111111', 32]
        ];

        it('full inputs pt 1', async () => {
            const random = makeUint256(testvals.map(x => parseInt((x as any)[0], 2)));
            const expectedRarities = testvals.map(x => x[1]).reverse();
            const rarities = await RNP.getRarityLevels(random, 8);
            for (let i = 0; i < rarities.length; i++) {
                assert.strictEqual(rarities[i].toNumber(), expectedRarities[i]);
            }
        });

        it('full inputs pt 2', async () => {
            const random = makeUint256(eightNumbers);
            const expectedRarities = [32, 31, 30, 30, 29, 29, 29, 29].reverse();
            const rarities = await RNP.getRarityLevels(random, 8);
            for (let i = 0; i < rarities.length; i++) {
                assert.strictEqual(rarities[i].toNumber(), expectedRarities[i]);
            }
        });

        it('partial inputs pt 1', async () => {
            const numRequested = 3;
            const random = makeUint256(testvals.map(x => parseInt((x as any)[0], 2)));
            const expectedRarities = testvals.map(x => x[1]).reverse();
            const rarities = await RNP.getRarityLevels(random, numRequested);
            for (let i = 0; i < rarities.length; i++) {
                if (i < numRequested) {
                    assert.strictEqual(rarities[i].toNumber(), expectedRarities[i]);
                } else {
                    assert.strictEqual(rarities[i].toNumber(), 0);
                }
            }
        });

        it('partial inputs pt 2', async () => {
            const random = makeUint256([2 ** 32 - 1]);
            const expectedRarity = 32;
            const rarities = await RNP.getRarityLevels(random, 1);
            assert.strictEqual(rarities[0].toNumber(), expectedRarity);
        });

        it('exponential growth check', async () => {
            const inputs = [];
            for (let i = 1; i < 2 ** 7; i++) {
                // start with 31 (avoid confusion with single 32)
                inputs.push([max32Bit - i]);
            }

            const expectedRarities = [];
            for (let i = 0; i <= 6; i++) {
                // add an exponentially increasing number of values
                for (let j = 0; j < 2 ** i; j++) {
                    expectedRarities.push(31 - i);
                }
            }

            assert.strictEqual(inputs.length, 127);
            assert.strictEqual(expectedRarities.length, 127);

            for (let i = 0; i < inputs.length; i++) {
                const random = makeUint256(inputs[i]);
                const expectedRarity = expectedRarities[i];
                const rarities = await RNP.getRarityLevels(random, 1);
                assert.strictEqual(rarities[0].toNumber(), expectedRarity);
            }

        });

        it.skip('Requested count too high', async () => {
            await expect(
                RNP.getRarityLevels(12345, 10)
            ).to.be.revertedWith('exclusiveEnd > 256');
        });
    });
});