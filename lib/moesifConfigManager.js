var moesifController = require('moesifapi').ApiController;

//const CONFIG_UPDATE_DELAY = 300000; // 5 minutes
const CONFIG_UPDATE_DELAY = 5000;
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

MoesifConfigManager.prototype.configStale = function () {
  return !this._config || (
    this._lastSeenHash !== this._configHash &&
    now() - this._lastConfigUpdate > CONFIG_UPDATE_DELAY
  );
};

MoesifConfigManager.prototype.tryGetConfig = function () {
  if (!this._loadingConfig && this.configStale()) {
    // only send one config request at a time
    this._loadingConfig = true;

    var that = this;

    moesifController.getAppConfig(function (_, __, event) {
      that._loadingConfig = false;

      if (event && event.response.statusCode === 200) {
        that._configHash = event.response.headers[HASH_HEADER];
        try {
          that._config = JSON.parse(event.response.body);
        } catch (e) {
          console.warn('moesif-express: error parsing config');
        }
      }
    });
  }
};

MoesifConfigManager.prototype._getSampleRate = function () {
  return this._config
    ? this._config.sample_rate
    : 100;
}

MoesifConfigManager.prototype.shouldSend = function () {
  const random = Math.random() * 100;

  return random <= this._getSampleRate();
};

MoesifConfigManager.prototype.tryUpdateHash = function (response) {
  if (response && response.headers && response.headers[HASH_HEADER]) {
    this._lastSeenHash = response.headers[HASH_HEADER];
  }
};

module.exports = new MoesifConfigManager();