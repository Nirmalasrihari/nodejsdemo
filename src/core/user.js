const moment           = require('moment');
const users            = require('../db/users');
const userServices     = require('../services/users');
const deviceMangement  = require('../db/device-management');
const loginHistory     = require('../db/login-history');
const userTemp         = require('../db/user-temp');
const helpers          = require('../helpers/helper.functions');
const config           = require('config');
const jwt              = require('jsonwebtoken');
const Joi              = require('joi');
const bcrypt           = require('bcrypt');
const controller       = require('../core/controller');
const g2fa             = require('2fa');

class User extends controller {

    activate (req, res) {
        const userHash = JSON.parse(helpers.decrypt(req.params.hash));
        if (userHash.id) {
            userTemp.findById(userHash.id)
            .exec((err, result) => {
                if (result) {
                    this.insertUser(result, res)
                } else {
                    return res.status(400).send(this.errorMsgFormat({
                        'message': 'Invalid token. may be token as expired!'
                    }));
                }
            });
        } else {
            return res.status(500).send(this.errorMsgFormat({
                'message': 'invalid token.'
            }));
        }
    }

    insertUser (result, res) {
        users.create({
            email: result.email,
            password: result.password,
            referral_code: result.referral_code,
            created_date: result.created_date
        }, (err, user) => {
            if (err) {
                return res.status(500).send(this.errorMsgFormat(err))
            } else {
                if (userTemp.removeUserTemp(result.id)) {
                    
                    // address creation
                    userServices.addressCreation(user);
                    
                    return res.status(200).send(this.successFormat({
                        'message': `Congratulation!, Your account has been activated.`
                    }));
                } else {
                    return res.status(400).send(this.errorMsgFormat({
                        'message': 'Invalid token. may be token as expired!'
                    }));
                }
            }
        });
    }

    createToken (user) {
        let jwtOptions = {
            issuer: config.get('secrete.issuer'),
            subject: 'Authentication',
            audience: config.get('secrete.domain'),
            expiresIn: config.get('secrete.expiry'),
        };

        return jwt.sign({
            user: user._id,
            user_id: user.user_id,
        }, config.get('secrete.key'), jwtOptions);
    };

    login (req, res) {
        users.findOne({ email: req.body.data.attributes.email })
        .exec()
        .then((result) => {
            if (!result) {
                return res.status(400).send(this.errorMsgFormat({
                    'message': 'Invalid credentials'
                }));
            } else if ( result.is_active ) {
                let passwordCompare = bcrypt.compareSync(req.body.data.attributes.password, result.password);
                if (passwordCompare == false) {
                    return res.status(400).send(this.errorMsgFormat({
                        'message': 'Invalid credentials'
                    }));
                } else {
                    // check that device is already exists or not
                    this.checkDevice(req, res, result);
                }
            } else {
                return res.status(400).send(this.errorMsgFormat({
                    'message': 'Your account has been disabled.'
                }));
            }
        });
    }
    
    validate (req) {
        let emailReg = /^(([^<>()\[\]\.,;:\s@\"]+(\.[^<>()\[\]\.,;:\s@\"]+)*)|(\".+\"))@(([^<>()[\]\.,;:\s@\"]+\.)+[^<>()[\]\.,;:\s@\"]{2,})$/i;
        let schema = Joi.object().keys({
            email: Joi.string().required().regex(emailReg).options({
                language: {
                    string: {
                        required: '{{label}} field is required',
                        regex: {
                            base: 'Invalid {{label}} address'
                        }
                    }
                }
            }).label("email"),
            password: Joi.string().required().options({
                language: {
                    string: {
                        required: '{{label}} field is required',
                    }
                }
            }).label('password'),
            is_browser: Joi.boolean().required(),
            is_mobile: Joi.boolean().required(),
            ip: Joi.string().required(),
            country: Joi.string().required(),
            os: Joi.string().allow('').optional(),
            os_byte: Joi.string().allow('').optional(),
            browser: Joi.string().allow('').optional(),
            browser_version: Joi.string().allow('').optional(),
            city: Joi.string().allow('').optional(),
            region: Joi.string().allow('').optional(),
        });

        return Joi.validate(req, schema, { abortEarly: false });
    }

    removeUser  (email, res) {
        users.deleteOne({ email: email })
        .then(result => {
            if (result.deletedCount) {
                return res.status(200).send(this.successFormat({
                    'message': 'account deleted successfully!'
                }));
            } else {
                return res.status(400).send(this.errorMsgFormat({
                    'message': 'Invalid email address'
                }));    
            }
        })
        .catch(err => {
            return res.status(400).send(this.errorMsgFormat({
                'message': 'Invalid credentials'
            }));
        });
    }

    getTokenToUserId (req, res, data = 'json') {
        let token = req.headers.authorization;
        try {
            let decoded  = jwt.verify(token, config.get('secrete.key'));
            if (data === 'json') {
                return res.status(200).json({ "code": 0, "message": 'Authorization successfully.', "data": { "user_id": decoded.user_id }});
            } else {
                return decoded.user;
            }
        } catch(err) {
            return res.status(401).json(this.errorMsgFormat({
                        message: "Invalid authentication"
                    }, 'user', 401));
        }
    }

    checkDevice (req, res, user) {
        var userID = user._id;
        var timeNow = moment().format('YYYY-MM-DD HH:mm:ss');
        var anti_spoofing_code = user.anti_spoofing_code;
        // Find some documents
        deviceMangement.countDocuments({ user: userID }, (err, count) => {
            if(!count) {
                // insert new device records
                this.insertDevice(req, userID, true).then((device) => {
                    // insert login history
                    this.insertLoginHistory(req, userID, device._id, timeNow);
                });
                
                // send email notification
                this.sendNotification({ 'ip': req.body.data.attributes.ip, 'time': timeNow, 'to_email': req.body.data.attributes.email, 'browser': req.body.data.attributes.browser, 'browser_version': req.body.data.attributes.browser_version, 'os': req.body.data.attributes.os, 'anti_spoofing_code': (user.anti_spoofing_code === null) ? false : user.anti_spoofing_code });

                return res.status(200).send(this.successFormat({
                    "token": this.createToken(user),
                    "google_auth": user.google_auth,
                    "sms_auth": user.sms_auth,
                    "anti_spoofing": user.anti_spoofing,
                    "anti_spoofing_code": ( anti_spoofing_code === null ) ? null : anti_spoofing_code.substring(0,2),
                    "loggedIn": timeNow
                }, user._id));

            } else {
                deviceMangement.findOne({ user: userID, ip: req.body.data.attributes.ip, verified: true })
                .exec()
                .then((result) => {
                    if (!result) {
                        // insert new device records
                        this.insertDevice(req, userID).then(() => { });
                        let urlHash = this.encryptHash({ "user_id": userID, "ip": req.body.data.attributes.ip, "verified": true });
                        
                        // send email notification
                        this.sendNotificationForAuthorize({ "to_email": req.body.data.attributes.email,"subject": `Authorize New Device ${req.body.data.attributes.ip} - ${timeNow} ( ${config.get('settings.timeZone')} )`,"email_for": "user-authorize", "device": `${req.body.data.attributes.browser} ${req.body.data.attributes.browser_version} ( ${req.body.data.attributes.os} )`, "location": `${req.body.data.attributes.city} ${req.body.data.attributes.country}`, "ip": req.body.data.attributes.ip, "hash": urlHash, 'anti_spoofing_code': (user.anti_spoofing_code === null) ? false : user.anti_spoofing_code, "user_id": user._id })
                        return res.status(401).send(this.errorMsgFormat({ 'msg' : 'unauthorized', 'hash': urlHash }, 'users', 401));
                    } else {
                        // insert new device records
                        this.insertDevice(req, userID, true).then(async (device) => {
                            // insert login history
                            this.insertLoginHistory(req, userID, device._id, timeNow);
                        });
                        
                        // send email notification
                        this.sendNotification({ 'ip': req.body.data.attributes.ip, 'time': timeNow, 'to_email': req.body.data.attributes.email, 'browser': req.body.data.attributes.browser, 'browser_version': req.body.data.attributes.browser_version, 'os': req.body.data.attributes.os, 'anti_spoofing_code': (user.anti_spoofing_code === null) ? false : user.anti_spoofing_code, "disableAccount": user._id  });
                        
                        return res.status(200).send(this.successFormat({
                            "token": this.createToken(user),
                            "google_auth": user.google_auth,
                            "sms_auth": user.sms_auth,
                            "anti_spoofing": user.anti_spoofing,
                            "anti_spoofing_code": ( anti_spoofing_code === null ) ? null : anti_spoofing_code.substring(0,2),
                            "loggedIn": timeNow
                        }, user._id));
                    }
                    });
            }
        });
    }

    // send email notification to the authorize device
    sendNotificationForAuthorize(data) {
        userServices.sendEmailNotification(data);
    }

    // send email notification to the registered user
    sendNotification  (data) {
        let serviceData   = {
            "to_email": data.to_email,
            "subject": `Successful Login From New IP ${data.ip} - ${data.time} ( ${config.get('settings.timeZone')} )`,
            "email_for": "user-login",
            "device": `${data.browser} ${data.browser_version} ( ${data.os} )`,
            "time": data.time,
            "ip": data.ip,
            'anti_spoofing_code': data.anti_spoofing_code,
            "user_id": data.user_id
        };

        userServices.sendEmailNotification(serviceData);
    }

    insertDevice (req, userID, verify = false, cb) {
        let data = {
            user: userID,
            is_browser: req.body.data.attributes.is_browser,
            is_mobile: req.body.data.attributes.is_mobile,
            os: req.body.data.attributes.os,
            os_byte: req.body.data.attributes.os_byte,
            browser: req.body.data.attributes.browser,
            browser_version: req.body.data.attributes.browser_version,
            ip: req.body.data.attributes.ip,
            city: req.body.data.attributes.city,
            region: req.body.data.attributes.region,
            country: req.body.data.attributes.country,
            verified: verify
        };

        return new deviceMangement(data).save(cb);
    }

    insertLoginHistory ( req, userID, deviceID, timeNow) {
        loginHistory.create({
            user: userID,
            device: deviceID,
            auth_type: req.body.data.attributes.auth_type ? req.body.data.attributes.auth_type : 1,
            login_date_time: timeNow
        }, (err) => {
            if (err) {
                return res.status(500).json(this.errorMsgFormat({ 'message': err.message }));
            }
        });

        return true;
    }

    getLoginHistory (req, res) {
        let pageNo  = parseInt(req.query.page_no)
        let size    = parseInt(req.query.size)
        let query   = {}
        if(pageNo < 0 || pageNo === 0) {
            return res.status(404).json(this.errorMsgFormat({"message" : "invalid page number, should start with 1"}))
        }

        query.skip  = size * (pageNo - 1)
        query.limit = size

        let userID = this.getTokenToUserId(req, res, 'ID');

        // Find some documents
        loginHistory.countDocuments({ user: userID }, (err, totalCount) => {
            if(err) {
                return res.status(404).json(this.errorMsgFormat({"message" : "No data found"}, 'loginHistory', 404))
            } else {
                loginHistory
                .find({ user: userID })
                .select('-__v -_id')
                .skip(query.skip)
                .limit(query.limit)
                .populate({ path: 'device', select: '-_id -user -created_date -__v'})
                .exec()
                .then((data) => {
                    if(!data.length) {
                        return res.status(404).json(this.errorMsgFormat({"message" : "No data found"}, 'loginHistory', 404));
                    } else {
                        var totalPages = Math.ceil(totalCount / size);
                        return res.status(200).json(this.successFormat({"data" : data, "pages": totalPages, "totalCount": totalCount}, userID, 'loginHistory', 200));
                    }
                });
            }
        });
    }

    getDeviceHistory (req, res) {
        let pageNo  = parseInt(req.query.page_no)
        let size    = parseInt(req.query.size)
        let query   = {}
        if(pageNo < 0 || pageNo === 0) {
            return res.status(404).json(this.errorMsgFormat({"message" : "invalid page number, should start with 1"}))
        }

        query.skip  = size * (pageNo - 1)
        query.limit = size

        let userID = this.getTokenToUserId(req, res, 'ID');

        // Find some documents
        deviceMangement.countDocuments({ user: userID }, (err, totalCount) => {
            if(err) {
                return res.status(404).json(this.errorMsgFormat({"message" : "No data found"}, 'device', 404))
            } else {
                deviceMangement.find({ user: userID }, '-_id -__v -user', query, (err, data) => {
                    if(err || !data.length) {
                        return res.status(404).json(this.errorMsgFormat({"message" : "No data found"}, 'device', 404));
                    } else {
                        var totalPages = Math.ceil(totalCount / size);
                        return res.status(200).json(this.successFormat({"data" : data, "pages": totalPages, "totalCount": totalCount}, userID, 'devices', 200));
                    }
                });
            }
        });
    }

    encryptHash (jsonData) {
        let timeNow     = moment().format('YYYY-MM-DD HH:mm:ss');
        let data     = JSON.stringify({
            'data': jsonData,
            'datetime' : timeNow
        });

        return helpers.encrypt(data);
    }

    checkTimeExpired ( startDate ) {
        let duration    = moment.duration(moment().diff(startDate));

        // check expiry time in seconds
        if (config.get('settings.expiryTime') > duration.asSeconds()) {
            return true;
        }

        return false;
    }

    patchWhiteListIP (req, res) {
        let deviceHash = JSON.parse(helpers.decrypt(req.params.hash));
        if ( deviceHash.data.user_id ) {
            let checkExpired = this.checkTimeExpired(deviceHash.data.datetime);
            if ( checkExpired ) {
                deviceMangement.findOne({ ip: deviceHash.data.ip, user: deviceHash.data.user_id })
                .exec()
                .then((result) => {
                    if (!result) {
                        return res.status(400).send(this.errorMsgFormat({
                            'message': 'Invalid token. may be token as expired!'
                        }));
                    } else {
                      this.updateWhiteListIP(deviceHash, res);
                    }
                });
            } else {
                return res.status(404).send(this.errorMsgFormat({
                    'message': 'invalid token or token is expired.'
                }));
            }
        } else {
            return res.status(404).send(this.errorMsgFormat({
                'message': 'invalid token or token is expired.'
            }));
        }
    }

    updateWhiteListIP (hash, res) {

          // find and update the reccord
          deviceMangement.updateMany({ 'ip': hash.data.ip , 'user': hash.data.user_id }, { verified: hash.data.verified }, (err, device) => {
            if (err) {
                return res.status(404).send(this.errorMsgFormat({'message': 'Invalid device.' }));
            } else {
                return res.status(202).send(this.successFormat({
                    'message': 'Your IP address whitelisted Now you can able to login..'
                }, device.user, 'users', 202));
            }
        });
    }

    settingsValidate (req) {
        let schema = Joi.object().keys({
                        sms_auth: Joi.bool().optional(),
                        password: Joi.string().optional(),
                        google_auth: Joi.boolean().optional(),
                        google_secrete_key: Joi.string().optional(),
                        mobile: Joi.number().optional(),
                        mobile_code: Joi.number().optional(),
                        anti_spoofing: Joi.boolean().optional(),
                        anti_spoofing_code: Joi.string().optional(),
                    });

        return Joi.validate(req, schema, { abortEarly: false });
    }

    patchSettings (req, res) {
        let requestData = req.body.data.attributes;
        if (requestData.code !== undefined) {
            let userHash = JSON.parse(helpers.decrypt(requestData.code));
            requestData.is_active = userHash.is_active;
        }

        if (req.body.data.id !== undefined && Object.keys(requestData).length) {

            // find and update the reccord
            users.findOneAndUpdate({ _id: req.body.data.id }, { $set: requestData })
            .then(result => {
                return res.status(202).send(this.successFormat({
                    'message': 'Your request is updated successfully.'
                }, result._id, 'users', 202));
            })
            .catch(err => {
                return res.status(404).send(this.errorMsgFormat({'message': err.message }));
            });
        } else {
            return res.status(400).send(this.errorMsgFormat({'message': 'Invalid request.' }, 'users', 400));
        }
    }

    disableAccount (req, res) {
        let requestedData = req.body.data.attributes;
        let userHash = JSON.parse(helpers.decrypt(requestedData.code));
        if ( userHash.is_active !== undefined ) {
            this.patchSettings(req, res);
        } else {
            return res.status(400).send(this.errorMsgFormat({'message': 'Invalid request..' }, 'users', 400));
        }
    }

    async patch2FAuth (req, res) {
        var requestedData = req.body.data.attributes;
        if ( ( requestedData.password !== undefined && requestedData.g2f_code !== undefined )  && req.body.data.id != undefined ) {
            let result = await users.findById(req.body.data.id).exec();
            if (!result) {
                return res.status(400).send(this.errorMsgFormat({
                    'message': 'Invalid user'
                }));
            }else if (requestedData.password !== undefined ) {
                let passwordCompare = bcrypt.compareSync(requestedData.password, result.password);
                if (passwordCompare == false) {
                    return res.status(400).send(this.errorMsgFormat({
                        'message': 'Incorrect password'
                    }));
                }
            }
            
            return this.updateG2F(req, res)
        } else {
            return res.status(400).send(this.errorMsgFormat({
                'message': 'Invalid request'
            }));
        }
    }

    async updateG2F (req, res) {
        let check = await this.postVerifyG2F(req, res, 'boolean');
        if (check === true) {
            // delete password attribute
            delete req.body.data.attributes.password;

            return this.patchSettings(req, res);
        } else {
            return res.status(400).send(this.errorMsgFormat({
                'message': 'Incorrect code'
            }));
        }
    }

    async verifyG2F (req, res, type, google_secrete_key) {
        let opts = {
            beforeDrift: 2,
            afterDrift: 2,
            drift: 4,
            step: 30
        };
        let counter = Math.floor(Date.now() / 1000 / opts.step);
        let returnStatus = await g2fa.verifyHOTP(google_secrete_key, req.body.data.attributes.g2f_code, counter, opts);
        if (type === 'boolean') {
            return returnStatus;
        } else {
            if (returnStatus === true) {
                return res.status(200).send(this.successFormat({
                    'status': returnStatus
                }, '2factor', 200));
            } else {
                return res.status(400).send(this.successFormat({
                    'status': returnStatus,
                    'message': 'Incorrect code'
                }, '2factor', 400));
            }
        }
    }

    async postVerifyG2F (req, res, type = 'json') {
        let requestedData = req.body.data.attributes;
        if (requestedData.g2f_code !== undefined) {
            if ( requestedData.google_secrete_key === undefined ) {
                let result = await users.findById(req.body.data.id).exec();
                if (!result) {
                    return res.status(400).send(this.errorMsgFormat({
                        'message': 'Invalid data'
                    }));
                } 
                return this.verifyG2F(req, res, type, result.google_secrete_key);
            } else {
                return this.verifyG2F(req, res, type, requestedData.google_secrete_key);
            }
        } else {
            return res.status(400).send(this.errorMsgFormat({
                'message': 'Invalid request'
            }, '2factor', 400));
        }
    }
}

module.exports = new User;