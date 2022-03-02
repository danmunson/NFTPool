import {getLiveParams} from "../../params/getParams";
import {getInterfaceFactory} from "../../utils/interfaceFactory";

const params = getLiveParams();

export async function drawWithCredits(args: any) {
    let {user, quantity} = args;

    if (!quantity) {
        throw new Error(`Must provide 'quantity'`);
    }

    user = user || params.SIGNER_ADDRESS;
    quantity = parseInt(quantity);

    if (quantity > 8) {
        throw new Error('Quantity must be <= 8');
    }

    const factory = await getInterfaceFactory();
    const relay = await factory.makePoolRelay();

    await relay.drawWithCredits(user, quantity, [12], [quantity]);
}