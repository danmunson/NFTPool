import express from 'express';
import cors from 'cors';

import * as actions from './actions';

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(express.json());

const placeHolder = () => {};

app.get('/deck', placeHolder);
// app.get('/history', placeHolder);
app.get('/fees', placeHolder);

app.post('/userBalances', placeHolder);
app.post('/currentUserState', placeHolder);
app.post('/userHistory', placeHolder);
app.post('/userAction', placeHolder);

