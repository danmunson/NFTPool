import {getInterfaceFactory} from "../../utils/interfaceFactory";
import {MetaTxTypedData} from '../../utils/metaTxHelpers';
import {Logger} from "ethers/lib/utils";
// import {getWethBalance} from "../../utils/getWethBalance";

const {CALL_EXCEPTION, UNPREDICTABLE_GAS_LIMIT} = Logger.errors;

function isBadTx(errcode: string) {
    return errcode === CALL_EXCEPTION || errcode === UNPREDICTABLE_GAS_LIMIT;
}

export async function retry<T>(
    fn: () => Promise<T>,
    delays: number[]
): Promise<T|undefined> {
    let returnValue: T;
    for (const delay of [0].concat(delays)) {
        try {
            returnValue = await fn();
            break;
        } catch(error) {
            // TODO: log error
            if (isBadTx(error.code)) {
                // this indicates the transaction cannot succeed
                break;
            } else {
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
        }
    }
    return returnValue || undefined;
}

/**
 * NOTE: ignore validation for now, add in later if need be
 */

/**
 * Validate that the transaction will succeed:
 *  1. Signature is correct
 *  2. Function signature is correct
 *  3. User has a sufficient balance
 */
export async function validateWethPurchase(data: MetaTxTypedData) {
    // const factory = await getInterfaceFactory();
    // const views = await factory.makePoolView();
    // const fee = 

    // const userWethBalance = 
    return true;
}

// Validate that the user has a sufficient credits balance
export async function validateCreditDraw(user: string, tokenIds: number[], amounts: number[]) {
    const factory = await getInterfaceFactory();
    const views = await factory.makePoolView();

    const balances = await views.getCreditsBalance(user);
    for (let i = 0; i < tokenIds.length; i++) {
        if (balances[tokenIds[i]] < amounts[i]) {
            throw new Error('Insufficient credits');
        }
    }
    return true;
}