import {DbModelAccessor} from "../db/models";
import {getInterfaceFactory} from "../../utils/interfaceFactory";
import {PoolRelay, PoolAdmin, PoolView} from "../../utils/PoolManager";
import { GlobalState } from "../db/datatypes";

class Globals {
    booted: Promise<boolean>;
    models: DbModelAccessor;
    admin: PoolAdmin;
    relay: PoolRelay;
    views: PoolView;

    constructor() {
        this.booted = this.initialize();
    }

    async initialize() {
        this.models = new DbModelAccessor();
        await this.models.ready;

        const factory = await getInterfaceFactory();
        const [admin, relay, views] = await Promise.all([
            factory.makePoolAdmin(), factory.makePoolRelay(), factory.makePoolView(),
        ]);
        this.admin = admin;
        this.relay = relay;
        this.views = views;

        const drawFee = await this.views.getDrawFee();
        await this.models.globalState.set({drawFee: drawFee.toString()});
        return true;
    }

    async getGlobalState(): Promise<GlobalState> {
        const data = await this.models.globalState.getOne({});
        if (!data) return {};
        const {drawFee} = data;
        return {drawFee};
    }
}

const globals = new Globals();

export async function getGlobals() {
    await globals.booted;
    return globals;
}