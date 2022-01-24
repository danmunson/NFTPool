pragma solidity >=0.8.0;
import "@openzeppelin/contracts/interfaces/IERC721.sol";
import "@openzeppelin/contracts/interfaces/IERC1155.sol";

struct NFT {
    address addr;
    uint256 tokenId;
    bool isErc1155;
    uint256 quantity;
    uint8 tier;
    uint256 index;
}

contract NFTDispenser {
    address internal admin;
    bool internal lock;
    // store the counts of active tiers
    bool[256] internal activeTiers;
    // tracks NFTs by reference
    mapping(bytes32 => NFT) internal trackedNfts;
    // tracks the tier that each nft belongs to
    bytes32[][256] internal nftRefsByTier;
    // counts the number of tokens in play
    uint256 internal nftsInPlay;

    constructor(address _admin) {
        admin = _admin;
        lock = false;
        nftsInPlay = 0;
    }

    modifier onlyAdmin {
        require(msg.sender == admin, "Must be admin");
        require(lock == false, "Contract is locked");
        lock = true;
        _;
        lock = false;
    }

    /*
    VIEWS
    */
    function getActiveTiers() external view returns (bool[256] memory) {
        return activeTiers;
    }

    function getIndexesByTier(uint8 _tier) external view returns (uint256) {
        bytes32[] storage refArray = nftRefsByTier[_tier];
        return refArray.length;
    }

    function getNftsInPlay() external view returns (uint256) {
        return nftsInPlay;
    }

    function getNftInfo(address _nftAddress, uint256 _tokenId ) external view returns (
        address, uint256, bool, uint256, uint8, uint256
    ) {
        bytes32 ref = getRef(_nftAddress, _tokenId);
        NFT storage nft = trackedNfts[ref];
        return (
            nft.addr,
            nft.tokenId,
            nft.isErc1155,
            nft.quantity,
            nft.tier,
            nft.index
        );
    }

    /*
    EXTERNAL USER FUNCTIONS
    */
    function setTier(
        address _nftAddress, uint256 _tokenId, bool _isErc1155, uint8 _tier
    ) external onlyAdmin {
        // confirm ownership
        require(checkOwnedByThis(_nftAddress, _tokenId, _isErc1155), "Not owner of NFT");
        trackNft(_nftAddress, _tokenId, _isErc1155, _tier);
    }

    function dispenseNft(uint8 _tier, uint256 _index, address _to) external onlyAdmin returns (bool) {
        // check bounds
        require(nftRefsByTier[_tier].length > _index, "Not enough NFTs in tier");

        bytes32 ref = nftRefsByTier[_tier][_index];

        // get nft
        NFT storage nft = trackedNfts[ref];
        bool transferred = transferOwnership(nft, _to);

        // remove reference to NFT
        untrackNft(ref);

        return transferred;
    }

    /*
    INTERNAL
    */
    function getRef(address _nftAddress, uint256 _tokenId) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(_nftAddress, _tokenId));
    }

    function checkOwnedByThis(
        address _nftAddress, uint256 _tokenId, bool _isErc1155
    ) internal view returns (bool) {
        if (_isErc1155) {
            uint256 balance = IERC1155(_nftAddress).balanceOf(address(this), _tokenId);
            if (balance > 0) {
                return true;
            }
        } else {
            address nftOwner = IERC721(_nftAddress).ownerOf(_tokenId);
            if (nftOwner == address(this)) {
                return true;
            }
        }
        return false;
    }

    function trackNft(address _nftAddress, uint256 _tokenId, bool _isErc1155, uint8 _tier) internal {
        bytes32 ref = getRef(_nftAddress, _tokenId);
        NFT storage nft = trackedNfts[ref];

        // check if nft doesn't exist yet
        if (nft.quantity == 0) {
            uint256 newNftIndex = nftRefsByTier[_tier].length;

            NFT memory newNft = NFT({
                addr: _nftAddress,
                tokenId: _tokenId,
                isErc1155: _isErc1155,
                quantity: 1,
                tier: _tier,
                index: newNftIndex
            });

            nftRefsByTier[_tier].push(ref);
            trackedNfts[ref] = newNft;
            activeTiers[_tier] = true;

        } else if (_isErc1155) {
            nft.quantity += 1;

        } else {
            revert("ERC721 is already tracked");
        }

        nftsInPlay += 1;
    }

    function untrackNft(bytes32 _ref) internal {
        NFT storage nft = trackedNfts[_ref];
        uint8 tier = nft.tier;

        // ensure NFT exists
        if (nft.quantity > 0) {
            if (nft.isErc1155 && nft.quantity > 1) {
                // Quantity of ERC1155 > 1, so simply reduce quantity by 1
                nft.quantity -= 1;

            } else {
                uint256 lastRefIndex = nftRefsByTier[tier].length - 1;
                if (nft.index != lastRefIndex) {
                    // Ref was not at end of list, so move last ref to this index, then pop
                    bytes32 lastRef = nftRefsByTier[tier][lastRefIndex];
                    nftRefsByTier[tier][nft.index] = lastRef;

                }
                nftRefsByTier[tier].pop();
                delete trackedNfts[_ref];

            }
            // whatever happened above, take one nft out of play
            nftsInPlay -= 1;
            if (nftRefsByTier[tier].length == 0) {
                activeTiers[tier] = false;
            }
        }
        
    }

    function transferOwnership(NFT memory _nft, address _to) internal returns (bool) {
        bool canTransfer = checkOwnedByThis(_nft.addr, _nft.tokenId, _nft.isErc1155);

        if (!canTransfer) {
            return false;
        }

        if (_nft.isErc1155) {
            // NOTE: only support transfer of a single unit
            IERC1155(_nft.addr).safeTransferFrom(
                address(this), _to, _nft.tokenId, 1, ""
            );
        } else {
            IERC721(_nft.addr).transferFrom(address(this), _to, _nft.tokenId);
        }

        return true;
    }

    /*
    ADMIN
    */
    function adminForceTransferNft(address _nftAddress, uint256 _tokenId, address _to) external onlyAdmin {
        bytes32 ref = getRef(_nftAddress, _tokenId);
        NFT storage nft = trackedNfts[ref];
        transferOwnership(nft, _to);
        untrackNft(ref);
    }

    function adminUntrackNft(address _nftAddress, uint256 _tokenId) external onlyAdmin {
        bytes32 ref = getRef(_nftAddress, _tokenId);
        untrackNft(ref);
    }

    /*
    SAFE TRANSFER CALLBACKS
    */
    function onERC721Received(
        address _operator, address _from, uint256 _tokenId, bytes calldata _data
    ) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }

    function onERC1155Received(
        address operator, address from, uint256 id, uint256 value, bytes calldata data
    ) external pure returns (bytes4) {
        return this.onERC1155Received.selector;
    }
}