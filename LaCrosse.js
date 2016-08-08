"use strict";

var serialport = require("serialport");
var SerialPort = serialport.SerialPort; // localize object constructor
var sp = new SerialPort("/dev/ttyUSB0", {baudrate:57600, parser: serialport.parsers.readline('\r\n')});


var utils =    require(__dirname + '/lib/utils'); // Get common adapter utils
var adapter = utils.adapter('LaCrosse');

adapter.on('unload', function (callback) {
    try {
        adapter.log.info('cleaned everything up...');
        callback();
    } catch (e) {
        callback();
    }
});

adapter.on('objectChange', function (id, obj) {
    adapter.log.debug('objectChange ' + id + ' ' + JSON.stringify(obj));
});

adapter.on('stateChange', function (id, state) {
    adapter.log.debug('stateChange ' + id + ' ' + JSON.stringify(state));

    if (state && !state.ack) {
        adapter.log.info('ack is not set!');
    }
});

adapter.on('ready', function () {
        adapter.log.info('entered ready');
    main();
});

function main() {

    var options = {
    serialport:     adapter.config.serialport || '/dev/ttyUSB0',
    baudrate:       adapter.config.baudrate   || 57600,
    };

    var obj = adapter.config.sensors;
    for (var anz in obj){
        if(obj[anz].stype=="LaCrosse") {
            adapter.setObject('LaCrosse_' + anz, {
                type: 'channel',
                common: {
                    name: 'LaCrosse ',
                    role: 'sensor'
                },
                native: {
                    "addr": anz
                }
            });
            adapter.log.info('RFM12B setting up object = LaCrosse ' + anz);

            adapter.setObject('LaCrosse_' + anz + '.temp', {
                type: 'state',
                common: {
                    "name":     "Temperature",
                    "type":     "number",
                    "unit":     "°C",
                    "min":      -50,
                    "max":      50,
                    "read":     true,
                    "write":    false,
                    "role":     "value.temperature",
                    "desc":     "Temperature"
                },
                native: {}
            });
            adapter.setObject('LaCrosse_' + anz + '.humid', {
                type: 'state',
                common: {
                    "name":     "Humidity",
                    "type":     "number",
                    "unit":     "%",
                    "min":      0,
                    "max":      100,
                    "read":     true,
                    "write":    false,
                    "role":     "value.humidity",
                    "desc":     "Humidity"
                },
                native: {}
            });
            adapter.setObject('LaCrosse_' + anz + '.lowBatt', {
                type: 'state',
                common: {
                    "name":     "Battery Low",
                    "type":     "boolean",
                    "role":     "value.lowBatt",
                },
                native: {}
            });
            adapter.setObject('LaCrosse_' + anz + '.newBatt', {
                type: 'state',
                common: {
                    "name":     "Battery New",
                    "type":     "boolean",
                    "role":     "value.newBatt",
                },
                native: {}
            });
        }
	
    };

    sp.open(function (error) {
        if ( error ) {
            adapter.log.info('failed to open: '+error);
        } else {
            adapter.log.info('open');
            sp.on('data', function(data) {

                adapter.log.debug('data received: ' + data);
                    // OK 9 56 1   4   156 37   ID = 56 T: 18.0 H: 37 no NewBatt
                    // OK 9 49 1   4   182 54   ID = 49 T: 20.6 H: 54 no NewBatt
                    // OK 9 55 129 4   192 56   ID = 55 T: 21.6 H: 56 WITH NewBatt
                    // OK 9 ID XXX XXX XXX XXX
                    // |  | |  |   |   |   |
                    // |  | |  |   |   |   |-- [6]Humidity incl. WeakBatteryFlag
                    // |  | |  |   |   |------ [5]Temp * 10 + 1000 LSB
                    // |  | |  |   |---------- [4]Temp * 10 + 1000 MSB
                    // |  | |  |-------------- [3]Sensor type (1 or 2) +128 if NewBatteryFlag
                    // |  | |----------------- [2]Sensor ID
                    // |  |------------------- [1]fix "9"
                    // |---------------------- [0]fix "OK"

                 var tmp = data.split(' ');
                if(tmp[0]==='OK'){                      // Wenn ein Datensatz sauber gelesen wurde
                    if(tmp[1]=='9'){                    // Für jeden Datensatz mit dem fixen Eintrag 9
                                                        // somit werden alle SendorIDs bearbeitet
                        var tmpp=tmp.splice(2,6);       // es werden die vorderen Blöcke (0,1,2) entfernt
                        adapter.log.debug('splice       : '+ tmpp);
                        var buf = new Buffer(tmpp);
                        adapter.log.debug('Sensor ID    : '+ (buf.readIntLE(0)));
                        adapter.log.debug('Type         : '+ ((buf.readIntLE(1) & 0x70) >> 4));
                        adapter.log.debug('NewBattery   : '+ ((buf.readIntLE(1) & 0x80) >> 7));       // wenn "100000xx" dann NewBatt # xx = SensorType 1 oder 2
                        adapter.log.debug('Temperatur   : '+ ((((buf.readIntLE(2))*256)+(buf.readIntLE(3))-1000)/10));
                        adapter.log.debug('Humidty      : '+ (buf.readIntLE(4) & 0x7f));
                        adapter.log.debug('LowBattery   : '+ ((buf.readIntLE(4) & 0x80) >> 7));       // Hier muss noch "incl. WeakBatteryFlag" ausgewertet werden
                        // Werte schreiben
                        adapter.setState('LaCrosse_'+ (buf.readIntLE(0)) +'.lowBatt', {val: ((buf.readIntLE(4) & 0x80) >> 7), ack: true});
                        adapter.setState('LaCrosse_'+ (buf.readIntLE(0)) +'.newBatt', {val: ((buf.readIntLE(1) & 0x80) >> 7), ack: true});
                        adapter.setState('LaCrosse_'+ (buf.readIntLE(0)) +'.temp', {val: ((((buf.readIntLE(2))*256)+(buf.readIntLE(3))-1000)/10), ack: true});
                        adapter.setState('LaCrosse_'+ (buf.readIntLE(0)) +'.humid', {val: (buf.readIntLE(4) & 0x7f), ack: true});
                    }
                }
            });
        }
    });
    adapter.subscribeStates('*');
}