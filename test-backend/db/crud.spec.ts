// eslint-disable-next-line node/no-unpublished-import
import {assert} from 'chai';
import {DbModelAccessor} from '../../backend/db/models';

describe('CRUD operations on DB', async () => {
    let models: DbModelAccessor;

    beforeEach(async () => {
        models = new DbModelAccessor();
        await models.ready;
    });

    it('globalState', async () => {
        // set
        await models.globalState.set({drawFee: '0.005'});
        // get
        let gs = await models.globalState.getOne({});
        assert.strictEqual(gs.drawFee, '0.005');
        // set again
        await models.globalState.set({drawFee: '0.010'});
        // get again
        gs = await models.globalState.getOne({});
        assert.strictEqual(gs.drawFee, '0.010');
    });
});
