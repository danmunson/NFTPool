// import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
// import { expect, assert } from "chai";
// import { ethers } from "hardhat";
// import { MockNFT, NFTDispenser } from "../../../typechain";

// describe.skip('NFTDispenser', async () => {
//     let mainAcct: SignerWithAddress;
//     let altAcct: SignerWithAddress;
//     let nftDispenser: NFTDispenser;
//     let nfts: MockNFT[];

//     before(async () => {
//         const signers = await ethers.getSigners();
//         mainAcct = signers[0];
//         altAcct = signers[1];
//     });

//     beforeEach(async () => {
//         const NFTDispenser = await ethers.getContractFactory("NFTDispenser");
//         nftDispenser = await NFTDispenser.deploy(mainAcct.address);
//         await nftDispenser.deployed();

//         const MockNFT = await ethers.getContractFactory("MockNFT");
//         nfts = await Promise.all([1, 2].map(async () => {
//             const nft = await MockNFT.deploy();
//             await nft.deployed();
//             // mint 3 tokens apiece
//             await Promise.all([1, 2, 3].map(async (id) => {
//                 const tx = await nft.mint(id);
//                 await tx.wait();
//             }));
//             return nft;
//         }))
//     });

//     async function transferAndSetTiers(sameTier: boolean) {
//         // transfer and set tiers
//         await Promise.all(nfts.map(async (nft, idx) => {
//             await Promise.all([1, 2, 3].map(async (tokenId) => {
//                 assert.strictEqual(await nft.ownerOf(tokenId), mainAcct.address);
//                 const tfTx = await nft.transferFrom(mainAcct.address, nftDispenser.address, tokenId);
//                 await tfTx.wait();
//                 assert.strictEqual(await nft.ownerOf(tokenId), nftDispenser.address);
    
//                 const tx = await nftDispenser.setTier(
//                     nft.address, tokenId,
//                     sameTier ? 0 : (3 * idx) + tokenId
//                 );
//                 await tx.wait();
//             }));
//         }));
//     };

//     describe('transferring and setting difficulty', async () => {
//         it('can become owner of NFT via transferFrom or safeTransferFrom', async () => {
//             const nft = nfts[0];

//             assert.strictEqual(await nft.ownerOf(1), mainAcct.address);
//             const tfTx = await nft.transferFrom(mainAcct.address, nftDispenser.address, 1);
//             await tfTx.wait();
//             assert.strictEqual(await nft.ownerOf(1), nftDispenser.address);

//             assert.strictEqual(await nft.ownerOf(2), mainAcct.address);
//             const stfTx = await nft['safeTransferFrom(address,address,uint256)'](mainAcct.address, nftDispenser.address, 2);
//             await stfTx.wait();
//             assert.strictEqual(await nft.ownerOf(2), nftDispenser.address);
//         });

//         it('will not set difficulty if not owner', async () => {
//             const nft = nfts[0];
//             assert.strictEqual(await nft.ownerOf(1), mainAcct.address);
//             await expect(
//                 nftDispenser.setTier(nft.address, 1, 1)
//             ).to.be.revertedWith('Not owner of NFT');
//         });

//         it('will set difficulties of nfts it owns', async () => {
//             const nft = nfts[0];

//             assert.strictEqual(await nft.ownerOf(1), mainAcct.address);
//             const tfTx = await nft.transferFrom(mainAcct.address, nftDispenser.address, 1);
//             await tfTx.wait();
//             assert.strictEqual(await nft.ownerOf(1), nftDispenser.address);

//             const tx = await nftDispenser.setTier(nft.address, 1, 0);
//             await tx.wait();

//             const countByTier = await nftDispenser.getNftCountByTier(0);
//             assert.strictEqual(countByTier.toNumber(), 1);
//         });
//     });

//     describe('view methods', async () => {
//         describe('different tiers', async () => {
//             it('will return array of active tiers', async () => {
//                 await transferAndSetTiers(false);
//                 const tiers = await nftDispenser.getActiveTiers();
//                 const expectedTiers = [];
//                 for (let i = 0; i < 256; i++) {
//                     expectedTiers[i] = (i >= 1 && i <= 6);
//                 }
//                 assert.deepStrictEqual(tiers, expectedTiers);
//             });
    
//             it('will return count of nfts in a tier', async () => {
//                 await transferAndSetTiers(false);
//                 const counts = await Promise.all([1, 2, 3, 4, 5, 6].map(async (tier) => {
//                     return await nftDispenser.getNftCountByTier(tier);
//                 }));
//                 assert(counts.every(x => x.toNumber() === 1));
//             });

//             it('will return info for nft at specifc tier index', async () => {
//                 await transferAndSetTiers(false);
//                 const [address, tokenId] = await nftDispenser.getNftInfo(1, 0);
//                 assert.strictEqual(address, nfts[0].address);
//                 assert.strictEqual(tokenId.toNumber(), 1); 
//             });
//         });

//         describe('same tier', async () => {
//             it('will return array of active tiers', async () => {
//                 await transferAndSetTiers(true);
//                 const tiers = await nftDispenser.getActiveTiers();
//                 const expectedTiers = Array(256).fill(false);
//                 expectedTiers[0] = true;
//                 assert.deepStrictEqual(tiers, expectedTiers);
//             });
    
//             it('will return count of nfts in a tier', async () => {
//                 await transferAndSetTiers(true);
//                 const count = await nftDispenser.getNftCountByTier(0);
//                 assert.strictEqual(count.toNumber(), 6);
//             });

//             it('will return info for nft at specifc tier index', async () => {
//                 await transferAndSetTiers(true);
//                 const [address, tokenId] = await nftDispenser.getNftInfo(0, 1);
//                 assert.strictEqual(address, nfts[0].address);
//                 assert.strictEqual(tokenId.toNumber(), 2); 
//             });
//         });
//     });

//     describe('dispense', async () => {
//         it('will dispense an nft it owns and clear from storage', async () => {
//             await transferAndSetTiers(false);
//             const tx = await nftDispenser.dispenseNft(1, 0, mainAcct.address);
//             await tx.wait();

//             // confirm that mainAcct is new owner
//             assert.strictEqual((await nfts[0].ownerOf(1)), mainAcct.address);

//             // confirm that storage is cleared
//             const countOfTier1 = await nftDispenser.getNftCountByTier(1);
//             assert.strictEqual(countOfTier1.toNumber(), 0);
//             const activeTiers = await nftDispenser.getActiveTiers();
//             activeTiers.forEach((active: boolean, idx: number) => {
//                 assert.strictEqual(active, idx >= 2 && idx <= 6);
//             });
//         });

//         it('will not fail if dispensing an nft it does not own, and will clear from storage', async () => {
//             await transferAndSetTiers(false);
//             const [address, tokenId] = await nftDispenser.getNftInfo(1, 0);
//             assert.strictEqual(address, nfts[0].address);
//             assert.strictEqual(tokenId.toNumber(), 1);

//             // transfer to the altAccount
//             const tfTx = await nftDispenser.adminForceNftTransfer(nfts[0].address, tokenId, altAcct.address);
//             await tfTx.wait();
//             assert.strictEqual((await nfts[0].ownerOf(tokenId)), altAcct.address);

//             // confirm that storage still tracks the NFT
//             let countOfTier1 = await nftDispenser.getNftCountByTier(1);
//             assert.strictEqual(countOfTier1.toNumber(), 1);
//             let activeTiers = await nftDispenser.getActiveTiers();
//             assert.strictEqual(activeTiers[1], true);

//             // dispense nft that nftDispenser no longer owns to mainAcct
//             const tx = await nftDispenser.dispenseNft(1, 0, mainAcct.address);
//             await tx.wait();

//             // confirm that altAcct is still owner
//             assert.strictEqual((await nfts[0].ownerOf(tokenId)), altAcct.address);

//             // confirm that storage has still been cleared
//             countOfTier1 = await nftDispenser.getNftCountByTier(1);
//             assert.strictEqual(countOfTier1.toNumber(), 0);
//             activeTiers = await nftDispenser.getActiveTiers();
//             activeTiers.forEach((active: boolean, idx: number) => {
//                 assert.strictEqual(active, idx >= 2 && idx <= 6);
//             });
//         });

//         it('can dispense all NFTs in a tier successfully', async () => {
//             const getOwners = async () => {
//                 const owners = [];
//                 for (const nft of nfts) {
//                     for (let tokenId = 1; tokenId <= 3; tokenId++) {
//                         owners.push(await nft.ownerOf(tokenId));
//                     }
//                 }
//                 return owners;
//             };

//             const dispense = async () => {
//                 // always dispense the 0th NFT in tier 0
//                 const tx = await nftDispenser.dispenseNft(0, 0, mainAcct.address);
//                 await tx.wait();
//             };

//             await transferAndSetTiers(true);
//             const count = await nftDispenser.getNftCountByTier(0);
//             assert.strictEqual(count.toNumber(), 6);
            
//             let owners = await getOwners();
//             assert(owners.every(owner => owner === nftDispenser.address));

//             for (let i = 0; i < 6; i++) {
//                 await dispense();
//             }

//             owners = await getOwners();
//             assert(owners.every(owner => owner === mainAcct.address));
//         });

//         it('will fail if attempt to dispense nft at greater index than exists', async () => {
//             await transferAndSetTiers(true);
//             await expect(
//                 // index too high
//                 nftDispenser.dispenseNft(0, 7, mainAcct.address)
//             ).to.be.revertedWith('Not enough NFTs in tier');
//             await expect(
//                 // no NFTs in tier
//                 nftDispenser.dispenseNft(1, 0, mainAcct.address)
//             ).to.be.revertedWith('Not enough NFTs in tier');
//         });
//     });

//     describe('admin', async () => {
//         it('only admin can force a transfer', async () => {
//             await transferAndSetTiers(false);
//             const tx = await nftDispenser.adminForceNftTransfer(
//                 nfts[0].address, 1, mainAcct.address
//             );
//             await tx.wait();

//             // check transfer
//             assert.strictEqual(await nfts[0].ownerOf(1), mainAcct.address);

//             await expect(
//                 nftDispenser.connect(altAcct).adminForceNftTransfer(
//                     nfts[0].address, 2, mainAcct.address
//                 )
//             ).to.be.revertedWith('Must be admin');
//         });

//         it('only admin can clear a reference', async () => {
//             await transferAndSetTiers(true);
//             const index = 3;

//             // get details for tier 0, index 3
//             let countInTier0 = await nftDispenser.getNftCountByTier(0);
//             assert.strictEqual(countInTier0.toNumber(), 6);
//             const [address, tokenId] = await nftDispenser.getNftInfo(0, index);

//             const tx = await nftDispenser.adminClearReference(0, index);
//             await tx.wait();

//             countInTier0 = await nftDispenser.getNftCountByTier(0);
//             assert.strictEqual(countInTier0.toNumber(), 5);

//             for (let i = 0; i < countInTier0.toNumber(); i++) {
//                 const [nftAddr, nftTokenId] = await nftDispenser.getNftInfo(0, i);
//                 assert(nftAddr !== address || nftTokenId !== tokenId);
//             }

//             await expect(
//                 nftDispenser.connect(altAcct).adminClearReference(69, 420)
//             ).to.be.revertedWith('Must be admin');
//         });

//         it('only admin can set tier', async () => {
//             await expect(
//                 nftDispenser.connect(altAcct).setTier(nfts[0].address, 1, 0)
//             ).to.be.revertedWith('Must be admin');
//         });

//         it('only admin can dispense', async () => {
//             await expect(
//                 nftDispenser.connect(altAcct).dispenseNft(0, 0, mainAcct.address)
//             ).to.be.revertedWith('Must be admin');
//         });
//     });
// });