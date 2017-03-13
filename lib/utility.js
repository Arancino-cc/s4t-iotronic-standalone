/*
 Apache License
 Version 2.0, January 2004
 http://www.apache.org/licenses/

 Copyright (c) 2014 2015 Andrea Rocco Lotronto, Nicola Peditto, Fabio Verboso
 */

//service logging configuration: "utility"   
var logger = log4js.getLogger('utility');
logger.setLevel(loglevel);

var db_utils = require('./mysql_db_utils');
var db = new db_utils;
var node_utility = require('./node_utils');

var nconf = require('nconf');
nconf.file({file: process.cwd() + '/lib/settings.json'});

var topic_command = nconf.get('config:wamp:topic_command');
var topic_connection = nconf.get('config:wamp:topic_connection');

var networkInterfaces = require('os').networkInterfaces();

var session_wamp;

var spawn = require('child_process').spawn;


utility = function (session, rest) {

    session_wamp = session;

    // SERVICES MANAGEMENT APIs
    //---------------------------------------------------------------------------------------------------

    //start|stop services on node
    rest.post('/v1/nodes/:node/services/action', function (req, res) {

        logger.debug("[API] - Service Operation - " + Object.keys( req.route.methods ) + " - " + req.route.path);

        var node = req.params.node;


        node_utility.checkNodeAvailable(node, res, function (available){

            if(available.result == "SUCCESS"){

                var command = req.body.command; // ssh | tty | ideino | osjs
                var op = req.body.op;  // start | stop

                var APIparamsList= {"command":command, "op":op};

                node_utility.checkDefInputs(APIparamsList, function (check){

                    if(check.result == "ERROR"){

                        res.send(JSON.stringify(check));

                    }else {


                        node_utility.checkRestInputs(req, function (check){

                            if(check.result == "ERROR"){
                                res.send(JSON.stringify(check));

                            }else {

                                utility.prototype.exportService(node, command, op, res);

                            }

                        });

                    }

                });

            }else if(available.result == "WARNING") {
                logger.error("[API] --> " + available.message);
                res.send(JSON.stringify(available));
            }

        });

    });

    //GET services list inside a node
    rest.get('/v1/nodes/:node/services', function (req, res) {

        logger.debug("[API] - Node services list - " + Object.keys( req.route.methods ) + " - " + req.route.path);

        var node = req.params.node;

        var response = {
            message: '',
            result: ''
        };
        
        logger.debug("[SERVICE] - Services list for the node " + node);
        
        db.NodeServices(node, function (data) {

            if(data.result=="ERROR"){
                response.message = data.message;
                response.result = "ERROR";
                logger.error("[SERVICE] --> " + response.message);
                res.send(JSON.stringify(response));

            }else{
                response.message = data.message;
                response.result = "SUCCESS";
                res.send(JSON.stringify(response));

            }

        });


    });

    logger.debug("[REST-EXPORT] - Utility's APIs exposed!");


};


utility.prototype.exportService = function (board, command, op, res) {

    var service_msg = {
        ip: IPLocal,
        port: {},
        service: command
    };

    var response = {
        message: '',
        result: ''
    };


    if (op == "start" || op == "stop") {

        logger.debug("[SERVICE] - Service called: " + command);

        if (op == "start") {

            db.checkService(board, command, function (data) {

                if (data.result == "ERROR") {
                    response.result = data.result;
                    response.message = data.message;
                    logger.error("[SERVICE] --> DB checkService error for node " + board + ": " + response.message);
                    res.send(JSON.stringify(response));

                } else {

                    if (data.message.length == 0) {

                        //newPort function is used because we need a TCP port not already used
                        newPort(function (port) {

                            if(port.result == "ERROR"){

                                logger.error("[SERVICE] --> DB checkService error for node " + board + ": " + port.message);
                                res.send(JSON.stringify(port));

                            }else{

                                logger.info("[SERVICE] - " + topic_command + ' ' + board + ' ' + command + ' ' + port.message + ' ' + op);

                                session_wamp.publish(topic_command, [board, command, port.message, op], {}, {acknowledge: true}).then(

                                    function (publication) {

                                        //logger.debug('[SERVICE] --> WAMP publication OK!');

                                        logger.info("[SERVICE] - Service " + command + " started on node " + board + "!");

                                        db.insertService(board, command, IPLocal, port.message, function (check_result) {

                                            if (check_result.result == "ERROR") {
                                                response.result = check_result.result;
                                                response.message = check_result.message;
                                                logger.error("[SERVICE] --> DB insertService error for node " + board + ": " + response.message);
                                                res.send(JSON.stringify(response));

                                            } else {

                                                service_msg.port = port.message;
                                                service_msg.status = op;

                                                if (command === "ssh"){

                                                    response.message = "SSH command:   ssh -p " + port.message + " root@"+IPLocal;

                                                }else
                                                    response.message = service_msg;

                                                response.result = "SUCCESS";
                                                res.send(JSON.stringify(response));

                                            }

                                        });

                                    },
                                    function (error) {

                                        logger.error("[SERVICE] --> WAMP publication error (service start) on node " + board + "!");

                                        response.result = check_result.result;
                                        response.message = "WAMP communication error: " + error;
                                        logger.error("[SERVICE] --> " + response.message);
                                        res.send(JSON.stringify(response));

                                    }

                                );

                            }


                        });

                    }
                    else {

                        response.message = command + " service is already started on the node " + board+ "!";
                        response.result = "WARNING";

                        logger.warn("[SERVICE] - " + response.message);

                        res.send(JSON.stringify(response));

                    }

                }



            });


        }


        if (op == "stop") {

            db.checkService(board, command, function (data) {

                if (data.result == "ERROR") {
                    response.result = data.result;
                    response.message = data.message;
                    logger.error("[SERVICE] --> DB checkService error for node " + board + ": " + response.message);
                    res.send(JSON.stringify(response));

                } else {

                    if (data.message.length == 0) {

                        response.message = command + " service is already stopped on the node " + board + "!";
                        response.result = "WARNING";
                        logger.warn("[SERVICE] - " + response.message);

                        res.send(JSON.stringify(response));

                    }
                    else {

                        var port = data.message[0].public_port;

                        session_wamp.publish(topic_command, [board, command, port, op], {}, {acknowledge: true}).then(

                            function (publication) {

                                //logger.debug('[SERVICE] --> WAMP publication OK!');

                                db.removeService(board, command, function (check_result) {

                                    if (check_result.result == "ERROR") {
                                        response.result = check_result.result;
                                        response.message = check_result.message;
                                        logger.error("[SERVICE] --> DB removeService error for node " + board + ": " + response.message);
                                        res.send(JSON.stringify(response));

                                    } else {
                                        response.message = "Service " + command + " stopped on node " + board + " (port = "+port+") !";
                                        response.result = "WARNING";
                                        logger.info("[SERVICE] - " + response.message);
                                        res.send(JSON.stringify(response));

                                    }

                                });

                            },
                            function (error) {

                                logger.error("[SERVICE] --> WAMP publication error (service stop) on node " + board + "!");

                                response.result = check_result.result;
                                response.message = "WAMP communication error: " + error;
                                logger.error("[SERVICE] --> " + response.message);
                                res.send(JSON.stringify(response));

                            }

                        );




                    }

                }



            });
        }



    }
    else {

        response.message = "Operation '"+op+"' not supported!";
        response.result = "ERROR";

        logger.error("[SERVICE] - " + response.message);

        res.send(JSON.stringify(response));


    }
};





var execute = function (command, label) {

    cmd = command.split(' ');
    logger.debug(label + ' COMMAND: ' + command);
    var result = spawn(cmd[0], cmd.slice(1));

    result.stdout.on('data', function (data) {
        logger.debug(label + ' stdout: ' + data);
    });

    result.stderr.on('data', function (data) {
        if (command.indexOf('socat') > -1)
            logger.info(label + ' stderr: ' + data);
        else
            logger.error(label + ' stderr: ' + data);
    });

    return result;

};

//Function to get the IP associated to the NIC specified in the settings.json
var getIP = function (interface, version) {
    var ip = null;
    for (var ifName in networkInterfaces){
        if(ifName == interface){
            var ifDetails = networkInterfaces[ifName];
            for (var i = 0; ifDetails[i].family == version; i++){
                ip = ifDetails[i].address;
            }
        }
    }

    return ip;
};

//Function to calculate a new tcp port not already used
function newPort(callback) {
    
    var port = randomIntInc(6000, 7000);

    var response = {
        message: '',
        result: ''
    };
    
    db.checkPort(port, function (data) {

        if (data.result == "ERROR") {
            logger.error("[SERVICE] --> DB removeService error for node " + board + ": " + data.message);
            callback(data)

        } else {

            if (data.message.length == 0) {
                response.message = port;
                response.result = "SUCCESS";
                callback(response);
            }
            else
                newPort();

        }

    });
    
}

//This function returns a pseudo random number in a range
function randomIntInc(low, high) {
    return Math.floor(Math.random() * (high - low + 1) + low);
}

//This function return true if an array contains another array
function arrayContainsAnotherArray(needle, haystack) {
    for (var i = 0; i < needle.length; i++) {
        if (haystack[needle[i]] == undefined)
            return false;
    }
    return true;
}



module.exports = utility;
module.exports.execute = execute;
module.exports.getIP = getIP;

