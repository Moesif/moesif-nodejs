

function createBatcher(handleBatch, maxSize, maxTime) {
  return {
    dataArray: [],
    // using closure, so no need to keep as part of the object.
    // maxSize: maxSize,
    // maxTime: maxTime,
    add: function(data) {
      this.dataArray.push(data);
      if (this.dataArray.length >= maxSize) {
        this.flush();
      } else if (maxTime && this.dataArray.length === 1) {
        var self = this;
        this._timeout = setTimeout(function() {
          self.flush();
        }, maxTime);
      }
    },
    flush: function() {
      // note, in case the handleBatch is a
      // delayed function, then it swaps before
      // sending the current data.
      clearTimeout(this._timeout);
      this._lastFlush = Date.now();
      var currentDataArray = this.dataArray;
      this.dataArray = [];
      handleBatch(currentDataArray);
    }
  };
}

module.exports = createBatcher;
