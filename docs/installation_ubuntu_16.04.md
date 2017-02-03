#Stack4Things IoTronic (standalone version) installation guide for Ubuntu 16.04

We tested this procedure on a Ubuntu 16.04 within a LXD container on top of a Kubuntu 16.04 on 11th October 2016. Everything needs to be run as root.

####Install dependencies via apt-get

```
# apt -y install nodejs nodejs-legacy npm python-dev libyaml-dev libpython2.7-dev mysql-server nmap apache2 unzip socat bridge-utils python-pip python-httplib2
```

####Install dependencies using npm

```
# npm install -g npm
# npm install -g node-reverse-wstunnel requestify mysql nconf ip express uuid autobahn log4js q fuse-bindings fs-access mknod statvfs util
```

####Configure npm NODE_PATH variable

```
# echo "export NODE_PATH=/usr/local/lib/node_modules" | sudo tee -a /etc/profile
# source /etc/profile > /dev/null
# echo $NODE_PATH
```

####Install Crossbar.io router

```
# apt-key adv --keyserver hkps.pool.sks-keyservers.net --recv D58C6920 && sh -c "echo 'deb http://package.crossbar.io/ubuntu xenial main' | sudo tee /etc/apt/sources.list.d/crossbar.list"
# apt update
# apt install crossbar
```

####Install IoTronic

```
# mkdir /opt/stack4things
# cd /opt/stack4things
# wget https://github.com/MDSLab/s4t-iotronic-standalone/archive/vfs.zip
# unzip vfs.zip && sudo rm vfs.zip
# mv s4t-iotronic-standalone-vfs/ iotronic-standalone
# cp /opt/stack4things/iotronic-standalone/etc/systemd/system/s4t-iotronic.service /etc/systemd/system/
# chmod +x /etc/systemd/system/s4t-iotronic.service
# systemctl daemon-reload
# systemctl enable s4t-iotronic.service
```

####Configure and start Crossbar.io router

```
# mkdir /etc/crossbar
# cp /opt/stack4things/iotronic-standalone/etc/crossbar/config.example.json /etc/crossbar/config.json
# cp /opt/stack4things/iotronic-standalone/etc/systemd/system/crossbar.service /etc/systemd/system/
# chmod +x /etc/systemd/system/crossbar.service
# /opt/crossbar/bin/crossbar check --cbdir /etc/crossbar
# systemctl daemon-reload
# systemctl enable crossbar.service
# systemctl start crossbar
```
Please, note that the config.example.json coming with the iotronic-standalone package sets the name of the WAMP realm to "s4t" and the Crossbar.io listening port to "8181". If you want to change such values, please consider that later on you will need to correctly change them in other configuration files. 

####Configure and start Websocket reverse tunnel server

```
# cp /opt/stack4things/iotronic-standalone/etc/systemd/system/node-reverse-wstunnel.service /etc/systemd/system/
# chmod +x /etc/systemd/system/node-reverse-wstunnel.service
# systemctl daemon-reload
# systemctl enable node-reverse-wstunnel.service
# systemctl start node-reverse-wstunnel
```

####Configure and start IoTronic

First of all, you need to import the Iotronic database schema. During the installation of the MySQL package you should have been asked for a database root password. Please, substiture <DB_PASSWORD> with the one you chose. Also, please note that name of the database is set to "s4t-iotronic". If you want to change it, please consider that later on you will need to correctly change it in other configuration files.

```
# mysql -u root -p<DB_PASSWORD> < /opt/stack4things/iotronic-standalone/utils/s4t-db.sql
# mkdir /opt/stack4things/iotronic-standalone/drivers/
```

Then, copy the example of IoTronic configuration file coming with the package in the correct path. 
```
# cp /opt/stack4things/iotronic-standalone/lib/settings.example.json /opt/stack4things/iotronic-standalone/lib/settings.json
``` 
Please, note that the settings.example.json coming with the iotronic-standalone package sets the IoTronic listening port to "8888", the database name to "s4t-iotronic" (the database server is supposed to be running locally), the WAMP realm to "s4t" (the Crossbar.io WAMP router is supposed to be running locally on port 8181). If you want to change such values, please consider that later on you will need to correctly change them in other configuration files. 

Specify the network interface that IoTronic is supposed to use (e.g., change <INTERFACE> with "eth0").
```
# sed -i "s/\"interface\": \"\"/\"interface\":\"<INTERFACE>\"/g" /opt/stack4things/iotronic-standalone/lib/settings.json
```

Specify the database password (use the same password you set while installing the MySQL package).
```
# sed -i "s/\"password\": \"\"/\"password\":\"<DB_PASSWORD>\"/g" /opt/stack4things/iotronic-standalone/lib/settings.json
```

Now you are ready to start Iotronic.
```
# systemctl start s4t-iotronic
```

You can check logs by typing:
```
# tail -f /var/log/s4t-iotronic.log
```
