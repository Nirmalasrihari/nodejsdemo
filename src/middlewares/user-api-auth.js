
const Utils = require('../helpers/utils');
const utils = new Utils();
const users = require('../db/users');
const userApikey = require('../db/api-keys');
let ValidateAPIKey = async (apiKey) => {
    
    let checkApiKey = await userApikey.findOne({ apikey: apiKey, is_deleted: false });
    if (checkApiKey) {
        return { status: true, result: checkApiKey }
    }
    return { status: false }
}

let validateSignature = async req => {
    const [apiKey, passphrase, timestamp, reqSignature] = req.body;
    let checkValidateAPIKey = await ValidateAPIKey(apiKey);
    if (!checkValidateAPIKey.status) {
        return { status: false }
    }
    const apiKeySplit = apiKey.split('-');
    const apiSecret = utils.createSecret(`${apiKeySplit[0]}-${apiKeySplit[apiKeySplit.length - 1]}`, passphrase);

    const signatureString = `${timestamp}/users/ws/verify`;
    const signature = utils.createSignature(signatureString, apiSecret);
    if (reqSignature == signature) {
        return { status: true, result: checkValidateAPIKey.result }
    }
    return { status: false }
}



module.exports = async function (req, res, next) {
    let valid = await validateSignature(req);
    if (valid.status) {
        let data = await users.findOne({ user_id: valid.result.user_id });
        req.takerFee = data.taker_fee;
        req.makerFee = data.maker_fee;
        req.user = valid.result.user_id
        next();
    } else {
        res.status(200).send({ status : false ,error: 'Unauthorized' });
    }
}

