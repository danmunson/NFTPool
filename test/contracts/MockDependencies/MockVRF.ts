import { assert, expect } from "chai";
import { ethers } from "hardhat";
import { utils } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

describe("MockVRF", function () {
  let main: SignerWithAddress;

  before(async () => {
      main = (await ethers.getSigners())[0];
  });

  it('Oracle can deposit random value in consumer', async () => {
    const VRFOracle = await ethers.getContractFactory("MockVRFOracle");
    const oracle = await VRFOracle.deploy();
    await oracle.deployed();

    const VRFConsumer = await ethers.getContractFactory("TestVRFConsumer");
    const consumer = await VRFConsumer.deploy();
    await consumer.deployed();

    const key = '0x000000000000000000000000000000000000000000000000000000000000ffff';
    const randomTx = await oracle.submitRandomness(
        consumer.address,
        key,
        12345,
    );
    await randomTx.wait();

    const randomAtKey = await consumer.randoms(key);
    const randomStr = randomAtKey.toString();

    assert.strictEqual(randomStr, '12345');
  });

  it('mock link checks balances before transfer', async () => {
    const LINK = await ethers.getContractFactory("MockLINK");
    const link = await LINK.deploy();
    await link.deployed();

    const setTx = await link.setBalance(main.address, utils.parseEther('1.0'));
    await setTx.wait();

    const firstTransferTx = await link.transferAndCall(
      '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      utils.parseEther('1.0'),
      '0x0001',
    );
    await firstTransferTx.wait();

    // try second transfer but confirm it fails
    await expect(link.transferAndCall(
      '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      utils.parseEther('1.0'),
      '0x0001',
    )).to.be.revertedWith('Fee exceeds balance');
  });
});