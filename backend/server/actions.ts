import {retry} from "./utils";
import {getInterfaceFactory} from "../../utils/interfaceFactory";
import {ContractReceipt} from "ethers";

export async function submitWethDraw(
    user: string,
    quantity: number,
    functionSignature: string,
    sigR: string,
    sigS: string,
    sigV: number
) {
    const factory = await getInterfaceFactory();
    const relay = await factory.makePoolRelay();

    const fn = async () => {
        return await relay.drawWithWeth(user, quantity, functionSignature, sigR, sigS, sigV);
    };

    const receipt = await retry<ContractReceipt>(fn, [1000, 2000]);
    if (receipt === undefined) {
        throw new Error('Transaction Failed');
    }

    const {transactionHash} = receipt;
    return transactionHash;
}

export async function submitCreditDraw(
    user: string,
    quantity: number,
    tokenIds: number[],
    amounts: number[]
) {
    const factory = await getInterfaceFactory();
    const relay = await factory.makePoolRelay();

    const fn = async () => {
        return await relay.drawWithCredits(user, quantity, tokenIds, amounts);
    };

    const receipt = await retry<ContractReceipt>(fn, [1000, 2000]);
    if (receipt === undefined) {
        throw new Error('Transaction Failed');
    }

    const {transactionHash} = receipt;
    return transactionHash;
}

export async function submitBuyCredits(
    user: string,
    quantity: number,
    functionSignature: string,
    sigR: string,
    sigS: string,
    sigV: number
) {
    const factory = await getInterfaceFactory();
    const relay = await factory.makePoolRelay();

    const fn = async () => {
        return await relay.buyCredits(user, quantity, functionSignature, sigR, sigS, sigV);
    };

    const receipt = await retry<ContractReceipt>(fn, [1000, 2000]);
    if (receipt === undefined) {
        throw new Error('Transaction Failed');
    }

    const {transactionHash} = receipt;
    return transactionHash;
}

export async function submitFulfillDraw(user: string) {
    const factory = await getInterfaceFactory();
    const relay = await factory.makePoolRelay();
    const views = await factory.makePoolView();

    const reservation = await views.getReservation(user);
    const quantity = reservation.quantity.toNumber();
    const drawsOccurred = reservation.drawsOccurred.toNumber();

    if (quantity === 0) {
        throw new Error('Reservation does not exist');
    }

    const fn = async () => {
        return await relay.fulfill(user, quantity - drawsOccurred);
    };

    const receipt = await retry<ContractReceipt>(fn, [1000, 2000]);
    if (receipt === undefined) {
        throw new Error('Transaction Failed');
    }

    const {blockNumber, transactionHash} = receipt;
    const dispensedEvents = await views.getDispensedEvents(blockNumber - 1);
    const draws = dispensedEvents.filter((event) => (
        event.blockNumber === blockNumber && event.user === user
    ));

    return {transactionHash, draws};
}

export async function getUserState() {

}