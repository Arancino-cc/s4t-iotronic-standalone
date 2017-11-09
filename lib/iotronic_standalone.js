//############################################################################################
//##
//# Copyright (C) 2014-2017 Dario Bruneo, Francesco Longo, Andrea Rocco Lotronto,
//# Giovanni Merlino, Nicola Peditto
//##
//# Licensed under the Apache License, Version 2.0 (the "License");
//# you may not use this file except in compliance with the License.
//# You may obtain a copy of the License at
//##
//# http://www.apache.org/licenses/LICENSE-2.0
//##
//# Unless required by applicable law or agreed to in writing, software
//# distributed under the License is distributed on an "AS IS" BASIS,
//# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//# See the License for the specific language governing permissions and
//# limitations under the License.
//##
//############################################################################################

nconf = require('nconf');
log4js = require('log4js');



//IMPORT GENERIC MODULES
var autobahn = require('autobahn');
var express = require('express');
var bodyParser = require('body-parser');
var jwt = require('jsonwebtoken');
var ip = require('ip');
var fs = require('fs');


iotronic_standalone = function () {

    init_iotronic = require('./init_iotronic');

    logger = log4js.getLogger('main');
    logger.setLevel(loglevel);


};


iotronic_standalone.prototype.start = function (restPort, wamp_router_url, wamp_realm) {

    server_rest_port = restPort;
    
    // Init IoTronic modules
    init_iotronic.initIoTronicModules();

    // Set up WAMP connection
    var connection = new autobahn.Connection({
        url: wamp_router_url,
        realm: wamp_realm
    });

    /* TEST WAMP over HTTPS
    console.log(wamp_router_url)
    var connection = new autobahn.Connection({
        url: "wss://localhost:443", //wamp_router_url,
        realm: wamp_realm
    });
    console.log(connection);
    console.log(connection._options.transports);
     */

    // Connect to WAMP router
    connection.open();


    // Actions to perform on connection
    connection.onopen = function (session, details) {

        logger.info("[SYSTEM] - Connected to WAMP router!");

        iotronic_session = session;

        if (IPLocal != undefined) {

            var rest = express();

            /*++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++*/
            /* SWAGGER TEST */
            /*++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++*/
            /**/
            //if (docs_enabled == "true"  || docs_enabled == true){
            if (true){
                docs.genApiDocs(rest);
            }
            /*++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++*/

            rest.get('/', function (req, res) {

                res.status(200).send("<center> Welcome in Iotronic-standalone! <br><br><br> <a href='http://" + IPLocal + ":" + restPort + "/v1/iotronic-api-docs/'>Please visit API documentation</a> </center>");

            });


            // Configuring REST server
            rest.use(bodyParser.json()); // support json encoded bodies
            rest.use(bodyParser.urlencoded({extended: true})); // support encoded bodies
            rest.all('/*', function(req, res, next) {
                res.type('application/json');
                res.header("Access-Control-Allow-Origin", "*");
                res.header("Access-Control-Allow-Methods", 'GET, POST, DELETE, PATCH, PUT');
                next();
            });


            // Load authentication manager ------------------------------------------------------------------------------

            if(auth_backend == "iotronic"){

                var auth = new auth_utility(session, rest);

                rest.use(function(req, res, next) {

                    console.log(req.headers); console.log(req.body);

                    var ip_requester = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

                    var message;
                    // check header or url parameters or post parameters for token
                    var token = req.body.token || req.query.token || req.headers['x-auth-token'];

                    if(token){

                        adminToken = nconf.get('config:server:auth:adminToken');

                        if(token == adminToken){
                            //If you are SuperAdmin and you are using adminToken.

                            logger.debug("[AUTH] - SuperAdmin request verified from " + ip_requester);
                            req.IotronicUser = "SuperAdmin";
                            next();

                        }else {
                            //Decode the token
                            jwt.verify(token, encryptKey, function(err,decod){

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
                                    logger.debug("[AUTH] - Request verified for " + decod.username + " ("+decod.uuid+") from " + ip_requester);
                                    req.decoded=decod;
                                    req.IotronicUser=decod.username;
                                    next();

                                }

                            });
                        }


                    }
                    else{

                        logger.warn("[AUTH] - No token specified in the request: " + req.route.path);
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



            // Loading IoTronic modules
            init_iotronic.loadIoTronicModules(session, rest);

            // REST server starting if there are not errors caught
            if (iotronic_status === "OK") {

                //Subscribing IoTronic to WAMP topics
                wamp.IoTronicSubscribe();

                // SYNCHRONIZE BOARD LIST
                wamp.boardSync();

                // Register IoTronic management RPCs
                init_iotronic.mngRpcRegister(session);

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

                
            }
            else {
                // Exit from IoTronic if there are errors caught
                logger.error("[SYSTEM] - ERROR: " + iotronic_status);
                logger.info('Bye!');
                process.exit();
            }
            



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





module.exports = iotronic_standalone;
