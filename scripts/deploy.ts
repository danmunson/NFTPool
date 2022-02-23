import {ethers} from "hardhat";
import {DeploymentParams} from "./DeploymentParams";

const {NETWORK_KEY} = process.env;

if (!NETWORK_KEY) {
    throw new Error('NETWORK_KEY UNDEFINED');
} else {
    console.log(`NETWORK KEY: ${NETWORK_KEY}`)
}

const {
    LINK_ADDRESS,
    ORACLE_ADDRESS,
    KEYHASH,
    FEE,
    DRAW_FEE,
    CREDITS_TOKEN_URI,
    CREDITS_CONTRACT_URI,
} = DeploymentParams[NETWORK_KEY];

// MUMBAI LINK FAUCET
// https://faucets.chain.link/mumbai

/**
 * Mock dependencies need to be deployed for the contract to function
 *  1. MockWETH
 *  2. MockERC721
 *  3. MockERC1155
 */
async function deployMockDependencies() {
    const MockWETH = await ethers.getContractFactory('MockWETH');
    const weth = await MockWETH.deploy();
    await weth.deployed();
    console.log(`WETH: ${weth.address}`);

    const MockERC721 = await ethers.getContractFactory('MockERC721');
    const erc721 = await MockERC721.deploy();
    await erc721.deployed();
    console.log(`ERC721: ${erc721.address}`);

    const MockERC1155 = await ethers.getContractFactory('MockERC1155');
    const erc1155 = await MockERC1155.deploy();
    await erc1155.deployed();
    console.log(`ERC1155: ${erc1155.address}`);

    return {weth, erc721, erc1155};
}

async function main() {
    const signers = await ethers.getSigners();
    const mainAccount = signers[0];

    console.log(`SIGNER ADDRESS: ${mainAccount.address}\n`);

    const {weth} = await deployMockDependencies();

    const NFTPool = await ethers.getContractFactory('Pool');
    const nftPool = await NFTPool.deploy(
        mainAccount.address, // _eoaAdmin
        mainAccount.address, // _feeRecipient
        ethers.utils.parseEther(DRAW_FEE), // _drawFee
        CREDITS_TOKEN_URI, // _tokenUri
        CREDITS_CONTRACT_URI, // _contractUri
        ORACLE_ADDRESS, // _vrfOracleAddress
        LINK_ADDRESS, // _linkTokenAddress
        ethers.utils.parseEther(FEE), // _vrfFee
        KEYHASH, // _vrfKeyHash
        weth.address // _wethAddress
    );
    await nftPool.deployed();
    console.log(`NFTPOOL: ${nftPool.address}`);

    const [
        credits, nftdispenser, vrfclient, wethmanager,
    ] = await nftPool.getSideContractAddresses();

    console.log(`CREDITS: ${credits}`);
    console.log(`NFTDISPENSER: ${nftdispenser}`);
    console.log(`VRFCLIENT: ${vrfclient}`);
    console.log(`WETHMANAGER: ${wethmanager}`);
}

main().catch((error) => {
    console.log(error);
    throw error;
});