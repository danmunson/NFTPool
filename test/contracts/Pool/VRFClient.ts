import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect, assert } from "chai";
import { ethers } from "hardhat";
import { 
    MockLINK,
    MockVRFOracle,
    TestVRFClientHost,
    VRFClient
} from "../../../typechain";

describe('VRFClient', async () => {
    let link: MockLINK;
    let oracle: MockVRFOracle;
    let host: TestVRFClientHost;
    let eoaAdmin: SignerWithAddress;
    let alt: SignerWithAddress;
    let vrfClient: VRFClient;

    const startingBalance = 100;
    const fee = 10;
    const keyhash = '0xdeadbeef12345678deadbeef12345678deadbeef12345678deadbeef12345678'; // bytes32

    beforeEach(async () => {
        const signers = await ethers.getSigners();
        eoaAdmin = signers[0];
        alt = signers[1];
        // deploy test/mock contracts
        const MockLINK = await ethers.getContractFactory('MockLINK');
        link = await MockLINK.deploy();
        await link.deployed();

        const MockVRFOracle = await ethers.getContractFactory('MockVRFOracle');
        oracle = await MockVRFOracle.deploy();
        await oracle.deployed();

        const TestVRFClientHost = await ethers.getContractFactory('TestVRFClientHost');
        host = await TestVRFClientHost.deploy();
        await host.deployed();

        // deploy VRFClient
        const VRFClient = await ethers.getContractFactory('VRFClient');
        vrfClient = await VRFClient.deploy(
            eoaAdmin.address,
            host.address,
            oracle.address,
            link.address,
            fee,
            keyhash
        );
        await vrfClient.deployed();

        // initialize host
        await (await host.setVrfClientAddress(vrfClient.address)).wait();
        // initialize LINK
        await (await link.setBalance(vrfClient.address, startingBalance)).wait();
    });

    it('can request and receive a random number from the oracle after transferring LINK', async () => {
        const iterations = 3;
        let completedIterations = 0;
        const internalIds = [];

        for (let externalId = 1; externalId <= iterations; externalId++) {
            // request random number
            const tx = await host.makeRequest(externalId);
            await tx.wait();

            // get the internal request id
            const internalId = await host.getRequestId(externalId);
            internalIds.push(internalId);
            // use it to submit random number to 
            const randomNumber = externalId * 10;
            const submitTx = await oracle.submitRandomness(vrfClient.address, internalId, randomNumber);
            await submitTx.wait();

            const receivedRandom = await host.readRandom(externalId);
            assert.strictEqual(receivedRandom.toNumber(), randomNumber)

            completedIterations++;
        }

        // confirm internal IDs are legit bytes 32
        assert(internalIds.every(id => id.length === 66 && id.startsWith('0x')));

        // confirm all iterations completed
        assert.strictEqual(completedIterations, 3);

        // confirm link spent
        const linkBalance = (await link.balanceOf(vrfClient.address)).toNumber();
        assert.strictEqual(linkBalance, startingBalance - (completedIterations * fee));
    });

    it('can delete a reference', async () => {
        // request random number
        const tx = await host.makeRequest(1);
        await tx.wait();

        // get the internal request id
        const referenceId = await host.getRequestId(1);
        const submitTx = await oracle.submitRandomness(vrfClient.address, referenceId, 1000);
        await submitTx.wait();


        let random = await vrfClient.getRandomNumber(referenceId);
        assert(random.eq(1000));

        await (
            await host.deleteReference(referenceId)
        ).wait();

        random = await vrfClient.getRandomNumber(referenceId);
        assert(random.eq(0));
    });

    it('can update the fee, and rejects if balance too low', async () => {
        const updateTx = await vrfClient.updateFee(1000);
        await updateTx.wait();

        const newFee = await vrfClient.fee();
        assert.strictEqual(newFee.toNumber(), 1000);

        await expect(
            host.makeRequest(42069)
        ).to.be.revertedWith('Not enough LINK');
    });

    it('can update the keyhash', async () => {
        const newKeyhash = '0x0000000012345678deadbeef12345678deadbeef12345678deadbeef12345678';
        const updateTx = await vrfClient.updateKeyhash(newKeyhash);
        await updateTx.wait();

        const updatedKeyhash = await vrfClient.keyHash();
        assert.strictEqual(updatedKeyhash, newKeyhash);
    });

    describe('only admin', async () => {
        it('updateFee', async () => {
            await expect(
                vrfClient.connect(alt).updateFee(fee)
            ).to.be.revertedWith('Must be admin');
        });

        it('updateKeyhash', async () => {
            await expect(
                vrfClient.connect(alt).updateKeyhash(keyhash)
            ).to.be.revertedWith('Must be admin');
        });

        it('requestRandomNumber', async () => {
            await expect(
                vrfClient.requestRandomNumber()
            ).to.be.revertedWith('Must be admin');
        });

        it('deleteReference', async () => {
            await expect(
                vrfClient.deleteReference(keyhash)
            ).to.be.revertedWith('Must be admin');
        });
    });
});