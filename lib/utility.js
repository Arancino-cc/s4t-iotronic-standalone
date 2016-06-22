/*
				 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

		  Copyright (c) 2014 2015 Andrea Rocco Lotronto, Nicola Peditto
*/

//service logging configuration: "utility"   
var logger = log4js.getLogger('utility');
logger.setLevel(loglevel);

var db_utils = require('./mysql_db_utils');
var db = new db_utils;


var nconf = require('nconf');
nconf.file ({file: process.cwd()+'/lib/settings.json'});

var topic_command     = nconf.get('config:wamp:topic_command');
var topic_connection  = nconf.get('config:wamp:topic_connection');
var intr = nconf.get('config:server:interface');

var getIP = require('./getIP.js');
var IPLocal = getIP(intr, 'IPv4');

var session_wamp;

utility = function(session){
  session_wamp = session;
  //logger.info("utility::"+"IPLocal::"+IPLocal);
};

utility.prototype.exportService = function(board, command, op, res){

  var response = {
    ip: IPLocal,
    port: {},
    service:command
  }
  
  if(op=="start" || op=="stop"){
    //DEBUG
    logger.debug("[SERVICE] - Service called: "+command);
    
    if(op=="start"){
      db.checkService(board, command, function(data){
        if(data.length == 0){
          //DEBUG
          logger.info("[SERVICE] - Service "+command+" started on board "+board+"!");
          
          //newPort function is used because we need a TCP port not already used
          newPort(function(port){
            //DEBUG
            //logger.info("New Port:::"+data);
            logger.info("[SERVICE] - "+topic_command +' '+ board +' '+ command +' '+ port +' '+ op);
            session_wamp.publish(topic_command, [board, command, port,op], {}, {acknowledge: true}).then(
                function(publication){
                    logger.info('[SERVICE] --> WAMP publication OK!');
                },
                function(error){
                    logger.error("[SERVICE] --> WAMP publication error on board "+board+"!");
                }
            );
            response.port = port;
            response.status=op;
            res.send(JSON.stringify(response));
            db.insertService(board,command, IPLocal, port, function(result){
              //DEBUG
              //logger.info("Insert Service::"+result);
            });
          });
        }
        else{
          //DEBUG
          logger.warn("[SERVICE] - "+command+" service already started on the board "+board+"!");
          //db.getPortService(board,command, function(data){
            //DEBUG
            //logger.warn(data);
            response.status=op;
            response.port=data[0].public_port;
            res.send({response: command+" service is already started on port "+response.port+ "!"});
          //});
        }
      });  
    }
    if(op=="stop"){
      response.status=op;
      db.checkService(board,command, function(data){
        if(data.length == 0){
          logger.warn("[SERVICE] - "+command+" service is already stopped on the board "+board+"!");
          res.send({response:command+" service is already stopped on this board!"});
        }
        else{
          //db.getPortService(board,command, function(data){
            //DEBUG
            logger.info("[SERVICE] - "+command+" service "+command+ " stopped on board "+board+"!");
            response.port = data[0].public_port;
            session_wamp.publish(topic_command, [board, command, response.port, op]);
            db.removeService(board,command, function(data){
              //DEBUG
              //logger.info(data);
              res.send(JSON.stringify(response));
            })
          //});
        }
      });
    }
  }
  else{
    response.status="error";
    res.send(JSON.stringify(response));
  }
}

//function to calculate a new tcp port not already used
function newPort (callback){
  var port = randomIntInc(6000,7000);
  db.checkPort(port, function(data){
    if(data == 0){
      return callback(port);
    }
    else{
      newPort();
    }
  });     
}

//This function returns a pseudo random number in a range
function randomIntInc (low, high) {
    return Math.floor(Math.random() * (high - low + 1) + low);
}

//This function return true if an array contains another array
function arrayContainsAnotherArray(needle, haystack){
  for(var i = 0; i < needle.length; i++){
    if(haystack[needle[i]] == undefined)
       return false;
  }
  return true;
}

module.exports = utility;