const express = require('express');
const registrationRoutes = require('./registration');
const userRoutes = require('./user');
const walletRoutes = require('./wallet');
const router = express.Router();
const matchRoutes = require('./matching');
const ieo = require('./ieo');

router.use(express.static('dist'));
router.use('/user/registration', registrationRoutes);
router.use('/user', userRoutes);
router.use('/wallet', walletRoutes);
router.use('/matching', matchRoutes);
router.use('/ieo',ieo)

module.exports = router;