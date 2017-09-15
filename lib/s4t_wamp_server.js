/*
 Apache License
 Version 2.0, January 2004
 http://www.apache.org/licenses/

 Copyright (c) 2014 2015 Andrea Rocco Lotronto, Arthur Warnier, Nicola Peditto
 */

nconf = require('nconf');

var IotronicHome = process.env.IOTRONIC_HOME;

boards_disconnected = {};


try {

    nconf.file({file: IotronicHome + '/settings.json'});
    intr = nconf.get('config:server:interface');
    topic_connection = nconf.get('config:wamp:topic_connection');

    admin_email = nconf.get('config:server:notifier:email:address');
    admin_email_pw = nconf.get('config:server:notifier:email:password');
    enable_notify = nconf.get('config:server:notifier:enable_notify');

    smtpConfig = {
        host: 'out.unime.it',
        port: 465,
        secure: true,
        auth: {
            user: admin_email,
            pass: admin_email_pw
        }
    };

    https_enable = nconf.get('config:server:https:enable');
    https_port = nconf.get('config:server:https:port');
    https_key = nconf.get('config:server:https:key');
    https_cert = nconf.get('config:server:https:cert');

    encryptKey = nconf.get('config:server:auth:encryptKey');
    auth_backend = nconf.get('config:server:auth:backend');
    
    

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
    logfile = IotronicHome + '/emergency-lightning-rod.log';
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
var jwt = require('jsonwebtoken');

var ip = require('ip');
//var uuid = require('node-uuid');
var Q = require("q");
var fs = require('fs');

//IMPORT Iotronic LIBRARIES
var db_utils = require('./mysql_db_utils');
var plugin_utility = require('./plugin_utils');
var driver_utility = require('./driver_utils');
var vfs_utility = require('./vfs_utils');
var gpio_utility = require('./gpio_utils');
var board_utility = require('./board_utils');
var utility = require('./utility');
var service_utility = require('./service_utils');
var layout_utility = require('./layout_utils');
var project_utility = require('./project_utils');
var user_utility = require('./user_utils');
var auth_utility = require('./auth_utils');


if (net_backend == 'iotronic')
    var net_utility = require('./net_utils');
else
    var net_utility = require('./net_neutron_utils');


//GLOBAL VARIABLES
iotronic_status = "OK";
var db = new db_utils;
IPLocal = utility.getIP(intr, 'IPv4');
server_rest = null;

s4t_wamp_server = function () {};


s4t_wamp_server.prototype.start = function (restPort, wamp_router_url, wamp_realm) {


    logger.info("IoTronic Home: " + process.env.IOTRONIC_HOME);

    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

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

        logger.info("[SYSTEM] - Connected to WAMP router!");

        // CHECK WSTT PROCESS STATUS
        utility.checkProcessName('node', 'wstt.js',
            function (response) {
                if(response.message.command == "wstt"){
                    if(response.result == "SUCCESS") {

                        logger.debug("[SYSTEM] - WSTT status: " + response.message.log);
                        
                        
                    }
                    else {
                        logger.error("[SYSTEM] - WSTT status: " + response.message.log);
                    }
                }

            }

        );

        logger.info("[SYSTEM] - Noification system status: " + enable_notify);


        if (IPLocal != undefined) {

            var rest = express();

            // Configuring REST server
            rest.use(bodyParser.json()); // support json encoded bodies
            rest.use(bodyParser.urlencoded({extended: true})); // support encoded bodies
            rest.all('/*', function(req, res, next) {
                res.type('application/json');
                res.header("Access-Control-Allow-Origin", "*");
                res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, PATCH, PUT');
                next();
            });
            
            // Load authentication module ------------------------------------------------------------------------------

            if(auth_backend == "iotronic"){

                var auth = new auth_utility(session, rest);
                rest.use(function(req, res, next) {

                    var message;
                    // check header or url parameters or post parameters for token
                    var token = req.body.token || req.query.token || req.headers['x-auth-token'];

                    if(token){
                        //Decode the token
                        jwt.verify(token, encryptKey,function(err,decod){

                            if(err){
                                message = "Wrong Token: " + err;
                                logger.error("[AUTH] - " + message);
                                res.status(403).json({
                                    message:message,
                                    result:"ERROR"
                                });
                            }
                            else{
                                //If decoded then call next() so that respective route is called.
                                req.decoded=decod;
                                next();
                            }

                        });
                    }
                    else{
                        res.status(403).json({
                            message:"No Token",
                            result:"ERROR"
                        });
                    }

                });

            }else if (auth_backend == "keystone"){

                message = "Not implemented yet! Use 'iotronic' authentication.";
                logger.warn("[AUTH] - " + message);
                logger.info('Bye!');
                process.exit();

            }else {
                message = "Authentication backend not supported or not specified!";
                logger.error("[AUTH] - " + message);
                logger.info('Bye!');
                process.exit();
            }


            //----------------------------------------------------------------------------------------------------------


            rest.get('/', function (req, res) {
                
                res.send('API: <br> http://' + IPLocal + ':' + restPort + '/   Welcome in Iotronic-standalone!');

            });

            // Loading IoTronic modules
            var board_utils = new board_utility(session, rest);
            var plugin_utils = new plugin_utility(session, rest);
            var driver_utils = new driver_utility(session, rest);
            var net_utils = new net_utility(session, rest);
            var vfs_utils = new vfs_utility(session, rest);
            var gpio_utils = new gpio_utility(session, rest);
            var services_utils = new service_utility(session, rest);
            var layouts_utils = new layout_utility(session, rest);
            var projects_utils = new project_utility(session, rest);
            var users_utils = new user_utility(session, rest);


            // IoTronic catching exceptions
            process.on('uncaughtException', function (err) {

                if (err.errno === 'EADDRINUSE') {

                    iotronic_status = "FAULT - Express - EADDRINUSE";

                }

            });

            // REST server starting if there are not error errors caught
            if (iotronic_status === "OK") {

                // START REST SERVER
                if (https_enable == "true"){
                    //HTTPS
                    var https = require('https');

                    var s4t_key = fs.readFileSync(https_key, 'utf8');
                    var s4t_cert = fs.readFileSync(https_cert, 'utf8');

                    var credentials = {
                        key: s4t_key,
                        cert: s4t_cert
                    };

                    //logger.debug("CREDENTIALS: " + JSON.stringify(credentials));
                    https.createServer(credentials, rest).listen(https_port, function(){
                        logger.info("[SYSTEM] - Server REST started on: https://" + IPLocal + ":" + https_port + " - IoTronic CERT: \n" + s4t_cert);
                    });

                }else{
                    //HTTP
                    var http = require('http');
                    http.createServer(rest).listen(restPort, function(){
                        logger.info("[SYSTEM] - Server REST started on: http://" + IPLocal + ":" + restPort);
                    });

                }

                //HTTP-TEMPORARY
                var http = require('http');
                http.createServer(rest).listen(restPort, function(){
                    logger.info("[SYSTEM] - Server REST started on: http://" + IPLocal + ":" + restPort);
                });

                /*
                 rest.listen(restPort);
                 logger.info("[SYSTEM] - Server REST started on: http(s)://" + IPLocal + ":" + restPort + " status " + iotronic_status);
                 */


                
            }
            else {
                // Exit from IoTronic if there are errors caught
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

                    //CHECK IF THE BOARD IS AUTHORIZED: IF IT EXISTS IN boards TABLE OR BY MEANS OF KEYSTONE SERVICE

                    db.checkBoard(board_id, function (data) {

                        if (data.result == "ERROR") {

                            logger.error("[SYSTEM] --> " + data.message);
                            //res.send(JSON.stringify(data));

                        } else {

                            if (data.message.length == 0) {

                                // Board not registered in Iotronic

                                logger.warn("[SYSTEM] - A not authorized board has tried connecting to Iotronic!");

                                var response = {
                                    message: "Board with UUID '"+board_id+"' not authorized!",
                                    result: 'REJECTED'
                                };

                                session.call('s4t.' + board_id + '.board.checkRegistrationStatus', [response]);

                            }
                            else {

                                // Board registered in Iotronic
                                logger.info("[SYSTEM] - Access granted for board " + board_id);

                                var response = {
                                    message: 'Board with UUID '+board_id+' is authorized!',
                                    result: 'SUCCESS'
                                };

                                session.call('s4t.' + board_id + '.board.checkRegistrationStatus', [response]);
                                
                                
                                db.changeBoardState(board_id, wamp_session, 'C', function (data) {

                                    if (data.result == "ERROR") {

                                        logger.error("[SYSTEM] --> " + data.message);
                                        res.send(JSON.stringify(data));

                                    } else {

                                        db.getBoard(board_id, function (data) {

                                            if (data.result == "ERROR") {

                                                logger.error("[SYSTEM] --> " + data.message);
                                                //res.send(JSON.stringify(data));

                                            } else {

                                                var label = data.message[0].label;

                                                logger.info("[SYSTEM] - Board " + label + " (" + board_id + ") CONNECTED!");

                                                //Input parameters: board_id - res = false - restore = false
                                                net_utils.activateBoardNetwork(board_id, "false", "false");

                                                //ENABLE DISCONNECTION ALARM
                                                if ( boards_disconnected[board_id] != undefined){
                                                     // There is a disconnection alarm related to this board because it did reconnect in time
                                                     clearInterval( boards_disconnected[board_id] );
                                                     delete boards_disconnected[board_id];
                                                     logger.debug("[SYSTEM] - Alarm DEACTIVATED for board " + label + " (" + board_id + ")");
                                                }


                                            }



                                        });

                                    }



                                });

                            }
                            
                        }

                    });


                }
                else
                    logger.debug("[WAMP] - Board connection status: "+args)

            };
            
            
            //Subscribing to topic_connection
            session.subscribe(topic_connection, onBoardConnected);
            logger.info("[WAMP] - Subscribed to topic: " + topic_connection);
            session.publish(topic_connection, ['Iotronic-connected', session._id]);
            // ---------------------------------------------------------------------------------------------------------------------------------------------


            
            
            
            // CHECK IF IOTRONIC IS ALIVE-------------------------------------------------------------------------------------------------------------------
            var isAlive = function (result) {

                var board_id = result[0];

                var response = {
                    message: 'Response for '+board_id +': IoTronic is alive!',
                    result: 'SUCCESS'
                };
                
                return response;

            };
            logger.info('[SYSTEM] - Registering RPC: s4t.iotronic.isAlive');
            session.register('s4t.iotronic.isAlive', isAlive);
            // ---------------------------------------------------------------------------------------------------------------------------------------------


            // BOARD SERVICES RESTORE ON CONNECTION---------------------------------------------------------------------------------------------------------
            var restore_board_services = function (result) {

                var board_id = result[0];

                var response = {
                    message: '',
                    result: ''
                };

                var d = Q.defer();

                // Get service tunnels for the connected board
                db.getBoardServices(board_id, function (data) {

                    if (data.result == "ERROR") {

                        logger.error("[SERVICE] --> " + data.message);

                    } else {

                        if(data.message.length == 0){

                            response.message = "No services to restore for the board " + board_id;
                            response.result = "SUCCESS";
                            logger.info("[SERVICE] --> "+response.message);
                            d.resolve(response);
                        }


                        else{

                            logger.info("[SERVICE] - RELOAD BOARD SERVICE TUNNELS:\n"+ JSON.stringify(data.message, null, "\t"));

                            for(var key=0; key < data.message.length; key++) {

                                (function(key) {

                                    services_utils.manageService(board_id, null, data.message[key].service_id, "restore", false);
                                    
                                    if (key == data.message.length - 1) {
                                    
                                     response.message = "Restoring process for the board "+board_id+" started...";
                                     response.result = "SUCCESS";
                                     logger.info("[SERVICE] - "+response.message);
                                    
                                     d.resolve(response);
                                    
                                    }

                                })(key);

                            }
                        }



                    }


                });

                return d.promise;

            };
            logger.info('[SERVICE] - Registering RPC: s4t.iotronic.service.restore');
            session.register('s4t.iotronic.service.restore', restore_board_services);
            // ---------------------------------------------------------------------------------------------------------------------------------------------


            // VNET CONFIGURATION INJECTION AFTER BOARD RECONNECTION----------------------------------------------------------------------------------------
            var result_network_board = function (result) {

                var board_id = result[1];

                var response = {
                    message: '',
                    result: ''
                };

                var d = Q.defer();

                logger.info('[VNET] - Board ' + board_id + ' VNET result: ' + result[0]);

                if (net_backend == 'iotronic') {

                    db.getBoardVLAN(board_id, function (data) {


                        if (data.result == "ERROR") {

                            logger.error("[VNET] --> " + data.message);
                            res.send(JSON.stringify(data));

                        } else {

                            if (data.message.length != 0) {

                                response.message = "Board " + board_id + " is connected to these VLANs: \n" + JSON.stringify(data.message, null, "\t");
                                response.result = "SUCCESS";
                                logger.info("[VNET] - "+response.message);

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
                                logger.info("[VNET] - "+response.message);
                                d.resolve(response);
                            }

                        }




                    });

                }
              
                return d.promise;
            };
            logger.info('[WAMP] - Registering RPC: iotronic.rpc.command.result_network_board');
            session.register('s4t.iotronic.vnet.result_network_board', result_network_board);
            // ---------------------------------------------------------------------------------------------------------------------------------------------


            // PROVISIONING OF A NEW BOARD------------------------------------------------------------------------------------------------------------------
            var Provisioning = function (result) {

                var board_id = result[0];
                var d = Q.defer();

                db.getBoardPosition(board_id, 1, function (board_position) {

                    logger.info('[SYSTEM] - BOARD POSITION: ' + JSON.stringify(board_position) + ' PROVISIONING BOARD RESPONSE: ' + board_id);
                    d.resolve(board_position);

                });

                return d.promise;
            };
            session.register('s4t.board.provisioning', Provisioning);
            logger.info('[WAMP] - Registering RPC: s4t.board.provisioning');
            // ---------------------------------------------------------------------------------------------------------------------------------------------


            // SYNCHRONIZE BOARD LIST-----------------------------------------------------------------------------------------------------------------------
            logger.info("[WAMP] - Status boards WAMP connection syncronizing...");
            logger.info("[WAMP]   --> Iotronic session ID: " + session.id);
            logger.info("[WAMP]   --> Retriving boards connected to 'board.connection' topic...");


            /*
            // Get sessions list connected to "s4t" realm.
            session.call("wamp.session.list").then(
                function (list) {
                    //delete list[list.indexOf(parseInt(session.id))];
                    logger.info("[WAMP]   --> Active connections in the realm: " + list);

                }
            );
            */
            
            //Get sessions list connected to "board.connection" topic.
            session.call("wamp.subscription.match", [topic_connection]).then(

                function (subCommandId) {

                    if (subCommandId != null){

                        subID = subCommandId[0];

                        //logger.debug("[WAMP] - Topic 'board.connection' ID: " + subID);

                        // Get subscribers (boards) list
                        session.call("wamp.subscription.list_subscribers",[subID]).then(

                            function (subBoards) {

                                // Boards connected WAMP side
                                logger.info("[WAMP]   --> Active sessions in the topic: " + subBoards);
                                delete subBoards[subBoards.indexOf(parseInt(session.id))];

                                if (subBoards.length == 0)
                                    logger.info("[WAMP]   --> No boards connected to the topic.");
                                else
                                    logger.info("[WAMP]   --> Board connected sessions to the topic: " + subBoards);



                                db.getBoardsList(function (data) {

                                    if (data.result == "ERROR") {

                                        logger.error("[SYSTEM]   --> Error getting boards list: " + data.message);

                                    } else {

                                        //logger.debug(JSON.stringify(data.message, null, "\t"));

                                        var db_board_list = data.message;
                                        var wrong_disconn_boards = []; // list of boards that disconnected from Iotronic when it was offline
                                        var wrong_conn_boards = [];    // list of boards that kept connected when Iotronic was offline and needs to be restored

                                        for (var i = 0; i < db_board_list.length; i++) {

                                            (function (i) {

                                                if (db_board_list[i]['session_id'] != "null"){

                                                    // Boards connected DB side
                                                    //logger.debug(db_board_list[i]['label'] + " - " + db_board_list[i]['session_id']);

                                                    if(subBoards.indexOf(parseInt(db_board_list[i]['session_id'])) > -1){

                                                        wrong_conn_boards.push(db_board_list[i]['board_code']);
                                                        //logger.debug(db_board_list[i]['label'] + " is connected!")

                                                    }else{

                                                        wrong_disconn_boards.push(db_board_list[i]['board_code']);
                                                        //logger.debug(db_board_list[i]['label'] + " is disconnected!");

                                                    }

                                                }


                                                if (i === (db_board_list.length - 1)) {

                                                    if(wrong_conn_boards.length !=0){

                                                        // Restore Iotronic services compromised by Iotronic disconnection

                                                        //logger.debug("[WAMP] - Wrong connected boards: \n" + wrong_conn_boards.sort());

                                                        logger.warn("[WAMP] - These boards need to be restored: ");

                                                        for (var w = 0; w < wrong_conn_boards.length; w++) {

                                                            (function (w) {

                                                                logger.warn("[WAMP] --> "+wrong_conn_boards[w]);

                                                                //Input parameters: board_id - res = false - restore = false
                                                                net_utils.activateBoardNetwork(wrong_conn_boards[w], "false", "true");

                                                            })(w);

                                                        }

                                                    }else
                                                        logger.info("[WAMP] - No boards in wrong connection status!");



                                                    if(wrong_disconn_boards.length != 0){

                                                        // Update DB boards status: put disconnected boards off-line.

                                                        //logger.debug("[WAMP] - Wrong disconnected boards: \n" + wrong_disconn_boards.sort());

                                                        logger.info("[WAMP] - These boards disconnected when Iotronic was off-line: ");

                                                        for (var w = 0; w < wrong_disconn_boards.length; w++) {

                                                            (function (w) {

                                                                var wrong_board = wrong_disconn_boards[w];

                                                                db.changeBoardState(wrong_board, 'null', 'D', function (data) {

                                                                    if (data.result == "ERROR") {

                                                                        logger.error("[SYSTEM] --> " + data.message);

                                                                    } else {

                                                                        //logger.debug(" --> DB status updated!");

                                                                        db.updateSocatStatus(wrong_board, "noactive", function (response) {

                                                                            if(response.result == "ERROR")
                                                                                logger.error("[WAMP] --> Error updating Socat status (board "+wrong_board+"): " +response.message);
                                                                            //else logger.debug(" --> Socat status set to 'noactive'!");

                                                                        });


                                                                        logger.info("[SYSTEM] --> " + wrong_board + ": DB status updated!");
                                                                        
                                                                    }

                                                                });


                                                            })(w);

                                                        }



                                                    }else
                                                        logger.info("[WAMP] - No boards in wrong disconnection status!");


                                                }

                                            })(i);
                                        }

                                    }

                                });


                            }

                        );

                    }else{

                        logger.debug("[WAMP] --> No boards connected to 'board.connection' topic.");

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

                                                    db.updateSocatStatus(wrong_board, "noactive", function (response) {

                                                        if(response.result == "ERROR")
                                                            logger.error("[VNET] - Error updating Socat status: " +response.message);
                                                        else
                                                            logger.debug("[VNET] - Socat status of board " + wrong_board + " set to 'noactive' ");

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
            // ---------------------------------------------------------------------------------------------------------------------------------------------


            var onLeave_function = function (session_id) {

                //var board_alert = null;
                var alert_count = 0;


                logger.info("[WAMP] - Board session closed: ");

                db.findBySessionId(session_id, function (data_find) {
                    
                    if (data_find.result == "ERROR") {

                        logger.error("[SYSTEM] --> " + data_find.message);
                        res.send(JSON.stringify(data_find));

                    } else {

                        if (data_find.message.length == 0) {
                            logger.warn("[WAMP] --> A board in wrong status disconnected!");
                        }
                        else{

                            var board = data_find.message[0].board_code;
                            var label = data_find.message[0].label;

                            logger.debug("[WAMP] --> Session ID: " + session_id + " - Board: " +board);

                            db.changeBoardState(board, 'null', 'D', function (data) {

                                if (data.result == "ERROR") {

                                    logger.error("[SYSTEM] --> " + data.message);
                                    res.send(JSON.stringify(data));

                                } else {

                                    logger.info("[SYSTEM] - Board " + label + " (" + board + ") DISCONNECTED!");
                                    
                                    db.updateSocatStatus(board, "noactive", function (response) {

                                        if(response.result == "ERROR")
                                            logger.error("[VNET] - Error updating Socat status: " +response.message);
                                        else {
                                            logger.debug("[VNET] - Socat status of board " + board + " (" + label + ") updated.");

                                        }

                                    });


                                    if(enable_notify == "true"){

                                        db.getUserByBoard(board, function (response) {

                                            if(response.result == "ERROR")
                                                logger.error("[SYSTEM] - Error getting user and board information: " +response.message);

                                            else {

                                                var board_notify = response.message[0].notify;
                                                var notify_rate = response.message[0].notify_rate;
                                                var notify_retry = response.message[0].notify_retry;

                                                if(board_notify == 0){

                                                    logger.debug("[NOTIFY] - Alarm is DISABLED for the board " + label );

                                                }else{

                                                    logger.debug("[NOTIFY] - Alarm ACTIVATED for the board " + label + " - rate (sec): " + notify_rate + " - retry: " + notify_retry);

                                                    var user = response.message[0].username;
                                                    var user_email = response.message[0].email;

                                                    logger.debug("[NOTIFY] --> Owner user of board " + label + " (" + board + "): " + user + " ("+user_email+")");

                                                    boards_disconnected[board] = setInterval(function(){

                                                        alert_count++;

                                                        if (alert_count <= notify_retry){

                                                            logger.debug("[NOTIFY] --> Alarm check ["+alert_count+"]:  Board " + board + " - User: "+user + " - Email: "+user_email); //+" - Cache: " + JSON.stringify(boards_disconnected));

                                                            utility.sendEmail(smtpConfig, user_email, label, board);

                                                        }

                                                        if (alert_count == notify_retry){

                                                            clearInterval( boards_disconnected[board] );
                                                            delete boards_disconnected[board];
                                                            logger.debug("[NOTIFY] - Alarm DEACTIVATED for the board: " + board);


                                                        }




                                                    }, notify_rate * 1000);

                                                }


                                            }

                                        }); 
                                        
                                    }
                                    





                                }

                            });
                            
                        }
                        
                    }

                    
                });




            };

            var onJoin_function = function (info) {
                //logger.info("[WAMP] - Board Join:\n" + JSON.stringify(info, null, 4));
                logger.info("[WAMP] - Board Join:");
                logger.info("[WAMP] --> Session ID: " + info[0]['session']);
                logger.info("[WAMP] --> Source IP: " + info[0]['transport']['peer']);
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
        logger.info("[WAMP] - Connection close reason: " + reason);
        logger.debug("[WAMP] - Connection close details:");
        logger.debug("[WAMP]\n" + JSON.stringify(details, null, "\t"));

        //logger.info("[REST] - Server REST stopping...");
        server_rest.close(function () {
            logger.info("[REST] - Server REST stopped.");
        });

    }


};





module.exports = s4t_wamp_server;
