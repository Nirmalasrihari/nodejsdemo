const controller   = require('../core/controller');
const assets       = require('../db/assets');
const userAddress  = require('../db/user-address');
const userServices = require('../services/api');


class Wallet extends controller {

    getAssets (req, res) {
        let pageNo  = parseInt(req.query.page_no)
        let size    = parseInt(req.query.size)
        let query   = {}

        if(pageNo < 0 || pageNo === 0) {
            return res.status(404).json(this.errorMsgFormat({"message" : "invalid page number, should start with 1"}))
        }

        query.skip  = size * (pageNo - 1)
        query.limit = size

        // Find some documents
        assets.countDocuments({ is_suspend: false }, (err, totalCount) => {
            if(err) {
                return res.status(404).json(this.errorMsgFormat({"message" : "No data found"}, 'assets', 404))
            } else {
                assets.find({ is_suspend: false }, '_id asset_name asset_code logo_url', query, (err, data) => {
                    if(err || !data.length) {
                        return res.status(404).json(this.errorMsgFormat({"message" : "No data found"}, 'assets', 404));
                    } else {
                        var totalPages = Math.ceil(totalCount / size);
                        return res.status(200).json(this.successFormat({"data" : data, "pages": totalPages, "totalCount": totalCount}, null, 'assets', 200));
                    }
                });
            }
        });
    }

    async getAssetAddress (req, res) {
        let asset = req.body.data.id;
        if (asset !== undefined && asset !== '' && asset !== null) {
            let getAddress = await userAddress.findOne({ asset: asset, user: req.user.user });
            if (!getAddress) {
                return res.status(400).json(this.errorMsgFormat({ "message" : "No records found." }, 'assets', 400));
            } else {
                return res.status(200).json(this.successFormat({
                    'asset_code': getAddress.asset_code,
                    'address': getAddress.address
                }, 200, asset, 'address'));
            }
        } else {
            return res.status(400).json(this.errorMsgFormat({ "message" : "Invalid request" }, 'assets', 400));
        }
    }
}

module.exports = new Wallet;