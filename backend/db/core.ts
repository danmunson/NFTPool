import { Sequelize, Model, DataTypes } from 'sequelize';

class DatabaseHandler {
    private db: Sequelize;
    public ready: Promise<any>;

    constructor() {
        this.db = new Sequelize('luutbox', 'username', 'password', {
            dialect: 'sqlite',
            storage: './data/db.sqlite',
        });

        this.ready = this.db.sync({alter: true});
    }
}

const DbHandler = new DatabaseHandler();

export async function get<T>(model: string, query: any): Promise<T> {
    await DbHandler.ready;
}

export async function upsert<T>(model: string, doc: T): Promise<void> {
    await DbHandler.ready;
}