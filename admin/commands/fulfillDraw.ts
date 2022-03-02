import {getInterfaceFactory} from "../../utils/interfaceFactory";

export async function fulfillDraw(args: any) {
    let {user, maxToDraw} = args;

    if (!user || !maxToDraw) {
        throw new Error(`Must provide 'user' 'maxToDraw'`);
    }

    maxToDraw = parseInt(maxToDraw);

    const factory = await getInterfaceFactory();
    const relay = await factory.makePoolRelay();

    await relay.fulfill(user, maxToDraw);
}