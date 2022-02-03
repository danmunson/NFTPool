import { BigNumber, Contract, Wallet, utils } from 'ethers';
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

type PoolContracts = {
    pool: Pool;
    credits: Credits;
    nftDispenser: NFTDispenser;
    vrfClient: VRFClient;
}

interface IPool {
    wallet: Wallet;
    contracts: PoolContracts;
}

export class PoolInterfaceFactory implements IPool {
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
        this.initialize(
            poolAddress, creditsAddress, nftDispenserAddress, vrfClientAddress
        );
    }

    initialize(
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
        Promise.all([
            pool.deployed(),
            credits.deployed(),
            nftDispenser.deployed(),
            vrfClient.deployed()
        ]);
    }

    makePoolAdmin() {
        return new PoolAdmin(this.wallet, this.contracts);
    }

}

export class PoolAdmin implements IPool {
    public wallet: Wallet;
    public contracts: PoolContracts;

    constructor(wallet: Wallet, contracts: PoolContracts) {
        this.wallet = wallet;
        this.contracts = contracts;
    }

    async updateFeeRecipient(newRecipient: string) {
        await this.contracts.pool.deployed();
        const tx = await this.contracts.pool.updateFeeRecipient(newRecipient);
        await tx.wait();
    }

    async updateDrawFee(newFee: string) {
        const newFeeBn = utils.parseEther(newFee);
        await this.contracts.pool.deployed();
        const tx = await this.contracts.pool.updateDrawFee(newFeeBn);
        await tx.wait();
    }

    async updateCreditFee(quantity: number, newFee: string) {
        const newFeeBn = utils.parseEther(newFee);
        await this.contracts.pool.deployed();
        const tx = await this.contracts.pool.updateCreditFee(quantity, newFeeBn);
        await tx.wait();
    }
}
