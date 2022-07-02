import {readFileSync} from "fs";
import {setTier} from "./setTier";
import {getGlobals} from "../../backend/server/globals";

export async function uploadNfts(args: any) {
    const {filepath} = args;

    const content = readFileSync(filepath).toString();
    const data = JSON.parse(content);
    if (!Array.isArray(data)) {
        throw new Error('nft data must be in an array format');
    }

    const globals = await getGlobals();

    const successes = [];
    const failures = [];

    for (const item of data) {
        if (!(
            item.address &&
            item.token &&
            item.rarity !== undefined &&
            item.link?.url &&
            item.link?.source &&
            item.metadata &&
            item.isErc1155 !== undefined
        )) {
            failures.push({reason: 'missing data', item});
            continue;
        }

        const {address, token, rarity, link, metadata, isErc1155} = item;

        console.log(`attempting to upload (address, token) (${address}, ${token})`)

        try {
            // put it in play
            await setTier({
                nft: address,
                token,
                isErc1155,
                tier: rarity,
            });

            await globals.models.nft.set({
                address,
                token,
                rarity,
                link,
                metadata,
                isErc1155,
                inDeck: true,
            });

            console.log('success!');
            successes.push(item);

        } catch (error) {
            console.error(error);
            failures.push({reason: error.msg, })
        }
    }

    const results = {successes, failures};
    console.log(JSON.stringify(results, null, 4));
}