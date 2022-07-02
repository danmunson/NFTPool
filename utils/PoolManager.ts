import {Contract, Wallet, utils, BigNumberish} from 'ethers';
import PoolInfo from '../artifacts/contracts/Pool/Pool.sol/Pool.json';
import CreditsInfo from '../artifacts/contracts/Pool/Credits.sol/Credits.json';
import NFTDispenserInfo from '../artifacts/contracts/Pool/NFTDispenser.sol/NFTDispenser.json';
import VRFClientInfo from '../artifacts/contracts/Pool/VRFClient.sol/VRFClient.json';
import {
    Credits,
    NFTDispenser,
    Pool,
    VRFClient
} from '../typechain';
import {TypedEventFilter} from '../typechain/common';

type PoolContracts = {
    pool: Pool;
    credits: Credits;
    nftDispenser: NFTDispenser;
    vrfClient: VRFClient;
}

interface IPool {
    wallet?: Wallet;
    contracts: PoolContracts;
}

const validCreditIds = [1, 2, 3, 4, 6, 12];

export class PoolInterfaceFactory implements IPool {
    private _ready: Promise<unknown>;
    wallet: Wallet;
    contracts!: PoolContracts;
    
    constructor(
        wallet: Wallet,
        poolAddress: string,
        creditsAddress: string,
        nftDispenserAddress: string,
        vrfClientAddress: string
    ) {
        this.wallet = wallet;
        this._ready = this.initialize(
            poolAddress, creditsAddress, nftDispenserAddress, vrfClientAddress
        );
    }

    async initialize(
        poolAddress: string,
        creditsAddress: string,
        nftDispenserAddress: string,
        vrfClientAddress: string
    ) {
        const pool = new Contract(poolAddress, PoolInfo.abi, this.wallet) as Pool;
        const credits = new Contract(creditsAddress, CreditsInfo.abi, this.wallet) as Credits;
        const nftDispenser = new Contract(nftDispenserAddress, NFTDispenserInfo.abi, this.wallet) as NFTDispenser;
        const vrfClient = new Contract(vrfClientAddress, VRFClientInfo.abi, this.wallet) as VRFClient;
        this.contracts = {pool, credits, nftDispenser, vrfClient};

        // pre-load deployment data so it's faster when needed
        return await Promise.all([
            pool.deployed(),
            credits.deployed(),
            nftDispenser.deployed(),
            vrfClient.deployed()
        ]);
    }

    async makePoolAdmin() {
        await this._ready;
        return new PoolAdmin(this.contracts);
    }

    async makePoolView() {
        await this._ready;
        return new PoolView(this.contracts);
    }

    async makePoolRelay() {
        await this._ready;
        return new PoolRelay(this.contracts);
    }

}

export class PoolRelay implements IPool {
    public contracts: PoolContracts;

    constructor(contracts: PoolContracts) {
        this.contracts = contracts;
    }

    /** BUY **/

    async drawWithWeth(
        user: string,
        quantity: number,
        functionSignature: string,
        sigR: string,
        sigS: string,
        sigV: number
    ) {
        const tx = await this.contracts.pool.initiateDrawWithWeth(
            user, quantity, functionSignature, sigR, sigS, sigV
        );
        return await tx.wait();
    }

    async drawWithCredits(
        user: string,
        quantity: number,
        tokenIds: number[],
        amounts: number[]
    ) {
        const tx = await this.contracts.pool.initiateDrawWithCredits(
            user, quantity, tokenIds, amounts
        );
        return await tx.wait();
    }

    async buyCredits(
        user: string,
        quantity: number,
        functionSignature: string,
        sigR: string,
        sigS: string,
        sigV: number
    ) {
        const tx = await this.contracts.pool.buyCredits(
            user, quantity, functionSignature, sigR, sigS, sigV
        );
        return await tx.wait();
    }

    /** FULFILL **/

    async fulfill(user: string, maxToDraw: number) {
        const tx = await this.contracts.pool.fulfillDraw(user, maxToDraw);
        return await tx.wait();
    }
}

export class PoolAdmin implements IPool {
    public contracts: PoolContracts;

    constructor(contracts: PoolContracts) {
        this.contracts = contracts;
    }

    /** POOL **/

    async updateFeeRecipient(newRecipient: string) {
        const tx = await this.contracts.pool.updateFeeRecipient(newRecipient);
        return await tx.wait();
    }

    async updateDrawFee(newFee: string) {
        const newFeeBn = utils.parseEther(newFee);
        const tx = await this.contracts.pool.updateDrawFee(newFeeBn);
        return await tx.wait();
    }

    async updateCreditFee(quantity: number, newFee: string) {
        const newFeeBn = utils.parseEther(newFee);
        const tx = await this.contracts.pool.updateCreditFee(quantity, newFeeBn);
        return await tx.wait();
    }

    async refundUser(user: string) {
        const tx = await this.contracts.pool.refundUser(user);
        return await tx.wait();
    }

    /** CREDITS **/

    async mintCredits(user: string, tokenId: number, quantity: number) {
        if (!validCreditIds.includes(tokenId)) {
            throw new Error(`Invalid tokenId ${tokenId}`);
        }
        const tx = await this.contracts.credits.mintCredits(
            user, tokenId, quantity
        );
        return await tx.wait();
    }

    async setUris(tokenUri: string, contractUri: string) {
        const tx = await this.contracts.credits.setUris(tokenUri, contractUri);
        return await tx.wait();
    }

    /** NFTDISPENSER **/

    async setTier(
        nftAddress: string,
        tokenId: BigNumberish,
        isErc1155: boolean,
        tier: number
    ) {
        const tx = await this.contracts.nftDispenser.setTier(
            nftAddress, tokenId, isErc1155, tier
        );
        return await tx.wait();
    }

    async forceTransferNft(
        nftAddress: string,
        tokenId: BigNumberish,
        isErc1155: boolean,
        recipient: string
    ) {
        const tx = await this.contracts.nftDispenser.adminForceTransferNft(
            nftAddress, tokenId, isErc1155, recipient
        );
        return await tx.wait();
    }

    async forceRemoveNft(nftAddress: string, tokenId: BigNumberish) {
        const tx = await this.contracts.nftDispenser.adminForceRemoveNft(
            nftAddress, tokenId
        );
        return await tx.wait();
    }

    /** VRFCLIENT **/

    async updateVrfFee(newFee: BigNumberish) {
        const tx = await this.contracts.vrfClient.updateFee(newFee);
        return await tx.wait();
    }

    async updateKeyhash(keyhash: string) {
        const tx = await this.contracts.vrfClient.updateKeyhash(keyhash);
        return await tx.wait();
    }
    
}

export class PoolView implements IPool {
    public contracts: PoolContracts;

    constructor(contracts: PoolContracts) {
        this.contracts = contracts;
    }

    /** POOL **/

    async canFulfillReservation(user: string) {
        return await this.contracts.pool.canFulfillReservation(user);
    }

    async getFeeRecipient() {
        return await this.contracts.pool.feeRecipient();
    }

    async getDrawFee() {
        return await this.contracts.pool.drawFee();
    }

    async getCreditFee(quantity: number) {
        return await this.contracts.pool.creditFeeByQuantity(quantity);
    }

    async getReservation(userAddress: string) {
        const [
            user, quantity, drawsOccurred
        ] = await this.contracts.pool.getReservationDetails(userAddress);
        const [
            requestId, randomSeed, computedRarities
        ] = await this.contracts.pool.getPrivateReservationDetails(userAddress);
        return {user, quantity, drawsOccurred, requestId, randomSeed, computedRarities};
    }

    /** CREDITS **/

    async getCreditsBalance(user: string) {
        const balances = await this.contracts.credits.balanceOfBatch(
            validCreditIds.map(x => user), validCreditIds
        );
        const returnMap: Record<number, number> = {};
        validCreditIds.forEach((id, idx) => {
            returnMap[id] = balances[idx].toNumber()
        });

        return returnMap;
    }

    async getUris() {
        const contractUri = await this.contracts.credits.contractURI();
        const tokenUri = await this.contracts.credits.uri(1);
        return {contractUri, tokenUri};
    }

    /** NFTDISPENSER **/

    async getActiveTiers() {
        return await this.contracts.nftDispenser.getActiveTiers();
    }

    async getIndexesByTier(tier: number) {
        return await this.contracts.nftDispenser.getIndexesByTier(tier);
    }

    async getNftInfo(nftAddress: string, nftTokenId: BigNumberish) {
        const [
            address, tokenId, isErc1155, quantity, tier, index
        ] = await this.contracts.nftDispenser.getNftInfo(nftAddress, nftTokenId);

        return {
            address, tokenId, isErc1155,
            quantity: quantity.toNumber(),
            tier: tier.toNumber(),
            index: index.toNumber()
        };
    }

    /** VRFCLIENT **/

    async vrfFee() {
        return await this.contracts.vrfClient.fee();
    }

    async vrfKeyhash() {
        return await this.contracts.vrfClient.keyHash();
    }

    /** EVENTS **/

    async getDispensedEvents(fromBlock?: number) {
        const filter = this.contracts.nftDispenser.filters.Dispensed();
        const events = await this.contracts.nftDispenser.queryFilter(filter, fromBlock);
        return events.map(event => {
            const {args, transactionHash, blockNumber} = event;
            const [user, nftAddress, tokenId] = args;
            return {user, nftAddress, tokenId, transactionHash, blockNumber};
        });
    }

    private async _getPoolEvents(filter: TypedEventFilter<any, any>, fromBlock?: number) {
        const events = await this.contracts.pool.queryFilter(filter, fromBlock);
        return events.map(event => {
            const {args, transactionHash, blockNumber} = event;
            const [user, quantity] = args;
            return {user, quantity, transactionHash, blockNumber};
        });
    }

    async getReservedWithWethEvents(fromBlock?: number) {
        const filter = this.contracts.pool.filters.ReservedWithWeth();
        return await this._getPoolEvents(filter, fromBlock);
    }

    async getReservedWithCreditsEvents(fromBlock?: number) {
        const filter = this.contracts.pool.filters.ReservedWithCredits();
        return await this._getPoolEvents(filter, fromBlock);
    }

    async getBoughtCreditsEvents(fromBlock?: number) {
        const filter = this.contracts.pool.filters.BoughtCredits();
        return await this._getPoolEvents(filter, fromBlock);
    }

    async getReservationFulfilledEvents(fromBlock?: number) {
        const filter = this.contracts.pool.filters.ReservationFulfilled();
        return await this._getPoolEvents(filter, fromBlock);
    }
}