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

  describe('ERC721', async () => {
    it('Should transfer tokens according to ownership', async function () {
      // deploy using default adddress
      const NFT = await ethers.getContractFactory('MockERC721');
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
  
  describe('ERC1155', async () => {
    it('Should transfer tokens according to ownership', async () => {
      const NFT = await ethers.getContractFactory('MockERC1155');
      const nft = await NFT.deploy();
      await nft.deployed();

      const tokenId = 1;

      // mint for owner
      const mintTx = await nft.mint(tokenId);
      await mintTx.wait();

      // confirm that soon-to-be recipient has a zero balance
      let altBalance = await nft.balanceOf(alt.address, tokenId);
      expect(altBalance.toNumber()).to.equal(0);

      // transfer owner
      const transferTx = await nft.safeTransferFrom(main.address, alt.address, tokenId, 1, '0x');
      await transferTx.wait();

      // confirm that recipient now has a balance
      altBalance = await nft.balanceOf(alt.address, tokenId);
      expect(altBalance.toNumber()).to.equal(1);

      // confirm original owner cannot transfer again
      await expect(
        nft.connect(main).safeTransferFrom(alt.address, main.address, tokenId, 1, '0x')
      ).to.be.revertedWith('ERC1155: caller is not owner nor approved');
    });
  });
});
