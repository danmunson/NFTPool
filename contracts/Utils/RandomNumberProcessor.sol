// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.0;

library RandomNumberProcessor {
    uint internal constant BITMASK_LENGTH = 32;
    uint internal constant MAX_SLICES = 8; // = 256/32

    /*
    Given a random uint256, slice it up into 32-bit numbers and return respective rarities
    */
    function getRarityLevels(
        uint random,
        uint numRequested
    ) internal pure returns (uint[MAX_SLICES] memory) {

        require(numRequested <= MAX_SLICES, "Requested count too high");

        uint[MAX_SLICES] memory rarityLevels;

        uint[MAX_SLICES] memory slices = _getSlices(random, numRequested);
        for (uint i = 0; i < numRequested; i++) {
            rarityLevels[i] = _getRarity(slices[i]);
        }

        return rarityLevels;
    }

    /* UTILS */

    /*
    Given a 32 bit integer, get "rarity" on a scale from 0 to 32

    A number X has a rarity level of R if R is the highest number such that
        X >= Sum[i=0 -> R] { 2 ** (32-i) }

    At each iteration, the probability that a number is larger than the current
    sum will decrease by a factor of 2.

    Example progression:
        (big endian binary) | 0000  ->  1000    ->   1100   ->   1110   ->  1111
        (decimal additions) | 0     +  2^(3-0)  +  2^(3-1)  +  2^(3-2)  +  2^(3-3)
    */
    function _getRarity(uint number) internal pure returns (uint) {
        uint rarityLevel = 0;
        uint rarityMagnitude = 0;
        for (uint i = 1; i <= BITMASK_LENGTH; i++) {
            // set the i-th largest bit in the 32-bit number to 1
            rarityMagnitude += (2 ** (BITMASK_LENGTH - i));
            // each iteration, difficulty increases by a factor of 2
            if (number >= rarityMagnitude) {
                rarityLevel = i;
            } else {
                break;
            }
        }
        return rarityLevel;
    }

    /*
    Given a random 256-bit integer, return up to eight 32-bit slices of the number
    */
    function _getSlices(
        uint random,
        uint numOfSlices
    ) internal pure returns (uint[MAX_SLICES] memory) {

        uint[MAX_SLICES] memory slices;

        for (uint count = 0; count < numOfSlices; count++) {
            uint inclusiveStart = count * BITMASK_LENGTH;
            uint slice = _getSliceFromUint(random, inclusiveStart, BITMASK_LENGTH);
            slices[count] = slice;
        }

        return slices;
    }

    /*
    Take a slice of a uint and return it as a number (indexes are LITTLE ENDIAN)
        e.g. 
            slice(110101, 0, 3) => 101
            slice(110101, 3, 6) => 110

    Note that ((2**256) - 1) is fine to calculate, since overflow doesn't occur on intermediate values
    */
    function _getSliceFromUint(
        uint number,
        uint inclusiveStart, // >= 0
        uint numBits // <= 256
    ) internal pure returns (uint) {
        
        uint exclusiveEnd = inclusiveStart + numBits;
        // create the mask for the specified positions
        uint mask = _getMask(inclusiveStart, exclusiveEnd);
        // get slice with AND
        uint slice = number & mask;
        // shift left by inclusiveStart bits and return
        return slice >> inclusiveStart;
    }

    function _getMask(
        uint inclusiveStart,
        uint exclusiveEnd
    ) internal pure returns (uint) {
        require(exclusiveEnd <= 256, "exclusiveEnd > 256");
        uint mask;
        if (exclusiveEnd == 256) {
            // avoid an overflow (with hardhat testing environment)
            mask = ((2 ** (exclusiveEnd - 1)) - 1) + (2 ** (exclusiveEnd - 1));
        } else {
            mask = (2 ** exclusiveEnd) - 1;
        }
        mask -= (2 ** inclusiveStart) - 1;
        return mask;
    }

}