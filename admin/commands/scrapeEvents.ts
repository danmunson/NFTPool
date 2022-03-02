import {getBlockNumber, getInterfaceFactory} from "../../utils/interfaceFactory";

const OFFSET = 1000;

export async function scrapeEvents(args: any) {
    const blockNumber = await getBlockNumber();
    console.log('Block Number:', blockNumber, '\n');

    const fromBlock = blockNumber - OFFSET;

    const factory = await getInterfaceFactory();
    const views = await factory.makePoolView();

    const creditResEvents = await views.getReservedWithCreditsEvents(fromBlock);
    console.log('Reservations Fulfilled:', creditResEvents, '\n');

    const reservationsFulfilled = await views.getReservationFulfilledEvents(fromBlock);
    console.log('Reservations Fulfilled:', reservationsFulfilled, '\n');
}