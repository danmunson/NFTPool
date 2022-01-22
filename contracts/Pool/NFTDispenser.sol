pragma solidity >=0.8.0;
import "@openzeppelin/contracts/interfaces/IERC721.sol";

struct NFT {
    address _address;
    uint256 _tokenId;
}

contract NFTDispenser {
    address admin;
    // store the counts of active tiers
    bool[256] activeTiers;
    // reference to NFTs by tier
    // NOTE: this is saying there are 256 dynamic arrays of NFT structs
    NFT[][256] nftsByTier;

    constructor(address _admin) {
        admin = _admin;
    }

    modifier onlyAdmin {
        require(msg.sender == admin, "Must be admin");
        _;
    }

    function getActiveTiers() external view returns (bool[256] memory) {
        return activeTiers;
    }

    function getNftCountByTier(uint8 _tier) external view returns (uint256) {
        NFT[] storage nftArray = nftsByTier[_tier];
        return nftArray.length;
    }

    function getNftInfo(uint8 _tier, uint256 _index) external view returns (address, uint256) {
        NFT storage nft = nftsByTier[_tier][_index];
        return (nft._address, nft._tokenId);
    }

    // set the tier of an nft already owned by this contract
    function setTier(address _nftAddress, uint256 _tokenId, uint8 _tier) external onlyAdmin {
        // confirm ownership
        address nftOwner = IERC721(_nftAddress).ownerOf(_tokenId);
        require(nftOwner == address(this), "Not owner of NFT");

        // store NFT (create in memory then copy to storage)
        NFT memory nft = NFT({
            _address: _nftAddress,
            _tokenId: _tokenId
        });
        nftsByTier[_tier].push(nft);
        activeTiers[_tier] = true;
    }

    function dispenseNft(uint8 _tier, uint256 _index, address _to) external onlyAdmin returns (bool) {
        // check bounds
        require(nftsByTier[_tier].length > _index, "Not enough NFTs in tier");

        // get NFT reference and send it (only if owner)
        bool transferred = false;
        NFT storage nft = nftsByTier[_tier][_index];
        address nftOwner = IERC721(nft._address).ownerOf(nft._tokenId);

        // send it if owner
        if (nftOwner == address(this)) {
            IERC721(nft._address).transferFrom(address(this), _to, nft._tokenId);
            transferred = true;
        }

        // remove reference to NFT
        clearReference(_tier, _index);

        return transferred;
    }

    function clearReference(uint8 _tier, uint256 _index) internal returns (address, uint256) {
        // save data in memory
        NFT memory clearedNft = nftsByTier[_tier][_index];
        // remove reference to NFT
        uint256 previousNftCount = nftsByTier[_tier].length;
        NFT memory lastNftInTier = nftsByTier[_tier][previousNftCount - 1];
        nftsByTier[_tier][_index] = lastNftInTier;
        nftsByTier[_tier].pop();
        if (previousNftCount == 1) {
            activeTiers[_tier] = false;
        }
        // return
        return (clearedNft._address, clearedNft._tokenId);
    }

    // safety mechanism to ensure NFT transfers aren't rejected
    function onERC721Received(
        address _operator, address _from, uint256 _tokenId, bytes calldata _data
    ) external returns (bytes4) {
        return this.onERC721Received.selector;
    }

    // ADMIN
    function adminForceNftTransfer(address _nftAddress, uint256 _tokenId, address _to) external onlyAdmin {
        IERC721(_nftAddress).transferFrom(address(this), _to, _tokenId);
    }

    // ADMIN
    function adminClearReference(uint8 _tier, uint256 _index) external onlyAdmin returns (address, uint256) {
        require(nftsByTier[_tier].length > _index, "Not enough NFTs in tier");
        return clearReference(_tier, _index);
    }
}