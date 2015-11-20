/*
Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

Copyright (c) 2014 2015 Andrea Rocco Lotronto, Arthur Warnier, Nicola Peditto
*/

//main logging configuration                                                                
log4js = require('log4js');          
log4js.loadAppender('file');         
log4js.addAppender(log4js.appenders.file('/var/log/s4t-iotronic.log'));  

var db_utils = require('./mysql_db_utils');
var utility = require('./utility'); 
var net_utility = require('./net_utils');
var measure_utility = require('./measure_utils');
var plugin_utility = require('./plugin_utils');

var autobahn = require('autobahn');
var express = require('express');
var ip = require('ip');
var spawn = require('child_process').spawn;
var uuid = require('uuid');

var nconf = require('nconf');
nconf.file ({file: process.cwd()+'/lib/settings.json'});

var intr = nconf.get('config:server:interface');

var topic_command = nconf.get('config:wamp:topic_command');
var topic_connection = nconf.get('config:wamp:topic_connection');

var db = new db_utils;
//db.conn();

var utils = new utility;

s4t_wamp_server = function(){}

s4t_wamp_server.prototype.start = function(restPort, wamp_router_url, wamp_realm){


  var getIP = require('./getIP.js');
  var IPLocal = getIP(intr, 'IPv4');

  var connection = new autobahn.Connection({
    url:wamp_router_url,
    realm: wamp_realm
  });



  connection.onopen = function (session, details) {

    var rest = express();

    var net_utils = new net_utility(session);
    var utils = new utility(session);
    var measure_utils = new measure_utility(session);
    var plugin_utils = new plugin_utility(session);

    rest.get('/', function (req, res){
      res.send('API: <br> http://'+IPLocal+':'+restPort+'/list   for board list');
    });

    rest.get('')


    rest.get('/command/', function (req, res){

      
      var command = req.query.command;
      var board = req.query.board;
      var pin = req.query.pin;
      var mode = req.query.mode;
      var value = req.query.val;
      var op = req.query.op;
      var netname = req.query.netname;
      var netuid = req.query.netuid;
      var measurename = req.query.measurename;
      var measureoperation = req.query.measureoperation;
      var measurepin = req.query.measurepin;
      var measureperiod = req.query.measureperiod;
      var pluginname = req.query.pluginname;
      var plugincategory = req.query.plugincategory;
      var pluginjsonschema = req.query.pluginjsonschema;
      var pluginjson = req.query.pluginjson;
      var pluginoperation = req.query.pluginoperation;
      var plugincode = req.query.plugincode;
      var readplugin = req.query.readplugin;
      var elaborateplugin = req.query.elaborateplugin;
      var autostart = req.query.autostart;
      
      res.type('application/json');

      if(board!=undefined){
    
        db.checkBoardConnected(board, function(data){
	  
          if(data.length == 1){
            if(data[0].status == 'D'){
              //DEBUG
              console.log("Board state is Disconnected");
              var response = {
                error:{}
              }
              response.error="Board state is Disconnected"
              res.send(JSON.stringify(response));
       
            }

            else{
	      
              switch(command){
		
		  case 'tty':
		    utils.exportService(board, command, op, res);
		    break;
		  case 'ssh':
		    utils.exportService(board, command, op, res);
		    break;
		  case 'ideino':
		    utils.exportService(board, command, op, res);
		    break;
		  case 'osjs':
		    utils.exportService(board, command, op, res);
		    break;
		  //PIN management  
		  case 'mode':
		    //DEBUG
		    console.log("MODE");
		    var response = {
		      message: 'Set Mode',
		      error: {},
		    }

		    session.call(board+'.command.rpc.setmode', [pin, mode]).then(
		      function(result){
		      response.error = result;
		      res.send(JSON.stringify(response));
		    } , session.log);
		    break;

		  case 'analog':
		    var response = {
		      message : 'Analog',
		      result: {}
		    }
		    if(value!=undefined){
		      //DEBUG
		      console.log('ANALOG WRITE on board: '+ board + ' - pin '+ pin + ' with value '+ value);
		      response.message += ' Write'
		      session.call(board+'.command.rpc.write.analog', [board, command, pin, value]).then(
			function(result){
			  response.result = result;
			  res.send(JSON.stringify(response));
			} , session.log);
		    }
		    else{
		      //DEBUG message
		      console.log('ANALOG READ on board: '+ board +' - pin '+ pin);
		      response.message += ' Read'
		      session.call(board+'.command.rpc.read.analog', [board, command, pin]).then(
			function(result){
			  response.result = result;
			  res.send(JSON.stringify(response));
			}, session.log);
		    }
		    break;

		  case 'digital':
		    var response = {
		      message: 'Digital ',
		      result:{}
		    }

		    if(value!=undefined){
		      //DEBUG
		      console.log('DIGITAL WRITE on board: '+ board +' - digital pin '+ pin + ' with value '+ value);
		      response.message += 'Write';
		      session.call(board+'.command.rpc.write.digital', [board, command, pin, value]).then(
			function(result){
			  response.result = result;
			  //res.send(JSON.stringify(response));
			  res.send("callback("+JSON.stringify(response)+")");  //JSONP callback
			} , session.log);
		    }
		    else{
		      //DEBUG Message
		      console.log('DIGITAL READ on board: '+ board +' - digital pin '+ pin);
		      response.message+= 'Read';
		      session.call(board+'.command.rpc.read.digital', [board, command, pin]).then(
			function(result){
			  response.result = result;
			  res.send(JSON.stringify(response));
			} , session.log);
		    }
		    break;
		    
		  case 'measure':
		      measure_utils.manageMeasures(board, measurename, measureoperation, res);
		      break
		    
		  case 'plugin':
		      plugin_utils.managePlugins(board, pluginname, pluginjson, pluginoperation, res);
		      break
		  
		  case 'injectmeasure':
		      measure_utils.injectMeasure(board, measurename, measurepin, measureperiod, res);
		      break
		      
		  case 'injectplugin':
		      plugin_utils.injectPlugin(board, pluginname, autostart, res);
		      break
		      
		  case 'add-to-network':
		    //addToNetwork();
		    net_utils.addToNetwork(netuid, board, value, res);
		    break

		  case 'remove-from-network':
		    //removeFromNetwork();
		    net_utils.removeFromNetwork(netuid, board, res);
		    break;

		  case 'update-board':
		    //updataBoard();
		    net_utils.updataBoard(netuid, board, value, res);
		    break;

		  default:
		    //DEBUG MESSAGE
		    console.log("Default Case");
		    
		    var response = {
		      error:{}
		    }
		    response.error='ERROR COMMAND';
		    res.send(JSON.stringify(response));
		    break;

            
            }
          }
        }
          else{
            //DEBUG
            console.log("ID DOESN'T exsist");
            var response = {
              error:{}
              }
            response.error="ID doesn't exsist";
            res.send(JSON.stringify(response));
          }
        });
      }
      else{
	
	
        switch(command){
	  
            case 'createplugin':
                //measure_utils.createPlugin(pluginname, plugincategory, pluginjsonschema, plugincode, res);
		plugin_utils.createPlugin(pluginname, plugincategory, pluginjsonschema, plugincode, res);
                break
            case 'createmeasure':
                measure_utils.createMeasure(measurename, readplugin, elaborateplugin, res);
                break                         
            case 'create-network':
                //createNetwork();
                net_utils.createNetwork(netname,value,res);
                break;
            case 'update-network':
                //updateNetwork()
                net_utils.updateNetwork(netname,netuid,value,res);
                break;    
            case 'destroy-network':
                net_utils.destroyNetwork(netuid,res);
            break;
            case 'show-network':
                //showNetwork();
                net_utils.showNetwork(res);
                break;
            case 'show-boards':
                //showBoards();
                net_utils.showBoards(netuid, res);
                break;
                
            default:
                //DEBUG MESSAGE
                console.log("Default Case");
                
                var response = {
                    error:{}
                }
                response.error='ERROR COMMAND';
                res.send(JSON.stringify(response));
                break;
		
		
        }
        
      }
      
      
    });

    
    rest.get('/list/', function (req, res){
      
        res.type('application/json');
        var list=[];
        var response = {
          list: {}
        };
	
        db.getBoardsConnected(function(data){
          response.list = data;
          //res.send(JSON.stringify(response)); //simple JSON format
	  res.send("callback_BoardList("+JSON.stringify(response)+")");  //JSONP callback
	  console.log("BoardList called.");
        });
	
    });

    try{     
	rest.listen(restPort);
	console.log("Server REST started on: http://"+IPLocal+":"+restPort);

	console.log("Connected to router WAMP");
    }
    catch(err){
      
	  console.log("ERROR to connect to REST server: "+err);
	  /*
	  while(err) {
	    console.log("ERROR to connect to REST server: "+err);
	  }
	  rest.listen(restPort);
	  */

    }
    
    
    // Publish, Subscribe, Call and Register
    var onBoardConnected = function (args){
    	

    	if(args[1]=='connection'){    
	  
	  db.checkBoard(args[0], function(data){
	      //DEBUG
	      console.log("board_user:: data.length::"+data.length);
	      if(data.length == 0){
		//DEBUG
		console.log("A not authorized board has tried a connection to the cloud");
		//console.log("First Connection of the Board "+args[0]);
		//db.insertBoard(args[0],args[2],'active', function(result){
		//  console.log("Risultato della insert:::"+result);
		//});
	      }
	      else{
		db.checkBoardConnected(args[0], function(data){
		  //DEBUG
		  console.log("boards_connected:: data.length"+data.length);
		  if(data.length == 0){
		    console.log("First Connection of the Board "+args[0]);
		    db.insertBoard(args[0],args[2],'C', function(result){
		      console.log("Risultato della insert:::"+result);
		    });
		  }
		  else{
		    console.log("Not First Connection of the board"+args[0]);
		    db.changeBoardState(args[0],args[2],'C', function(result){
		      //DEBUG
		      db.checkBoardConnected(args[0], function(data){
			console.log("Now the status of the board is:");
			console.log("board_code::"+data[0].board_code);
			console.log("session::"+data[0].session_id);
			console.log("status::"+data[0].status);  
		      });
		    });
		  }
		});
	      }
	  });
      }
      
    }

    session.subscribe(topic_connection, onBoardConnected);
    console.log("Subsscribe to topic: "+topic_connection);

    var onLeave_function = function(session_id){
      console.log("Find with SESSION code::"+session_id);
      db.findBySessionId(session_id, function(data){
        //DEBUG
        //console.log("length result"+data.length);
        if(data.length == 1){
          db.changeBoardState(data[0].board_code,'null','D', function(result){
            //DEBUG
            //db.checkBoard(data[0].name, function(data){
            //  console.log("Now the status of the board is:");
            //  console.log("name"+data[0].name);
            //  console.log("session"+data[0].session);
            //  console.log("stato"+data[0].state);  
            //});
            db.removeAllServices(data[0].board_code, function(result){});
          });
        }  
      });
    }

    var onJoin_function = function(args){
      console.log("onjoin");
      console.dir(args);
    }
    
    session.subscribe('wamp.session.on_join',onJoin_function);
    
    session.subscribe('wamp.session.on_leave',onLeave_function);

  }


   connection.onclose = function (reason, details) {
      console.log("Connection close for::"+reason);
      console.log("Connection close for::");
      console.dir(details);
      //connection.open();
   }

  connection.open();

}



module.exports = s4t_wamp_server;