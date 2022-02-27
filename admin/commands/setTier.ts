import {getInterfaceFactory} from "../../utils/interfaceFactory";

export async function setTier(args: any) {
    let {nft, token, isErc1155, tier} = args;

    if (!nft || !token || tier === undefined) {
        throw new Error(`Must provide 'nft' 'token' 'tier'`);
    }

    isErc1155 = isErc1155 || false;
    tier = parseInt(tier);

    const factory = await getInterfaceFactory();
    const admin = await factory.makePoolAdmin();

    await admin.setTier(nft, token, isErc1155, tier);
}