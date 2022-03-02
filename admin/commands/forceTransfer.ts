import {getLiveParams} from "../../params/getParams";
import {getInterfaceFactory} from "../../utils/interfaceFactory";

const params = getLiveParams();

export async function forceTransfer(args: any) {
    let {nft, token, isErc1155, recipient} = args;

    if (!nft || !token || !(['true', 'false'].includes(isErc1155))) {
        throw new Error(`Must provide 'nft' 'token' 'isErc1155'=true|false`);
    }

    isErc1155 = isErc1155 === 'true';
    recipient = recipient || params.SIGNER_ADDRESS;

    const factory = await getInterfaceFactory();
    const admin = await factory.makePoolAdmin();

    await admin.forceTransferNft(nft, token, isErc1155, recipient);
}