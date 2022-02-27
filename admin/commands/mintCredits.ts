import {getLiveParams} from "../../params/getParams";
import {getInterfaceFactory} from "../../utils/interfaceFactory";

const params = getLiveParams();

export async function mintCredits(args: any) {
    let {user, token, quantity} = args;

    if (!token || !quantity) {
        throw new Error(`'token' and 'quantity' must be defined`);
    }

    user = user || params.NFTDISPENSER;
    token = parseInt(token);
    quantity = parseInt(quantity);

    if (12 % token !== 0 || token > 12) {
        throw new Error(`Invalid tokenId ${token}`);
    }

    const factory = await getInterfaceFactory();
    const admin = await factory.makePoolAdmin();

    await admin.mintCredits(user, token, quantity);
}
