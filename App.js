Ext.define('CustomApp', {
  extend: 'Rally.app.App',
  componentCls: 'app',

  layout: 'border',
  items: [{
    region: 'north',
    xtype: 'container',
    id: 'app-toolbar',
    layout: 'hbox',
    padding: '5 5 1 5'
  },{
    region: 'center',
    xtype: 'container',
    id: 'app-viewport',
    layout: 'fit'
  }],

  launch: function() {
    Ext.getCmp('app-toolbar').add([{
      xtype: 'rallycombobox',
      editable: false,
      width: 400,
      defaultSelectionPosition: null,
      storeConfig: {
        limit: Infinity,
        autoLoad: true,
        remoteFilter: true,
        model: 'PortfolioItem/Program',
        filters: [{
          property: 'c_ActiveTracking',
          value: true
        }],
        sorters: [{
          property: 'Name',
          direction: 'ASC'
        }]
      },
      listeners: {
        select: this._onProgramChange,
        scope: this
      }
    },{
      xtype: 'checkbox',
      id: 'hideAcceptedStories',
      fieldLabel: 'Hide Accepted Stories',
      labelWidth: 125,
      labelAlign: 'right',
      listeners: {
        change: this._updateApp,
        scope: this
      }
    }]);
  },

  _onProgramChange: function(combobox) {
    this.programRecord = combobox.getRecord();
    this._updateApp();
  },

  _updateApp: function() {
    Ext.getCmp('app-viewport').removeAll();
    Deft.Chain.pipeline([
      this._getColumnConfigs,
      this._createCardboard,
      this._getCards,
      this._addCardsToBoard
    ], this);
  },

  _getColumnConfigs: function(combobox) {
    var deferred = Ext.create('Deft.Deferred');

    var filters = [{
      property: 'Parent.ObjectID',
      value: this.programRecord.get('ObjectID')
    },{
      property: 'DirectChildrenCount',
      operator: '>',
      value: 0
    },{
      property: 'LeafStoryCount',
      operator: '>',
      value: 0
    }];

    if (Ext.getCmp('hideAcceptedStories').checked) {
      filters.push({
        property: 'PercentDoneByStoryCount',
        operator: '!=',
        value: 1
      });
    }

    Ext.create('Rally.data.WsapiDataStore', {
      limit: Infinity,
      autoLoad: true,
      model: 'PortfolioItem/ProgramComponent',
      fetch: ['Children'],
      filters: filters,
      sorters: [{
        property: 'Name',
        direction: 'ASC'
      }],
      listeners: {
        load: function(store, records) {
          if (records.length > 0) {
            Deft.Promise.all(_.map(records, function(record) {
              return function() {
                var deferred = Ext.create('Deft.Deferred');

                record.getCollection('Children').load({
                  fetch: ['ObjectID'],
                  callback: function(childRecords) {
                    record.set('Children', _.map(childRecords, function(childRecord) {
                      return childRecord.get('ObjectID');
                    }));
                    deferred.resolve();
                  }
                });

                return deferred.promise;
              }();
            })).then(function() {
              deferred.resolve(_.map(records, function(programComponentRecord) {
                return {
                  isMatchingRecord: function(cardRecord) {
                    return _.contains(programComponentRecord.get('Children'), cardRecord.get('Feature').ObjectID);
                  },
                  columnHeaderConfig: {
                    headerData: {
                      programComponent: programComponentRecord.get('_refObjectName')
                    }
                  }
                };
              }));
            });
          } else {
            Rally.ui.notify.Notifier.showError({
              message: 'No User Stories match your criteria.',
              timeout: 2000
            });
          }
        }
      }
    });

    return deferred.promise;
  },

  _createCardboard: function(columnConfigs) {
    var deferred = Ext.create('Deft.Deferred');

    Ext.getCmp('app-viewport').add({
      xtype: 'rallycardboard',
      id: 'cardboard',
      hidden: true,
      context: this.getContext(),
      readOnly: true,
      columns: columnConfigs,
      style: {
        borderTop: '1px dotted gray'
      },
      rowConfig: {
        field: 'Project'
      },
      cardConfig: {
        fields: ['Feature', 'ScheduleState']
      },
      columnConfig: {
        columnHeaderConfig: {
          headerTpl: '{programComponent}'
        }
      },
      listeners: {
        aftercolumnrender: function() {
          _.delay(function() {
            deferred.resolve();
          }, 500);
        }
      }
    });

    return deferred.promise;
  },

  _getCards: function() {
    var deferred = Ext.create('Deft.Deferred');
    
    var filters = [{
      property: 'Feature.Parent.Parent.ObjectID',
      value: this.programRecord.get('ObjectID')
    },{
      property: 'ScheduleState',
      operator: '!=',
      value: 'Incomplete'
    }];

    if (Ext.getCmp('hideAcceptedStories').checked) {
      filters.push({
        property: 'ScheduleState',
        operator: '<',
        value: 'Accepted'
      });
    }

    Ext.create('Rally.data.WsapiDataStore', {
      autoLoad: true,
      limit: Infinity,
      model: 'UserStory',
      fetch: [
        'Feature',
        'FormattedID',
        'Name',
        'ObjectID',
        'Owner',
        'Parent',
        'Project',
        'ScheduleState'
      ],
      filters: filters,
      sorters: [{
        property: 'Project',
        direction: 'ASC'
      },{
        property: 'Feature',
        direction: 'ASC'
      },{
        property: 'FormattedID',
        direction: 'ASC'
      }],
      listeners: {
        load: function(store, records) {
          deferred.resolve(records);
        }
      }
    });
    
    return deferred.promise;
  },

  _addCardsToBoard: function(cardRecords) {
    var cardboard = Ext.getCmp('cardboard');

    _.each(cardRecords, function(cardRecord) {
      cardboard.addCard(cardRecord);
    });

    cardboard.removeRow(_.last(cardboard.getRows()));
    cardboard.show();
  }
});