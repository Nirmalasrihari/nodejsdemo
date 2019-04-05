const express       = require('express');
const user          = require('../core/user');
const password      = require('../core/password');
const Controller    = require('../core/controller');
const auth          = require("../middlewares/authentication");
const registration  = require('../core/registration');
const slide           = require('../core/geetest-captcha');
const router        = express.Router();
const controller    = new Controller;



router.get('/activation/:hash', (req, res) => {
    try {
        user.activate(req, res);
    }
    catch (err) {
        return res.status(500).send(controller.errorMsgFormat({'message': 'Invalid token.' }, 'users', 500));
    }
});

router.post('/login', (req, res) => {
    try {
        
        let { error }  = user.validate(req.body.data.attributes);
        if (error) {
            return res.status(400).send(controller.errorFormat(error, 'users', 400));
        } else {
            user.login(req, res);
        }
    }
    catch (err) {
        return res.status(500).send(controller.errorMsgFormat({'message': err.message }, 'users', 500));
    }
});

router.delete('/', (req, res) => {
    user.removeUser(req.body.data.attributes.email, res);
});

router.post('/forget-password', (req, res) => {
    try {
        let { error }  = password.validate(req.body.data.attributes);
        if (error) {
            return res.status(400).send(controller.errorFormat(error, 'users', 400));
        } else {
            password.sendResetLink(req, res);
        }
    }
    catch (err) {
        return res.status(500).send(controller.errorMsgFormat({'message': err.message }, 'users', 500));
    }
});

router.get('/reset-password/:hash', (req, res) => {
    try {
        password.checkResetLink(req, res);
    }
    catch (err) {
        return res.status(500).send(controller.errorMsgFormat({'message': err.message }, 'users', 500));
    }
});


router.patch('/reset-password', (req, res) => {
    try {
        let { error }  = password.resetPasswordValidate(req.body.data.attributes);
        if (error) {
            return res.status(400).send(controller.errorFormat(error, 'users', 400));
        } else {
            password.resetPassword(req, res);
        }
    }
    catch (err) {
        return res.status(500).send(controller.errorMsgFormat({'message': err.message }, 'users', 500));
    }
});

router.patch('/change-password', auth, (req, res) => {
    try {
        let { error }  = password.changePasswordValidate(req.body.data.attributes);

        if (error) {
            return res.status(400).send(controller.errorFormat(error, 'users', 400));
        } else {
            password.changePassword(req, res);
        }
    }
    catch (err) {
        return res.status(500).send(controller.errorMsgFormat({'message': err.message }, 'users', 500));
    }
});

router.post('/get-user-id', (req, res) => {
    try {
        if (req.headers.authorization) {
            user.getTokenToUserId(req, res);
        } else {
            return res.status(401).json(controller.errorMsgFormat({
                message: "Invalid authentication"
            }, 'users', 500));
        }
    }
    catch (err) {
        return res.status(500).send(controller.errorMsgFormat({'message': err.message }, 'users', 500));
    }
});

router.get('/login-history', auth, (req, res) => {
    try {
        user.getLoginHistory(req, res);
    }
    catch (err) {
        return res.status(500).send(controller.errorMsgFormat({'message': err.message }, 'users', 500));
    }
});

router.get('/device-history', auth, (req, res) => {
    try {
        user.getDeviceHistory(req, res);
    }
    catch (err) {
        return res.status(500).send(controller.errorMsgFormat({'message': err.message }, 'users', 500));
    }
});

router.patch('/whitelist-ip/:hash', (req, res) => {
    try {
        user.patchWhiteListIP(req, res);
    }
    catch (err) {
        return res.status(500).send(controller.errorMsgFormat({'message': err.message }, 'users', 500));
    }
});

router.patch('/settings', auth, (req, res) => {
    try {
        let { error }  = user.settingsValidate(req.body.data.attributes);

        if (error) {
            return res.status(400).send(controller.errorFormat(error, 'users', 400));
        } else {
            user.patchSettings(req, res);
        }
    }
    catch (err) {
        return res.status(500).send(controller.errorMsgFormat({'message': err.message }, 'users', 500));
    }
});

router.post('/resend-email', (req, res) => {
    try {
        registration.resendEmail(req, res);
    }
    catch (err) {
        return res.status(500).send(controller.errorMsgFormat({'message': err.message }));
    }
});

router.patch('/disable', (req, res) => {
    try {
        user.disableAccount(req, res);
    }
    catch (err) {
        return res.status(500).send(controller.errorMsgFormat({'message': err.message }, 'users', 500));
    }
});

router.get("/gt/register-slide", function (req, res) {

    try {
        slide.register(null, function (err, data) {
            if (err) {
                console.error(err);
                res.status(500);
                res.send(err);
                return;
            }
            return res.status(200).json(controller.successFormat({
                'message': 'Captcha values fetching successfully...',
                'data' : data
            }));
        });
    }
    catch (err) {
        return res.status(500).send(controller.errorMsgFormat({'message': err.message }, 'users', 500));
    }
});

router.patch('/g2f-settings', (req, res) => {
    try {
        user.patch2FAuth(req, res);
    }
    catch (err) {
        return res.status(500).send(controller.errorMsgFormat({'message': err.message }, 'users', 500));
    }
});



module.exports = router;