describe('NFTDispenser', async () => {
    describe('transferring and setting difficulty', async () => {
        it('can become owner of NFT');

        it('will not set difficulty if not owner');

        it('will set difficulties of nfts it owns');

        it('will accept nfts that use safeTransferFrom');
    });

    describe('view methods', async () => {
        it('will return array of active tiers');

        it('will return count of nfts in a tier');

        it('will return info for nft at specifc tier index');
    });

    describe('dispense', async () => {
        it('will dispense an nft it owns and clear from storage');

        it('will not fail if dispensing an nft it does not own, and will clear from storage');

        it('can dispense all NFTs in a tier successfully');

        it('will fail if attempt to dispense nft at greater index than exists');
    });

    describe('admin', async () => {
        it('admin can force a transfer');

        it('admin can clear a reference');
    });
});