FROM node:18-alpine3.14

WORKDIR /usr/app
ADD ./dist /usr/app/
ADD ./package.json /usr/app
ADD ./secret /usr/app

RUN npm install --only=prod

EXPOSE 80

CMD npm run start
