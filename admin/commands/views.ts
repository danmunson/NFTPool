import {getLiveParams} from "../../params/getParams";
import {getInterfaceFactory} from "../../utils/interfaceFactory";

const params = getLiveParams();

/**
 * Views:
 *  - "active Tiers"
 *  - "indexes by tier"
 *  - "nft info" for Credits
 */
export async function views(args: any) {
    const {user} = args;

    const factory = await getInterfaceFactory();
    const views = await factory.makePoolView();

    const dispenserCredits = await views.getCreditsBalance(user || params.NFTDISPENSER);
    console.log('Dispenser Credits:', dispenserCredits, '\n');

    const tiersToCounts: any = {};
    const activeTiers = (await views.getActiveTiers()).map(
        (x, idx) => x ? idx + 1 : 0
    ).filter(Boolean).map(x => x - 1);
    for (const activeTier of activeTiers) {
        const numIndexes = (await views.getIndexesByTier(activeTier)).toNumber();
        tiersToCounts[activeTier] = numIndexes;
    }
    console.log('Active Tiers and Counts:', tiersToCounts, '\n');

    const creditTokenInfo: any = {};
    for (const creditToken of Object.keys(dispenserCredits)) {
        const {quantity, tier} = await views.getNftInfo(params.CREDITS, creditToken);
        if (quantity > 0) creditTokenInfo[creditToken] = {tier, quantity};
    }
    console.log('Credits Info:', creditTokenInfo, '\n');

    const reservation = await views.getReservation(user || params.SIGNER_ADDRESS);
    const canBeFulfilled = await views.canFulfillReservation(user || params.SIGNER_ADDRESS);
    console.log('Reservation by Signer:', {canBeFulfilled, ...reservation}, '\n');
}