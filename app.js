const mongoose = require('mongoose');
const express = require('express');
const UserTemp = require('./db/user-temp');

const app = express();

app.get('/', (req, res) => {
    res.send('App Works!!!!');
});

app.listen(3000, () => {
    console.log('listening on port 3000!!')
});

mongoose.connect('mongodb://localhost:27017/core-api', { useNewUrlParser: true }).then( () => {
    console.log("DB connection successful");
},
(err) => {
    console.log("DB connection failed");
});


    new UserTemp({
        email:"satz@mail.com",
        password:'123456'
    }).save()
    .then(item => {
        console.log("user temp added successfully");
    })
    .catch(err => {
        console.log(err);
    });




