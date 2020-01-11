const mongoose = require('mongoose');

const schema = new mongoose.Schema({
    asset: { type: mongoose.Schema.Types.ObjectId, ref: 'assets', index: true },
    market_name: {
        type: String, required: true, index: true, unique: true, index: true
    },
    market_pair: {
        type: String, required: true, index: true
    },
    minimum_price: {
        type: Number, default: 0
    },
    q: { type: Boolean, default: false, index: true },

    q_kline: { type: Boolean, default: true },

    is_active: { type: Boolean, default: true },
    disable_trade: { type: Boolean, default: false }

})

let marketList = mongoose.model('market-list', schema);
marketList.createIndexes()
module.exports = marketList;