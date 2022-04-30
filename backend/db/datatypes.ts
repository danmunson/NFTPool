/* eslint-disable no-unused-vars */

export enum EventTypes {
    wethDraw = 'wethDraw',
    creditDraw = 'creditDraw',
    buyCredits = 'buyCredits', 
};

export enum Collections {
    NFT = 'NFT',
    UserIx = 'UserInteraction',
    Fulfillment = 'Fulfillment',
    Global = 'GlobalState',
};

export type NFTId = {
    address: string,
    token: string,
};

export type NFTData = {
    rarity: number,
    link: {
        url: string,
        source: string,
    },
    metadata: any,
    inDeck: boolean,
};

export type NFT = NFTId & NFTData;
export type InteractionStatus = 'pending'|'canFulfill'|'fulfilled'|'acked';

export type UserInteractionEvent = {
    type: keyof typeof EventTypes,
    transaction: string,
    user: string,
    quantity: number,
    fee: string, // decimal form of eth
    timestamp: number,
    fulfilled: boolean,
    qtyFulfilled: number,
    fulfillmentTransaction: string,
    status: InteractionStatus,
};

export type FulfillEvent = {
    user: string,
    nfts: NFTId[],
    timestamp: number,
    transaction: string,
};

export type GlobalState = {
    lastSeenBlock: number
};
