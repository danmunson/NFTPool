import { unlinkSync } from "fs";

const {SQLITE_FILEPATH} = process.env;

export async function mochaGlobalSetup() {
    // create the file used by Sequelize
}

export async function mochaGlobalTeardown() {
    // delete the file used by Sequelize
    unlinkSync(SQLITE_FILEPATH);
}