import {
    NFT,
    Collections,
    UserInteractionEvent,
    FulfillEvent,
    GlobalState
} from './datatypes';
import {get, upsert} from './core';

export async function createNFT(nft: NFT) {
    const {address, token} = nft;
    const existingNft = await get<NFT>(Collections.NFT, {address, token});

    if (!existingNft) {
        await upsert<NFT>(Collections.NFT, nft);
    } else {
        throw new Error(`NFT ${address}:${token} already exists`);
    }
}

async function deactivateNft(address: string, token: string) {
    const existingNft = await get<NFT>(Collections.NFT, {address, token});
    existingNft.inDeck = false;
    await upsert<NFT>(Collections.NFT, existingNft);
}

export async function registerUserIx(uix: UserInteractionEvent) {
    const {user} = uix;
    const liveUix = await get<UserInteractionEvent>(
        Collections.UserIx, {user, fulfilled: false}
    );

    if (!liveUix) {
        await upsert<UserInteractionEvent>(Collections.UserIx, uix);
    } else {
        throw new Error(`An unfulfilled interaction exists for user ${user}`);
    }
}

export async function registerFulfillment(fulfillment: FulfillEvent) {
    const {user, nfts, transaction} = fulfillment;
    const liveUix = await get<UserInteractionEvent>(
        Collections.UserIx, {user, fulfilled: false}
    );

    if (!liveUix) {
        // TODO: log
        throw new Error(`No unfulfilled interaction exists for user ${user}`);
    }

    liveUix.fulfillmentTransactions.push(transaction);
    liveUix.qtyFulfilled += nfts.length;
    if (liveUix.qtyFulfilled === liveUix.quantity) {
        liveUix.fulfilled = true;
    }

    await upsert<UserInteractionEvent>(Collections.UserIx, liveUix);
    await upsert<FulfillEvent>(Collections.Fulfillment, fulfillment);

    for (const {address, token} of nfts) {
        await deactivateNft(address, token);
    }
}

export async function getLastSeenBlock(): Promise<number> {
    const global = await get<GlobalState>(Collections.Global, {});
    return global.lastSeenBlock;
}

export async function updateLastSeenBlock(lastSeenBlock: number): Promise<void> {
    await upsert<GlobalState>(Collections.Global, {lastSeenBlock});
}