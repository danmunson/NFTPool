import {Contract} from 'ethers';
import wethAbi from './abi/weth.json';
import {getDeploymentParams} from '../params/getParams';
import {getWallet} from './interfaceFactory';
import {MockWETH} from '../typechain';

export async function getWethBalance(user: string) {
    const {WETH_ADDRESS} = getDeploymentParams()
    const wallet = await getWallet();
    const weth = new Contract(WETH_ADDRESS, wethAbi, wallet) as MockWETH;
    const balance = await weth.balanceOf(user);
    return balance;
}
