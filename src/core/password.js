const Joi = require('joi');
const Users = require('../db/users');
const apiServices = require('../services/api');
const Controller = require('../core/controller');
const helpers = require('../helpers/helper.functions');
const config = require('config');
const bcrypt = require('bcrypt');
const mangHash = require('../db/management-hash');
const moment = require('moment');
const user = require('../core/user');
let checkHash = null;
class Password extends Controller {

    validate(req) {
        let emailReg = /^(([^<>()\[\]\.,;:\s@\"]+(\.[^<>()\[\]\.,;:\s@\"]+)*)|(\".+\"))@(([^<>()[\]\.,;:\s@\"]+\.)+[^<>()[\]\.,;:\s@\"]{2,})$/i;
        let schema = Joi.object().keys({
            email: Joi.string().required().regex(emailReg).options({
                language: {
                    string: {
                        required: '{{label}} is required',
                        regex: {
                            base: 'Invalid {{label}} address.'
                        }
                    }
                }
            }).label('email'),
            ip: Joi.string().allow('').optional()
        });

        return Joi.validate(req, schema, { abortEarly: false });
    }

    encryptHash(email, user) {
        let timeNow = moment().format('YYYY-MM-DD HH:mm:ss');
        let data = JSON.stringify({
            'email': email,
            'datetime': timeNow,
            'user': user

        });

        return helpers.encrypt(data);
    }


    sendResetLink(req, res) {

        Users.findOne({
            email: req.body.data.attributes.email
        }).exec()
            .then(async (user) => {
                if (!user) {
                    return res.status(400).json(this.errorMsgFormat({ 'message': 'User not found, please login.' }));
                } else {
                    let encryptedHash = this.encryptHash(user.email, user._id);

                    // send email notification to the registered user
                    let serviceData = {
                        'hash': encryptedHash,
                        'subject': `Password Reset - ${moment().format('YYYY-MM-DD HH:mm:ss')} (${config.get('settings.timeZone')})`,
                        'email_for': 'forget-password',
                        'user_id': user._id
                    };
                    await apiServices.sendEmailNotification(serviceData);
                    await mangHash.findOneAndUpdate({email:user.email, is_active: false, type_for: "reset"},{is_active:true,created_date: moment().format('YYYY-MM-DD HH:mm:ss')})
                    await new mangHash({ email: user.email, hash: encryptedHash, type_for: "reset", created_date: moment().format('YYYY-MM-DD HH:mm:ss') }).save();
                    return res.status(200).json(this.successFormat({
                        'message': 'We have sent a email to your email address.',
                        'hash': encryptedHash
                    }, user._id));
                }
            });
    }
    async forgetPasswordResend(req, res) {
        let input = req.body.data;
        let user = await Users.findOne({ _id:input.id,email:input.attributes.email });
        if (user) {
            let ischecked = await mangHash.findOne({ email: user.email, is_active: false, type_for: "reset"})
            if (ischecked) {
                if (ischecked.count > config.get('site.hmtLink')) {
                    await mangHash.findOneAndUpdate({ email: user.email, is_active: false, type_for: "reset" }, { is_active: true, created_date: moment().format('YYYY-MM-DD HH:mm:ss') })
                    return res.status(400).send(this.errorMsgFormat({
                        'message': ` Verification link resent request exceeded, please login again `
                    }, 'users', 400));
                }
            }
            let encryptedHash = this.encryptHash(user.email, user._id);
            if (ischecked) {
                let count = ischecked.count;
                await mangHash.findOneAndUpdate({ email: user.email, is_active: false, type_for: "reset" }, { hash: encryptedHash, count: ++count, created_date: moment().format('YYYY-MM-DD HH:mm:ss') });
            }
            let serviceData = {
                'hash': encryptedHash,
                'subject': `Password Reset - ${moment().format('YYYY-MM-DD HH:mm:ss')} (${config.get('settings.timeZone')})`,
                'email_for': 'forget-password',
                'user_id': user._id
            };
            
            await apiServices.sendEmailNotification(serviceData);
            return res.status(200).json(this.successFormat({
                'message': 'We have sent a email to your email address.',
                'hash': encryptedHash
            }, user._id));

        }
        else {
            return res.status(400).send(this.errorMsgFormat({ 'message': 'User not found, please register again' },'user',400));
        }



    }
    async checkResetLink(req, res) {


        let userHash = JSON.parse(helpers.decrypt(req.params.hash));
        let checkHash = await mangHash.findOne({ email: userHash.email, hash: req.params.hash });

        if (checkHash)  {
            if (checkHash.is_active) {
                return res.status(400).send(this.errorMsgFormat({
                    'message': 'Verification link -already used'
                }));
            }
            else {
                req.body.checkHash=checkHash;
                await this.resetPassword(req,res,'hash');
               
            }
        }

        else {
            return res.status(400).send(this.errorMsgFormat({
                'message': 'Verification link is expired'
            }));
        }
        if (userHash.email) {
            let checkExpired = this.checkTimeExpired(userHash.datetime);
            if (checkExpired) {
                Users.findOne({ email: userHash.email, _id: userHash.user })
                    .exec()
                    .then(async (result) => {
                        if (!result) {
                            return res.status(400).send(this.errorMsgFormat({
                                'message': "User not found"
                            }));
                        } else {
                            return res.status(200).send(this.successFormat({
                                'message': 'Token is Valid'
                            }, result._id));
                        }
                    });
            } else {
                return res.status(404).send(this.errorMsgFormat({
                    'message': 'Token is expired.'
                }));
            }
        } else {
            return res.status(404).send(this.errorMsgFormat({
                'message': 'Email id not found'
            }));
        }
    }

    checkTimeExpired(startDate) {
        let date = new Date(startDate);
        let getSeconds = date.getSeconds() + config.get('activation.expiryTime');
        let duration = moment.duration(moment().diff(startDate));
        console.log('Second:', duration.asSeconds());
        if (getSeconds > duration.asSeconds()) {
            return true;
        }
        return false;
    }

    resetPasswordValidate(req) {
        let schema = Joi.object().keys({
            password: Joi.string().required().regex(/^(?=.*?[A-Z])(?=.*?[0-9]).{8,}$/).options({
                language: {
                    string: {
                        required: '{{label}} field is required',
                        regex: {
                            base: '{{label}} must be at least 8 characters with uppercase letters and numbers.'
                        }
                    }
                }
            }).label('password'),
            password_confirmation: Joi.any().valid(Joi.ref('password')).required().label('password confirmation').options({ language: { any: { allowOnly: 'must match password' } } }),
            hash:Joi.string()
        });

        return Joi.validate(req, schema, { abortEarly: false })
    }

    resetPassword(req, res, type = 'reset') {
     
        if(type == 'hash')
        {
            checkHash=req.body.checkHash;
            return;
        }
        console.log("Hash:",checkHash);
        bcrypt.genSalt(10, (err, salt) => {
            if (err) return res.status(404).send(this.errorMsgFormat({ 'message': 'Invalid user.' }));

            bcrypt.hash(req.body.data.attributes.password, salt, (err, hash) => {
                if (err) return res.status(404).send(this.errorMsgFormat({ 'message': 'Invalid user.' }));

                // find and update the reccord
                Users.findByIdAndUpdate(req.body.data.id, { password: hash }, async (err, user) => {
                    if (user == null) {
                        return res.status(404).send(this.errorMsgFormat({ 'message': 'Invalid user.' }));
                    } else {
                        
                        if (type == 'change') {
                            let serviceData =
                            {
                                subject: `Beldex Change Password From ${req.body.data.attributes.email} - ${moment().format('YYYY-MM-DD HH:mm:ss')}( ${config.get('settings.timeZone')} )`,
                                email_for: "confirm-password",
                                email: req.body.data.attributes.email,
                                user_id: req.body.data.attributes.user_id
                            }
                            await apiServices.sendEmailNotification(serviceData);

                            return res.status(202).send(this.successFormat({
                                'message': 'Your password updated successfully.'
                            }, user._id, 'users', 202));
                        }
                        if(checkHash!=null)
                        {
                            await mangHash.findOneAndUpdate({email:checkHash.email,hash:checkHash.hash,is_active: false, type_for: "reset" }, { is_active: true, created_date: moment().format('YYYY-MM-DD HH:mm:ss') })
                        }
                        let serviceData =
                        {
                            subject: `Beldex Reset Password  ${moment().format('YYYY-MM-DD HH:mm:ss')}( ${config.get('settings.timeZone')} )`,
                            email_for: "reset-password",
                            email: user.email,
                            user_id: user._id
                        }
                        await apiServices.sendEmailNotification(serviceData);

                        return res.status(202).send(this.successFormat({
                            'message': 'Your password updated successfully.'
                        }, user._id, 'users', 202));
                    }
                });
            });
        });
    }

    changePasswordValidate(req) {
        let schema = Joi.object().keys({
            g2f_code: Joi.string(),
            old_password: Joi.string().required(),
            password: Joi.string().required().regex(/^(?=.*?[A-Z])(?=.*?[0-9]).{8,}$/).options({
                language: {
                    string: {
                        required: '{{label}} field is required',
                        regex: {
                            base: '{{label}} must be at least 8 characters with uppercase letters and numbers.'
                        }
                    }
                }
            }).label('password'),
            password_confirmation: Joi.any().valid(Joi.ref('password')).required().label('password confirmation').options({ language: { any: { allowOnly: 'must match password' } } }),
        });

        return Joi.validate(req, schema, { abortEarly: false })
    }

    changePassword(req, res) {
        Users.findById(req.body.data.id)
            .exec()
            .then(async (result) => {
                let check = null;
                if (!result) {
                    return res.status(400).send(this.errorMsgFormat({
                        'message': 'Invalid data'
                    }));
                }
                if (req.body.data.attributes.g2f_code) {
                    check = await user.postVerifyG2F(req, res, 'boolean');
                    if (check.status == true) {
                        // compare existing password
                        let passwordCompare = bcrypt.compareSync(req.body.data.attributes.old_password, result.password);

                        if (passwordCompare == false) {
                            return res.status(400).send(this.errorMsgFormat({
                                'message': 'Entered current password is incorrect. Please check.'
                            }));
                        } else {
                            req.body.data.attributes.email = result.email;
                            req.body.data.attributes.user_id = result._id;
                            // update password
                            this.resetPassword(req, res, 'change', result.email);
                        }
                    }
                    else {

                        return res.status(400).send(this.errorMsgFormat({
                            'message': 'Incorrect code'
                        }, '2factor', 400));
                    }
                }
                else {
                    // compare existing password
                    let passwordCompare = bcrypt.compareSync(req.body.data.attributes.old_password, result.password);

                    if (passwordCompare == false) {
                        return res.status(400).send(this.errorMsgFormat({
                            'message': 'Entered current password is incorrect. Please check.'
                        }));
                    } else {
                        req.body.data.attributes.email = result.email;
                        req.body.data.attributes.user_id = result._id;
                        // update password
                        this.resetPassword(req, res, 'change', result.email);
                    }
                }




            });
    }
}

module.exports = new Password;