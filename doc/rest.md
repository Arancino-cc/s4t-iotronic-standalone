#REST API Specification

###List of the connected devices 
```
http:/IP:PORT/list/
```
response json
```
{
	"list":
	[
		{
			"board_code":"boardID",
			"session_id":"null",
			"status":"Disconnected/Connected",
			"altitude":"alt",
			"longitude":"long",
			"latitude":"lat"
		},
		...
	]
}

```

###Export Local Services
```
http://IP:PORT/command/?board={boardID}&command={service_name}&op={start|stop}
```

response json:
```
{
	"ip":"IP",
	"port":"TUNNELED_PORT",
	"service":"ServiceName",
	"status":"start|stop"
}
```

###Set PIN mode
```
http://IP:PORT/command/?board={boardID}&command=mode&pin={pinName}&mode={input|output|pwm}
```
response json:
```
{
	"mesage": "Set Mode",
	"result": "0| ERROR DESCRIPTION"
}
```
### Digital or PWM Write
```
http://IP:PORT/command/?board={boardID}&command={analog|digital}&pin={pinName}&val={0,1 | 0,1...1024}
```
*in this REST call analog is used per PWM PIN*

response json:
```
{
	"message": "Digital Write | Analog Write",
	"result": "0 | ERROR DESCRIPTION"
}
```

### Digital or Analog read
```
http://IP:PORT/command/?board={boardID}&command={analog|digital}&pin={pinName}
```
response json:
```
{
	"message" : "Digital Read | Analog Read",
	"result": "value of the PIN | ERROR DESCRIPTION"
}
```

### Register board
```
http://IP:PORT/command/?command=reg-board&board={boardID}&latitude={latitude}&longitude={longitude}&altitude={altitude}&net_enabled={net_enabled_flag}&sensorlist={sensors_list}
```

response json:
```
{
	"result": "Registration successfully completed!"
}
```

### Update board
```
http://IP:PORT/command/?command=update-board&board={boardID}&latitude={latitude}&longitude={longitude}&altitude={altitude}&net_enabled={net_enabled_flag}&sensorlist={sensors_list}
```

response json:
```
{
	"result": "Updating board successfully completed!"
}
```

### Unregister board
```
http://IP:PORT/command/?command=update-board&board={boardID}&latitude={latitude}&longitude={longitude}&altitude={altitude}&net_enabled={net_enabled_flag}&sensorlist={sensors_list}
```

response json:
```
{
	"result": "Unegistration board successfully completed!"
}
```


### Create Plugin
```
http://IP:PORT/command/?command=createplugin&pluginname={plugin_name}&pluginjsonschema={plugin_json}&plugincode={plugin_code}
```
response json:
```
{
	"message": "Create Plugin",
	"result": {
		"fieldCount": 0,
		"affectedRows": rows,
		"insertId": id,
		"serverStatus": status, 
		"warningCount": 0,
		"message": "",
		"protocol41": true,
		"changedRows": 0
	}
}
```

### Inject Plugin
```
http://IP:PORT/command/?command=injectplugin&board={boardID}&pluginname={plugin_name}&autostart={True|False}
```
response json:
```
{
	"message": "Inject Plugin",
	"result": "Plugin injected successfully!" | "Plugin does not exist!"
}
```

###Run Plugin (async)
```
http://IP:PORT/command/?command=plugin&pluginname={plugin_name}&pluginjson={plugin_json}&pluginoperation=run&board={boardID}
```
response json:
```
{
	"message": "Run Plugin",
	"result": "OK - Plugin running!" | "Plugin category not supported!"
}
```

###Kill Plugin (async)
```
http://IP:PORT/command/?command=plugin&pluginname={plugin_name}&pluginoperation=kill&board={boardID}
```
response json:
```
{
	"message": "Kill Plugin",
	"result": "OK - plugin killed!" | "Plugin is not running on this board!"
}
```


###Call Plugin (sync)
```
http://IP:PORT/command/?command=plugin&pluginname={plugin_name}&pluginjson={plugin_json}&pluginoperation=call&board={boardID}
```
response json:
```
{
	"message": "Call Plugin",
	"result": "< CALL RESPONSE USER DEFINED >" | "Plugin category not supported!"
	
}
```

###Show Networks
```
http://IP:PORT/command/?command=show-network
```
response json:
```
{
	"message": "list of networks",
	"result": [
		{
			"uuid": "network-uuid",
			"name": "network-name",
			"address": "IP",
			"size": size,
			"hosts": []
		},
		....
	] 
}
```

### Create New Network
```
http://IP:PORT/command/?command=create-network&netname={name-of-the-network}&val={Net-IP/Net-Mask}
```
response json:
```
{
	"message": "Network created",
	"result":"NETWORK SUCCESSFULLY CREATED!",
	"log":{
		"vlanid": "vlanid",
		"uuid":"UUID-assigned",
		"name":"name-of-the-network",
		"netaddr":"Net-IP",
		"netmask":"Net-Mask"
	}
}

### Destroy Network
```
http://IP:PORT/command/?command=destroy-network&netuid={uuid-of-the-network}
```
response json:
```
{
	"message":"Destroying network",
	"result": "NETWORK network-uuid DESTROYED!"
}
```

```
### Add Board to Network
```
http://IP:PORT/command/?command=add-to-network&netuid={uuid-of-the-network}&boad={boardID}&[val={IP}]
```
response json:
```
{
	"message":[{"ip":"board_IP"}],
	"result":"VLAN CONNECTION ON boardID SUCCESSFULLY ESTABLISHED!",
	"log":{
		"board":"boardID",
		"socatID":1,
		"socatPort":10000,
		"greIP":"IP",
		"greMask":"24",
		"vlanID":"vlanid",
		"vlan_name":"name-of-the-vlan",
		"net_uuid":"UUID-assigned"
	}
}

```

### Remove Board from a Network
```
http://IP:PORT/command/?command=remove-from-network&netuid={name-of-the-vlan}&board={board-id}
```
response json:
```
{
	"message": [
		{
			"found": 1
		}
	],
	"result": "BOARD board-id REMOVED FROM VLAN name-of-the-vlan",
	"log": {
		"message": {
			"fieldCount": 0,
			"affectedRows": 1,
			"insertId": 0,
			"serverStatus": 34,
			"warningCount": 0,
			"message": "",
			"protocol41": true,
			"changedRows": 0
		},
		"result": "SUCCESS"
	}
}


```


###Show Boards
```
http://IP:PORT/command/?command=show-boards&netuid={network-uuid}
```
response json:
```
{
	"message": "Showing boards in a network",
	"result": [
		{
			"BOARD_ID": "boardID",
			"vlan_NAME": "name-of-the-vlan",
			"vlan_ID": 15,
			"vlan_IP": "board_vlanIP",
			"socat_ID": 1,
			"socat_IP": "board_socatIP",
			"socat_PORT": 10000
		}
	],
	...
	"log": ""
}

```
