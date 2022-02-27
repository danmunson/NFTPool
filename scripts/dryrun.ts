import {ethers} from "hardhat";
import {DeploymentParams} from "../params/deployment";

const {NETWORK_KEY} = process.env;

async function main() {
    const args = process.argv.slice(2);
    console.log('ARGS:', args);
    
    const signers = await ethers.getSigners();
    const mainAccount = signers[0];

    console.log(`NETWORK KEY: ${NETWORK_KEY}`);
    console.log(`MAIN ADDRESS: ${mainAccount.address}`);

    console.log(DeploymentParams[NETWORK_KEY!]);
}

main().catch((error) => {
    throw error;
});