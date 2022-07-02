import {Sequelize, DataTypes, ModelCtor, Model} from 'sequelize';
import {
    UserInteractionEvent,
    NFT,
    FulfillEvent,
    GlobalState,
} from './datatypes';

type SQLModel = ModelCtor<Model<any, any>>;

const {SQLITE_FILEPATH} = process.env;

function basicType(
    dataType: keyof typeof DataTypes,
    unique: boolean,
    primaryKey: boolean = false,
) {
    return {
        type: DataTypes[dataType],
        allowNull: false,
        unique, 
        primaryKey,
    };
}

async function getDBModels() {
    const sequelize = new Sequelize('luutbox', 'username', 'password', {
        dialect: 'sqlite',
        storage: SQLITE_FILEPATH,
    });

    const models = {
        userInteractionEvent: sequelize.define('UserInteractionEvent', {
            id: basicType('STRING', true, true),
            type: basicType('STRING', false),
            transaction: basicType('STRING', true),
            user: basicType('STRING', false),
            quantity: basicType('INTEGER', false),
            fee: basicType('STRING', false),
            timestamp: basicType('INTEGER', false),
            fulfilled: basicType('BOOLEAN', false),
            qtyFulfilled: basicType('INTEGER', false),
            fulfillmentTransaction: basicType('STRING', false),
            status: basicType('STRING', false),
        }, {
            indexes: [{fields: ['user']}, {fields: ['status']}, {fields: ['id']}],
        }),

        fulfillEvent: sequelize.define('FulfillEvent', {
            id: basicType('STRING', true, true),
            user: basicType('STRING', false),
            nfts: basicType('STRING', false), // stringifed JSON
            timestamp: basicType('INTEGER', false),
            transaction: basicType('STRING', true),
        }, {
            indexes: [{fields: ['user']}, {fields: ['id']}],
        }),

        nft: sequelize.define('NFT', {
            id: basicType('STRING', true, true),
            address: basicType('STRING', false),
            token: basicType('STRING', false),
            rarity: basicType('INTEGER', false),
            url: basicType('STRING', false),
            source: basicType('STRING', false),
            metadata: basicType('STRING', false), // stringified JSON
            inDeck: basicType('BOOLEAN', false),
        }, {
            indexes: [{fields: ['inDeck']}, {fields: ['id']}],
        }),

        // "singleton" table
        globalState: sequelize.define('GlobalState', {
            id: basicType('STRING', true, true), // always '1'
            drawFee: basicType('STRING', false),
        }),
    };

    await sequelize.sync();

    return models;
}

interface Transformer<T> {
    toStorage(x: T): any;
    fromStorage(x: any): T;
    getKey(x: T): string;
}

class BasicTransformer<T> implements Transformer<T> {
    toStorage(x: T) {
        const y: any = Object.assign({}, x);
        y.id = this.getKey(x);
        return y;
    }

    fromStorage(x: any): T {
        const y: any = Object.assign({}, x);
        delete y.id;
        return y;
    }

    getKey(x: T): string {
        return '0';
    }
}

class UieTransformer extends BasicTransformer<UserInteractionEvent> {
    getKey(x: UserInteractionEvent) {
        return x.transaction;
    }
};

class GlobalStateTransformer extends BasicTransformer<GlobalState> {};

class NftTransformer extends BasicTransformer<NFT> {
    toStorage(x: NFT) {
        const toSave = super.toStorage(x);
        delete toSave.link;
        toSave.source = x.link.source;
        toSave.url = x.link.url;
        toSave.metadata = JSON.stringify(x.metadata);
        return toSave;
    }

    fromStorage(x: any): NFT {
        const toReturn = super.fromStorage(x);
        toReturn.link = {
            source: x.source,
            url: x.url,
        };
        delete (toReturn as any).source;
        delete (toReturn as any).url;
        toReturn.metadata = JSON.parse(x.metadata);
        return toReturn;
    }

    getKey(x: NFT) {
        return `${x.address}:${x.token}`;
    }
}

class FulfillEventTransformer extends BasicTransformer<FulfillEvent> {
    toStorage(x: FulfillEvent) {
        const toSave = super.toStorage(x);
        toSave.nfts = JSON.stringify(x.nfts);
        return toSave;
    }

    fromStorage(x: any): FulfillEvent {
        const toReturn = super.fromStorage(x);
        toReturn.nfts = JSON.parse(x.nfts);
        return toReturn;
    }

    getKey(x: FulfillEvent) {
        return x.transaction;
    }
}

class GetterSetter<T> {
    public model: SQLModel;
    public transformer: Transformer<T>;

    constructor(model: SQLModel, transformer: Transformer<T>) {
        this.model = model;
        this.transformer = transformer;
    }

    async getData(where?: any): Promise<T[]> {
        where = where || {};
        const objects = await this.model.findAll({where});
        return objects.map((obj: any) => this.transformer.fromStorage(obj.dataValues));
    }

    async getOne(minDetails: T): Promise<T> {
        const id = this.transformer.getKey(minDetails);
        const data = await this.getData({id});
        return data.length ? data[0] : undefined;
    }

    async getModel(id: string): Promise<Model<T>> {
        const models = await this.model.findAll({where: {id}});
        return models.length ? models[0] : undefined;
    }

    async set(obj: T) {
        const toSave = this.transformer.toStorage(obj);
        const model = await this.getModel(toSave.id);

        if (model) {
            for (const key of Object.keys(toSave)) {
                model[key] = toSave[key];
            }
            await model.save();
        } else {
            await this.model.create(toSave);
        }
    }
}

export class DbModelAccessor {
    public ready: Promise<any>;
    public userInteractionEvent: GetterSetter<UserInteractionEvent>;
    public nft: GetterSetter<NFT>;
    public fulfillEvent: GetterSetter<FulfillEvent>;
    public globalState: GetterSetter<GlobalState>;

    constructor() {
        this.ready = this.initialize();
    }

    private async initialize() {
        const models = await getDBModels();
        this.userInteractionEvent = new GetterSetter(
            models.userInteractionEvent,
            new UieTransformer(),
        );
        this.nft = new GetterSetter(
            models.nft,
            new NftTransformer(),
        );
        this.fulfillEvent = new GetterSetter(
            models.fulfillEvent,
            new FulfillEventTransformer(),
        );
        this.globalState = new GetterSetter(
            models.globalState,
            new GlobalStateTransformer(),
        );
    }
}
