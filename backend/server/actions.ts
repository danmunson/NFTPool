import {retry} from "./utils";
import {ContractReceipt} from "ethers";
import {WethDrawInput} from "./inputTypes";
import {getGlobals} from "./globals";

export async function submitWethDraw(input: WethDrawInput) {
    const globals = await getGlobals();

    const {user, quantity, functionSignature, sigR, sigS, sigV} = input;

    const fn = async () => {
        return await globals.relay.drawWithWeth(user, quantity, functionSignature, sigR, sigS, sigV);
    };

    const receipt = await retry<ContractReceipt>(fn, [1000, 2000]);
    if (receipt === undefined) {
        throw new Error('Transaction Failed');
    }

    const {transactionHash} = receipt;
    return transactionHash;
}

export async function submitFulfillDraw(user: string) {
    const globals = await getGlobals();

    const reservation = await globals.views.getReservation(user);
    const quantity = reservation.quantity.toNumber();
    const drawsOccurred = reservation.drawsOccurred.toNumber();

    if (quantity === 0) {
        throw new Error('Reservation does not exist');
    }

    const fn = async () => {
        return await globals.relay.fulfill(user, quantity - drawsOccurred);
    };

    const receipt = await retry<ContractReceipt>(fn, [1000, 2000]);
    if (receipt === undefined) {
        throw new Error('Transaction Failed');
    }

    const {blockNumber, transactionHash} = receipt;
    const dispensedEvents = await globals.views.getDispensedEvents(blockNumber - 1);
    const draws = dispensedEvents.filter((event) => (
        event.blockNumber === blockNumber && event.user === user
    ));

    return {transaction: transactionHash, draws};
}

export type userDeckStates = 'none'|'pendingRandom'|'canFulfill';

export async function getUserState(user: string): Promise<userDeckStates> {
    const globals = await getGlobals();
    const reservation = await globals.views.getReservation(user);
    if (!reservation.quantity.toNumber()) {
        return 'none';
    } else if (reservation.randomSeed.toNumber() === 0) {
        return 'pendingRandom';
    } else {
        return 'canFulfill';
    }
}
