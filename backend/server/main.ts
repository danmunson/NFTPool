import express from 'express';
import cors from 'cors';

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(express.json());

const placeHolder = () => {};

// app.get('/history', placeHolder);
app.get('/deck', placeHolder);
app.get('/fees', placeHolder);
app.post('/userHistory', placeHolder);
app.post('/userBalances', placeHolder);

app.post('/currentUserState', placeHolder);
app.post('/userAction', placeHolder);

