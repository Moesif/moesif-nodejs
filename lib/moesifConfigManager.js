/*
 * MoesifConfigManager is responsible for fetching and ensuring
 * the config for our api appId is up to date.
 *
 * This is done by ensuring the x-moesif-config-etag doesn't change.
 */

var moesifController = require('moesifapi').ApiController;

const CONFIG_UPDATE_DELAY = 300000; // 5 minutes
const HASH_HEADER = 'x-moesif-config-etag';

function now() {
  return new Date().getTime();
}

function MoesifConfigManager() {
  this._lastConfigUpdate = 0;
}

MoesifConfigManager.prototype.hasConfig = function () {
  return Boolean(this._config);
};

MoesifConfigManager.prototype.shouldFetchConfig = function () {
  // wait to reload the config, since different collector instances
  // might have different versions of the config
  return !this._config || (
    this._lastSeenHash !== this._configHash &&
    now() - this._lastConfigUpdate > CONFIG_UPDATE_DELAY
  );
};

MoesifConfigManager.prototype.tryGetConfig = function () {
  if (!this._loadingConfig && this.shouldFetchConfig()) {
    // only send one config request at a time
    this._loadingConfig = true;

    var that = this;

    moesifController.getAppConfig(function (_, __, event) {
      that._loadingConfig = false;

      if (event && event.response.statusCode === 200) {
        that._configHash = event.response.headers[HASH_HEADER];
        try {
          that._config = JSON.parse(event.response.body);
          that._lastConfigUpdate = now();
        } catch (e) {
          console.warn('moesif-express: error parsing config');
        }
      }
    });
  }
};

MoesifConfigManager.prototype._getSampleRate = function (userId, companyId) {
  if (!this._config) return 100;

  if (userId && this._config.user_sample_rate && typeof this._config.user_sample_rate[userId] === 'number') {
    return this._config.user_sample_rate[userId];
  }

  if (companyId && this._config.company_sample_rate && typeof this._config.company_sample_rate[companyId] === 'number') {
    return this._config.company_sample_rate[companyId];
  }

  return (typeof this._config.sample_rate === 'number') ? this._config.sample_rate : 100;
}


MoesifConfigManager.prototype.shouldSend = function (userId, companyId) {
  const random = Math.random() * 100;
  return random <= this._getSampleRate(userId, companyId);
};

MoesifConfigManager.prototype.tryUpdateHash = function (response) {
  if (response && response.headers && response.headers[HASH_HEADER]) {
    this._lastSeenHash = response.headers[HASH_HEADER];
  }
};

module.exports = new MoesifConfigManager();
