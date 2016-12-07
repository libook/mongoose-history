"use strict";
const mongoose = require('mongoose');
const hm = require('./history-model');
const async = require('async')

module.exports = function historyPlugin(schema, options) {
  const customCollectionName  = options && options.customCollectionName;
  const customDiffAlgo = options && options.customDiffAlgo;
  const diffOnly  = options && options.diffOnly;
  const metadata = options && options.metadata;

  // Clear all history collection from Schema
  schema.statics.historyModel = function() {
    return hm.HistoryModel(hm.historyCollectionName(this.collection.name, customCollectionName), options);
  };

  // Clear all history documents from history collection
  schema.statics.clearHistory = function(callback) {
    const History = hm.HistoryModel(hm.historyCollectionName(this.collection.name, customCollectionName), options);
    History.remove({}, function(err) {
      callback(err);
    });
  };

  // Save original data
  schema.post( 'init', function() {
    if (diffOnly){
      this._original = this.toObject();
    }
  });

  function setMetadata(original, d, historyDoc, callback){
    async.each(metadata, (m, cb) => {
      if (typeof(m.value) === 'function'){
        if (m.value.length === 3){
          /** async function */
          m.value(original, d, function(err, data){
            if (err) cb(err);
            historyDoc[m.key] = data;
            cb();
          })
        } else {
          historyDoc[m.key] = m.value(original, d);
          cb();
        }
      } else {
        historyDoc[ m.key] = d ? d[ m.value] : null;
        cb();
      }
    }, callback)
  }


  // Create an copy when insert or update, or a diff log
  schema.pre('save', function(next) {
    if (this.constructor.name !== 'model') {
      return next();
    }

    const historyDoc = {};

    if(diffOnly && !this.isNew) {
      var original = this._original;
      delete this._original;
      var d = this.toObject();
      var diff = {};
      diff['_id'] = d['_id'];
      for(var k in d){
        if(customDiffAlgo) {
          var customDiff = customDiffAlgo(k, d[k], original[k]);
          if(customDiff) {
            diff[k] = customDiff.diff;
          }
        } else {
          if(String(d[k]) != String(original[k])){
            diff[k] = d[k];
          }
        }
      }
      diff.__v = undefined;
      historyDoc['t'] = new Date();
      historyDoc['o'] = 'u';
      historyDoc['d'] = diff;
    } else {
      var d = this.toObject();
      d.__v = undefined;
      historyDoc['t'] = new Date();
      historyDoc['o'] = this.isNew ? 'i' : 'u';
      historyDoc['d'] = d;
    }

    if (metadata){
      setMetadata(original, d, historyDoc, (err) => {
        if (err) return next(err)
        let history = new hm.HistoryModel(hm.historyCollectionName(this.collection.name, customCollectionName), options)(historyDoc);
        history.save(next);
      })
    } else {
      let history = new hm.HistoryModel(hm.historyCollectionName(this.collection.name, customCollectionName), options)(historyDoc);
      history.save(next);
    }
  });

  // Listen on update
  schema.pre('update', function(next) {
    if (this.constructor.name !== 'model') {
      return next();
    }

    let d = this._update.$set;
    d.__v = undefined;

    let historyDoc = {};
    historyDoc['t'] = new Date();
    historyDoc['o'] = 'u';
    historyDoc['d'] = d;
    if (metadata){
      setMetadata(this.toObject, d, historyDoc, (err) => {
        let history = new hm.HistoryModel(hm.historyCollectionName(this.mongooseCollection.collectionName, customCollectionName), options)(historyDoc);
        history.save(next);
      })
    } else {
      let history = new hm.HistoryModel(hm.historyCollectionName(this.mongooseCollection.collectionName, customCollectionName), options)(historyDoc);
      history.save(next);
    }
  });

  // Create an copy when insert or update
  schema.pre('remove', function(next) {
    if (this.constructor.name !== 'model') {
      return next();
    }

    let d = this.toObject();
    d.__v = undefined;
    let historyDoc = {};
    historyDoc['t'] = new Date();
    historyDoc['o'] = 'r';
    historyDoc['d'] = d;
    if (metadata){
      setMetadata(this.toObject(), this.toObject(), historyDoc, (err) =>{
        let history = new hm.HistoryModel(hm.historyCollectionName(this.collection.name, customCollectionName), options)(historyDoc);
        history.save(next);
      })
    } else {
      let history = new hm.HistoryModel(hm.historyCollectionName(this.collection.name, customCollectionName), options)(historyDoc);
      history.save(next);
    }
  });
};
