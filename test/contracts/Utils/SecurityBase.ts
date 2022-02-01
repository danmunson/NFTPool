import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect, assert } from "chai";
import { ethers } from "hardhat";
import { Secured } from "../../../typechain";

describe('SecurityBase', async () => {
    let eoa: SignerWithAddress;
    let contractAdmin: SignerWithAddress;
    let alt: SignerWithAddress;
    let secureContract: Secured;

    beforeEach(async () => {
        const signers = await ethers.getSigners();
        eoa = signers[0];
        contractAdmin = signers[1];
        alt = signers[2];

        const Secured = await ethers.getContractFactory('Secured');
        secureContract = await Secured.deploy(eoa.address, contractAdmin.address);
        await secureContract.deployed();
    });

    it('noReentry', async () => {
        await expect(
            secureContract.testReentry()
        ).to.be.revertedWith('Contract is locked');
    });

    it('eoaAdminOnly', async () => {
        const shouldBeTrue = await secureContract.connect(eoa).eoaView();
        assert.strictEqual(shouldBeTrue, true);

        await expect(
            secureContract.connect(contractAdmin).eoaView()
        ).to.be.revertedWith('Must be admin');

        await expect(
            secureContract.connect(alt).eoaView()
        ).to.be.revertedWith('Must be admin');
    });

    it('contractAdminOnly', async () => {
        const shouldBeTrue = await secureContract.connect(contractAdmin).contractView();
        assert.strictEqual(shouldBeTrue, true);

        await expect(
            secureContract.connect(eoa).contractView()
        ).to.be.revertedWith('Must be admin');

        await expect(
            secureContract.connect(alt).contractView()
        ).to.be.revertedWith('Must be admin');
    });

    it('anyAdmin', async () => {
        let shouldBeTrue = await secureContract.connect(eoa).anyAdminView();
        assert.strictEqual(shouldBeTrue, true);

        shouldBeTrue = await secureContract.connect(contractAdmin).anyAdminView();
        assert.strictEqual(shouldBeTrue, true);

        await expect(
            secureContract.connect(alt).anyAdminView()
        ).to.be.revertedWith('Must be admin');
    });

    it('isContract', async () => {
        const shouldBeTrue = await secureContract.isContract();
        assert.strictEqual(shouldBeTrue, true);
    });
});