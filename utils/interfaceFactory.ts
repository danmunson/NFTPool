import {Wallet, getDefaultProvider} from 'ethers';
import {getLiveParams} from '../params/getParams';
import {PoolInterfaceFactory} from './PoolManager';

const {PRIVATE_KEY} = process.env;
const params = getLiveParams();

export async function getInterfaceFactory() {
    const provider = getDefaultProvider(params.PROVIDER_URL);
    await provider.ready;

    const wallet = new Wallet(PRIVATE_KEY!, provider);

    return new PoolInterfaceFactory(
        wallet,
        params.NFTPOOL,
        params.CREDITS,
        params.NFTDISPENSER,
        params.VRFCLIENT
    );
}

export async function getBlockNumber() {
    const provider = getDefaultProvider(params.PROVIDER_URL);
    await provider.ready;

    return await provider.getBlockNumber();
}

export async function getWallet() {
    const provider = getDefaultProvider(params.PROVIDER_URL);
    await provider.ready;
    const wallet = new Wallet(PRIVATE_KEY!, provider);
    return wallet;
}