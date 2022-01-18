import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("MockNFT", function () {
  let main: SignerWithAddress;
  let alt: SignerWithAddress;

  beforeEach(async () => {
    const accounts = await ethers.getSigners();
    main = accounts[0];
    alt = accounts[1];
  });

  it("Should transfer tokens according to ownership", async function () {
    // deploy using default adddress
    const NFT = await ethers.getContractFactory("MockNFT");
    const nft = await NFT.deploy();
    await nft.deployed();

    const tokenId = 1;

    // mint for owner
    const mintTx = await nft.mint(tokenId);
    await mintTx.wait();

    // BASIC TRANSFER

    // get owner of token
    let ownerOf = await nft.ownerOf(tokenId);
    expect(ownerOf).to.equal(main.address);

    // transfer owner
    const transferTx = await nft.transferFrom(main.address, alt.address, tokenId);
    await transferTx.wait();

    // get owner of token
    ownerOf = await nft.ownerOf(tokenId);
    expect(ownerOf).to.equal(alt.address);

    // ATTEMPT TRANSFER FROM NON-OWNER
    await expect(
      nft.connect(main).transferFrom(alt.address, main.address, tokenId)
    ).to.be.revertedWith('ERC721: transfer caller is not owner nor approved');
  });
});
