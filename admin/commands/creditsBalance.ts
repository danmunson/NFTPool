import {getInterfaceFactory} from "../../utils/interfaceFactory";

export async function creditsBalance(args: any) {
    const {user} = args;

    if (!user) {
        throw new Error(`Must provide 'user'`);
    }

    const factory = await getInterfaceFactory();
    const views = await factory.makePoolView();

    const userCredits = await views.getCreditsBalance(user);
    console.log('User Credits:', userCredits, '\n');
}