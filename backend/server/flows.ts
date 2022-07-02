import {getGlobals} from './globals';
import * as actions from './actions';
import {WethDrawInput} from "./inputTypes";

export async function wethDrawFlow(input: WethDrawInput) {
    const transaction = await actions.submitWethDraw(input);
    if (!transaction) throw new Error('transaction failed');

    const globals = await getGlobals();
    const {user, quantity} = input;
    const {drawFee} = await globals.getGlobalState();
    
    await globals.models.userInteractionEvent.set({
        type: 'wethDraw',
        transaction,
        user,
        quantity,
        fee: drawFee,
        timestamp: Date.now(),
        fulfilled: false,
        qtyFulfilled: 0,
        fulfillmentTransaction: '',
        status: 'pending',
    });

    return transaction;
}

export async function fulfillFlow(user: string) {
    const {transaction, draws} = await actions.submitFulfillDraw(user);
    if (!transaction || !draws.length) throw new Error('transaction failed');

    const globals = await getGlobals();

    const nfts = draws.map(({nftAddress, tokenId}) => ({
        address: nftAddress,
        token: tokenId.toString(),
    }));

    const nftSavePromises = nfts.map(async ({address, token}) => {
        await globals.models.nft.set({address, token, inDeck: false});
        return await globals.models.nft.getOne({address, token});
    });

    await globals.models.fulfillEvent.set({
        user,
        nfts,
        timestamp: Date.now(),
        transaction,
    });

    const nftData = await Promise.all([...nftSavePromises]);
    return {transaction, nftData};
}