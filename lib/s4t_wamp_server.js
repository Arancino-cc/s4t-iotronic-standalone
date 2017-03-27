/*
 Apache License
 Version 2.0, January 2004
 http://www.apache.org/licenses/

 Copyright (c) 2014 2015 Andrea Rocco Lotronto, Arthur Warnier, Nicola Peditto
 */

nconf = require('nconf');


try {

    nconf.file({file: process.cwd() + '/lib/settings.json'});
    var intr = nconf.get('config:server:interface');
    var topic_command = nconf.get('config:wamp:topic_command');
    var topic_connection = nconf.get('config:wamp:topic_connection');

    // LOGGING CONFIGURATION --------------------------------------------------------------------
    log4js = require('log4js');
    log4js.loadAppender('file');

    logfile = nconf.get('config:server:log:logfile');		//log4js.addAppender(log4js.appenders.file('/var/log/s4t-iotronic.log'));  
    loglevel = nconf.get('config:server:log:loglevel');
    log4js.addAppender(log4js.appenders.file(logfile));

    //service logging configuration: "main"                                                  
    var logger = log4js.getLogger('main');


    /*
     OFF	nothing is logged
     FATAL	fatal errors are logged
     ERROR	errors are logged
     WARN	warnings are logged
     INFO	infos are logged
     DEBUG	debug infos are logged
     TRACE	traces are logged
     ALL	everything is logged
     */

    if (loglevel === undefined) {
        logger.setLevel('INFO');
        logger.warn('[SYSTEM] - LOG LEVEL not defined... default has been set: INFO');

    } else if (loglevel === "") {
        logger.setLevel('INFO');
        logger.warn('[SYSTEM] - LOG LEVEL not specified... default has been set: INFO');

    } else {

        logger.setLevel(loglevel);
        logger.info('[SYSTEM] - LOG LEVEL: ' + loglevel);

    }
    //------------------------------------------------------------------------------------------


}
catch (err) {
    // DEFAULT LOGGING
    logfile = './emergency-lightning-rod.log';
    log4js.addAppender(log4js.appenders.file(logfile));
    logger = log4js.getLogger('main');
    logger.error('[SYSTEM] - ' + err);
    process.exit();
}


logger.info('\n\n\n\n##################################\n Stack4Things Iotronic-Standalone\n##################################');


net_backend = 'iotronic'; //neutron

//IMPORT MODULES
var autobahn = require('autobahn');
var express = require('express');
var bodyParser = require('body-parser');
var ip = require('ip');
var uuid = require('uuid');
var Q = require("q");

//IMPORT Iotronic LIBRARIES
var ckan_utils = require('./ckan_db_utils');
var db_utils = require('./mysql_db_utils');
var plugin_utility = require('./plugin_utils');
var driver_utility = require('./driver_utils');
var vfs_utility = require('./vfs_utils');
var gpio_utility = require('./gpio_utils');
var board_utility = require('./board_utils');
var utility = require('./utility');

if (net_backend == 'iotronic')
    var net_utility = require('./net_utils');
else
    var net_utility = require('./net_neutron_utils');


//GLOBAL VARIABLES
iotronic_status = "OK";
var db = new db_utils;
IPLocal = utility.getIP(intr, 'IPv4');


s4t_wamp_server = function () {};


s4t_wamp_server.prototype.start = function (restPort, wamp_router_url, wamp_realm) {

    // Set up WAMP connection
    var connection = new autobahn.Connection({
        url: wamp_router_url,
        realm: wamp_realm
    });

    // Init Iotronic network devices
    if (net_backend == 'iotronic') {
        
        net_utility.initVNET();

    }
    
    // Connect to WAMP router
    connection.open();


    // Actions to perform on connection
    connection.onopen = function (session, details) {

        
        if (IPLocal != undefined) {

            // Start REST server
            var rest = express();

            rest.use(bodyParser.json()); // support json encoded bodies
            rest.use(bodyParser.urlencoded({extended: true})); // support encoded bodies

            rest.all('/*', function(req, res, next) {
                res.type('application/json');
                res.header("Access-Control-Allow-Origin", "*");
                res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, PATCH, PUT');
                next();
            });

            rest.get('/', function (req, res) {
                res.send('API: <br> http://' + IPLocal + ':' + restPort + '/   Welcome in Iotronic-standalone!');
            });


            // Loading Iotronic-standalone modules
            var utils = new utility(session, rest);
            var board_utils = new board_utility(session, rest);
            var plugin_utils = new plugin_utility(session, rest);
            var driver_utils = new driver_utility(session, rest);
            var net_utils = new net_utility(session, rest);
            var vfs_utils = new vfs_utility(session, rest);
            var gpio_utils = new gpio_utility(session, rest);
            


            process.on('uncaughtException', function (err) {

                if (err.errno === 'EADDRINUSE') {

                    iotronic_status = "[SYSTEM] - FAULT - Express - EADDRINUSE";

                }

            });

            if (iotronic_status === "OK") {
                rest.listen(restPort);
                logger.info("[SYSTEM] - Server REST started on: http://" + IPLocal + ":" + restPort + " status " + iotronic_status);
                logger.info("[SYSTEM] - Connected to router WAMP!");
            }
            else {
                logger.error("[SYSTEM] - ERROR: " + iotronic_status);
                logger.info('Bye!');
                process.exit();
            }


            // TO MANAGE BOARD CONNECTION EVENT-------------------------------------------------------------------------------------------------------------
            var onBoardConnected = function (args) {

                var board_id = args[0];
                var wamp_conn_status = args[1];
                var wamp_session = args[2];

                if (wamp_conn_status == 'connection') {

                    db.checkBoard(board_id, function (data) {

                        if (data.result == "ERROR") {

                            logger.error("[SYSTEM] --> " + data.message);
                            res.send(JSON.stringify(data));

                        } else {

                            if (data.message.length == 0) {

                                // Board not registered in Iotronic

                                logger.warn("[SYSTEM] - A not authorized board has tried connecting to Iotronic!");

                                var response = {
                                    message: 'Board with UUID '+board_id+' not authorized!',
                                    result: 'REJECTED'
                                };

                                session.call(board_id + '.command.checkRegistrationStatus', [response]);

                            }
                            else {

                                // Board registered in Iotronic

                                db.changeBoardState(board_id, wamp_session, 'C', function (data) {

                                    if (data.result == "ERROR") {

                                        logger.error("[SYSTEM] --> " + data.message);
                                        res.send(JSON.stringify(data));

                                    } else {

                                        db.checkBoardConnected(board_id, function (data) {

                                            if (data.result == "ERROR") {

                                                logger.error("[SYSTEM] --> " + data.message);
                                                res.send(JSON.stringify(data));

                                            } else {

                                                var db_board_id = data.message[0].board_code;
                                                logger.info("[SYSTEM] - Board " + data.message[0].label + " (" + db_board_id + ") CONNECTED!");
                                                logger.debug("[WAMP] - Now the status of the board is:");
                                                logger.debug("[WAMP] --> board ID::" + db_board_id);
                                                logger.debug("[WAMP] --> session::" + data.message[0].session_id + " - status::" + data.message[0].status);

                                                //Input parameters: board_id - res = false - restore = false
                                                net_utils.activateBoardNetwork(db_board_id, "false", "false");

                                            }



                                        });

                                    }



                                });

                            }
                            
                        }

                        


                    });

                }
                else
                    logger.debug("[WAMP] - Board ("+board_id+") connection status:\n"+args)

            };
            //Subscribing to topic_connection
            session.subscribe(topic_connection, onBoardConnected);
            logger.info("[WAMP] - Subscribed to topic: " + topic_connection);
            // ---------------------------------------------------------------------------------------------------------------------------------------------


            // VLAN CONFIGURATION INJECTION AFTER RECONNECTION ON JOIN BOARD--------------------------------------------------------------------------------
            var result_network_board = function (result) {

                var board_id = result[1];

                var response = {
                    message: '',
                    result: ''
                };

                var d = Q.defer();

                logger.info('[NETWORK] - Board ' + board_id + ' VNET result: ' + result[0]);

                if (net_backend == 'iotronic') {

                    db.getBoardVLAN(board_id, function (data) {


                        if (data.result == "ERROR") {

                            logger.error("[NETWORK] --> " + data.message);
                            res.send(JSON.stringify(data));

                        } else {

                            if (data.message.length != 0) {

                                response.message = "Board " + board_id + " is connected to these VLANs: \n" + JSON.stringify(data.message, null, "\t");
                                response.result = "SUCCESS";
                                logger.info("[NETWORK] - "+response.message);

                                for (var i = 0; i < data.message.length; i++) {

                                    (function (i) {

                                        net_utils.addToNetwork(data.message[i].net_uuid, board_id, data.message[i].ip_vlan, "false", "true");

                                        if ( i === (data.message.length - 1) ) {
                                            d.resolve(response);
                                        }

                                    })(i);

                                }

                            } else {
                                response.message = "No VLAN for the board " + board_id;
                                response.result = "SUCCESS";
                                logger.info("[NETWORK] - "+response.message);
                                d.resolve(response);
                            }

                        }




                    });

                }
                /*
                 else if (net_backend == 'neutron') {


                 db.getAllPorts(board_id, function (err, result_db) {

                 if (err) {

                 response.message = "Neutron getting ports FAILED: " + err;
                 response.result = "ERROR";
                 logger.error("[IOTRONIC DB] - "+response.message);
                 d.resolve(response);

                 } else if (result_db.length == 0) {
                 response.message = "No VLAN for the board " + board_id;
                 response.result = "SUCCESS";
                 logger.info("[NETWORK] - "+response.message);
                 d.resolve(response);
                 }
                 else {
                 for (var i = 0; i < result_db.length; i++) {

                 (function (i) {
                 logger.debug("[NETWORK] - " + JSON.stringify(result_db[i], null, "\t"));
                 net_utils.addToNetwork_restore(result_db[i].net_uuid, board_id, result_db[i].uuid, "false", "true");

                 if ( i === (result_db.length - 1) ) {
                 response.message = "Board " + board_id + " added to the VNETs!";
                 response.result = "SUCCESS";
                 d.resolve(response);
                 }

                 })(i);

                 }
                 }
                 });

                 }
                 */

                return d.promise;
            };
            logger.info('[WAMP] - Registering RPC: iotronic.rpc.command.result_network_board');
            session.register('iotronic.rpc.command.result_network_board', result_network_board);
            // ---------------------------------------------------------------------------------------------------------------------------------------------


            // PROVISIONING OF A NEW BOARD------------------------------------------------------------------------------------------------------------------
            var Provisioning = function (result) {

                var board_id = result[0];
                var d = Q.defer();

                db.getBoardPosition(board_id, function (board_position) {

                    logger.info('[SYSTEM] - BOARD POSITION: ' + JSON.stringify(board_position) + ' PROVISIONING BOARD RESPONSE: ' + result[0]);
                    d.resolve(board_position);

                });

                return d.promise;
            };
            session.register('s4t.board.provisioning', Provisioning);
            logger.info('[WAMP] - Registering RPC: s4t.board.provisioning');
            // ---------------------------------------------------------------------------------------------------------------------------------------------







            logger.info("[WAMP] - Status boards connection to WAMP syncronizing...");
            logger.info("[WAMP] --> Retriving boards connected to WAMP (topic 'board.command')...");

            // Get topic-command ID
            session.call("wamp.subscription.match", [topic_command]).then(
                function (subCommandId) {

                    if (subCommandId != null){

                        subID = subCommandId[0];

                        logger.debug("[WAMP] - Topic 'board.command' ID: " + subID);

                        // Get subscribers (boards) list
                        session.call("wamp.subscription.list_subscribers",[subID]).then(

                            function (subBoards) {

                                // Boards connected WAMP side
                                logger.debug("[WAMP] - Active sessions on WAMP: " + subBoards);

                                db.getBoardsList(function (data) {

                                    if (data.result == "ERROR") {

                                        logger.error("[SYSTEM] --> Error getting boards list: " + data.message);

                                    } else {

                                        //logger.debug(JSON.stringify(data.message, null, "\t"));

                                        var db_board_list = data.message;
                                        var conn_boards = [];
                                        var wrong_disconn_boards = [];
                                        var wrong_conn_boards = [];

                                        for (var i = 0; i < db_board_list.length; i++) {

                                            (function (i) {

                                                if (db_board_list[i]['session_id'] != "null"){

                                                    // Boards connected DB side
                                                    //logger.debug(db_board_list[i]['label'] + " - " + db_board_list[i]['session_id']);

                                                    conn_boards.push(db_board_list[i]['board_code']);

                                                    if(subBoards.indexOf(parseInt(db_board_list[i]['session_id'])) > -1){

                                                        wrong_conn_boards.push(db_board_list[i]['board_code']);
                                                        //logger.debug(db_board_list[i]['label'] + " is connected!")

                                                    }else{

                                                        wrong_disconn_boards.push(db_board_list[i]['board_code']);
                                                        //logger.debug(db_board_list[i]['label'] + " is disconnected!");

                                                    }

                                                }


                                                if (i === (db_board_list.length - 1)) {

                                                    /*
                                                    if (conn_boards.length != 0)
                                                        logger.debug("[WAMP] - conn_boards:\n" + conn_boards.sort());
                                                    else
                                                        logger.debug("[WAMP] - No boards connected from DB side.");
                                                    */
                                                    if (wrong_disconn_boards.length != 0)
                                                        logger.debug("[WAMP] - wrong_disconn_boards: \n" + wrong_disconn_boards.sort());
                                                    else
                                                        logger.debug("[WAMP] - No boards in wrong disconnection status!");

                                                    if (wrong_conn_boards.length != 0)
                                                        logger.debug("[WAMP] - wrong_conn_boards: \n" + wrong_conn_boards.sort());
                                                    else
                                                        logger.debug("[WAMP] - No boards in wrong connection status!");

                                                    /*
                                                    if (subBoards.length != 0)
                                                        logger.debug("[WAMP] - WAMP - subBoards " + subBoards.sort());
                                                    else
                                                        logger.debug("[WAMP] - No boards connected from WAMP side.");
                                                    */



                                                    if (conn_boards.sort().toString() != subBoards.sort().toString()){

                                                        // the boards connection status is wrong: some board disconneted from WAMP when Iotronic was offline.
                                                        //logger.warn("[WAMP] - Different connections lists, restoring board...");
                                                        if(wrong_conn_boards.length !=0 ){
                                                            logger.warn("[WAMP] - These boards need to be restored: ");

                                                            for (var w = 0; w < wrong_conn_boards.length; w++) {

                                                                (function (w) {

                                                                    logger.warn("[WAMP] --> "+wrong_conn_boards[w]);
                                                                    //Input parameters: board_id - res = false - restore = false
                                                                    net_utils.activateBoardNetwork(wrong_conn_boards[w], "false", "true");

                                                                })(w);

                                                            }
                                                        }else{
                                                            logger.error("[WAMP] - There are some boards connected to WAMP when Iotronic was offline!");
                                                            //logger.error("[WAMP] - These boards connected to WAMP when Iotronic was offline: ");
                                                            logger.debug("[WAMP] --> Active sessions: " + subBoards.sort());
                                                        }





                                                    }


                                                    if(wrong_disconn_boards.length !=0 ){

                                                        for (var w = 0; w < wrong_disconn_boards.length; w++) {

                                                            (function (w) {

                                                                var wrong_board = wrong_disconn_boards[w];

                                                                db.changeBoardState(wrong_board, 'null', 'D', function (data) {

                                                                    if (data.result == "ERROR") {

                                                                        logger.error("[SYSTEM] --> " + data.message);

                                                                    } else {


                                                                        db.removeAllServices(wrong_board, function (response) {

                                                                            if(response.result == "ERROR")
                                                                                logger.error("[SERVICE] - Error removing all active services: " +response.message);
                                                                            else
                                                                                logger.debug("[SERVICE] - Removed all active services!")

                                                                        });

                                                                        db.updateSocatStatus(wrong_board, "noactive", function (response) {

                                                                            if(response.result == "ERROR")
                                                                                logger.error("[NETWORK] - Error updating Socat status: " +response.message);
                                                                            else
                                                                                logger.debug("[NETWORK] - Socat status of board " + wrong_board + " set to 'noactive' ");

                                                                        });

                                                                    }

                                                                });


                                                            })(w);

                                                        }



                                                    }


                                                }

                                            })(i);
                                        }

                                    }

                                });


                            }

                        );

                    }else{

                        logger.debug("[WAMP] --> No boards connected to topic 'board.command'.");

                        db.getBoardsList(function (data) {

                            if (data.result == "ERROR") {

                                logger.error("[SYSTEM] --> Error getting boards list: " + data.message);

                            } else {

                                var db_board_list = data.message;

                                for (var i = 0; i < db_board_list.length; i++) {

                                    (function (i) {

                                        if (db_board_list[i]['session_id'] != "null") {

                                            logger.debug(db_board_list[i]['label'] + " - " + db_board_list[i]['session_id']);

                                            db.changeBoardState(db_board_list[i]['board_code'], 'null', 'D', function (data) {

                                                if (data.result == "ERROR") {

                                                    logger.error("[SYSTEM] --> " + data.message);

                                                } else {

                                                    db.removeAllServices(wrong_board, function (response) {

                                                        if(response.result == "ERROR")
                                                            logger.error("[SERVICE] - Error removing all active services: " +response.message);
                                                        else
                                                            logger.debug("[SERVICE] - Removed all active services!")

                                                    });

                                                    db.updateSocatStatus(wrong_board, "noactive", function (response) {

                                                        if(response.result == "ERROR")
                                                            logger.error("[NETWORK] - Error updating Socat status: " +response.message);
                                                        else
                                                            logger.debug("[NETWORK] - Socat status of board " + wrong_board + " set to 'noactive' ");

                                                    });

                                                }

                                            });

                                        }

                                        if (i === (db_board_list.length - 1)) {

                                            logger.debug("[WAMP] --> Status boards connection to WAMP syncronized.")

                                        }


                                    })(i);

                                }

                            }

                        });

                    }




                }
            );











            var onLeave_function = function (session_id) {

                logger.debug("[WAMP] - SESSION closed with ID: " + session_id);

                db.findBySessionId(session_id, function (data_find) {
                    
                    if (data_find.result == "ERROR") {

                        logger.error("[SYSTEM] --> " + data_find.message);
                        res.send(JSON.stringify(data_find));

                    } else {


                        if (data_find.message.length == 1) {

                            var board = data_find.message[0].board_code;
                            var label = data_find.message[0].label;


                            db.changeBoardState(board, 'null', 'D', function (data) {

                                if (data.result == "ERROR") {

                                    logger.error("[SYSTEM] --> " + data.message);
                                    res.send(JSON.stringify(data));

                                } else {

                                    logger.info("[SYSTEM] - Board " + label + " (" + board + ") DISCONNECTED!");

                                    db.removeAllServices(board, function (response) {

                                        if(response.result == "ERROR")
                                            logger.error("[SERVICE] - Error removing all active services: " +response.message);
                                        else
                                            logger.debug("[SERVICE] - Removed all active services!")

                                    });

                                    db.updateSocatStatus(board, "noactive", function (response) {

                                        if(response.result == "ERROR")
                                            logger.error("[NETWORK] - Error updating Socat status: " +response.message);
                                        else
                                            logger.debug("[NETWORK] - Socat status of board " + board + " set to 'noactive' ");

                                    });

                                }

                            });
                            
                        }
                        
                    }

                    
                });
            };

            var onJoin_function = function (args) {
                logger.info("[WAMP] - WAMP ONJOIN:\n" + JSON.stringify(args, null, 4));
            };

            session.subscribe('wamp.session.on_join', onJoin_function);

            session.subscribe('wamp.session.on_leave', onLeave_function);


        } else {

            logger.error("[SYSTEM] - SERVER IP UNDEFINED: please specify a valid network interface in settings.json");
            logger.info('Bye!');
            process.exit();

        }


    };


    // Actions to perform on disconnection
    connection.onclose = function (reason, details) {
        logger.info("[WAMP] - Connection close for::" + reason);
        logger.debug("[WAMP] - Connection close for::");
        logger.debug("[WAMP]\n - " + details);
    }


};


module.exports = s4t_wamp_server;
