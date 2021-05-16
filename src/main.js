var io = require('socket.io')();
const {spawn} = require('child_process');

const mapSize = 20;
const tick = 500; //tick in ms
const timeOut = .12 * 60 * 1000; //time to start

let timeToStart = -1;
let countdownStart;

let gameStarted = false;

const directions = Object.freeze({"up": 0, "left": 1, "down": 2, "right": 3})
const mapObjects = Object.freeze({"empty": 0, "fruit": -1})

var map = new Array(mapSize).fill(0).map(() => {return Array(mapSize).fill(0)});
var players = [];
var fruit = {x: Math.floor(mapSize/2), y:  Math.floor(mapSize/2)};

// calc spawn points
var spawnPoints = [];
for(let x = 0; x < mapSize; x++){
    for(let y = 0; y < mapSize; y++){
        if(Math.floor(((x-mapSize/2)*(x-mapSize/2)) + ((y-mapSize/2)*(y-mapSize/2))) == Math.floor((mapSize*mapSize)/5))
            spawnPoints.push({x: x, y: y});
    }

    spawnPoints.map((point) => {
        let random = Math.floor(Math.random() * spawnPoints.length);

        let temp = {x: 0, y: 0};
        temp.x = point.x;
        temp.y = point.y;
        point.x = spawnPoints[random].x;
        point.y = spawnPoints[random].y;
        spawnPoints[random].x = temp.x;
        spawnPoints[random].y = temp.y;

        /*
        let temp;
        temp = point;
        point = spawnPoints[random];
        spawnPoints[random] = temp;*/
    })
}

io.on('connection', (socket) => {
	console.log("Player connected");
	let name = "Default";
	let in_game = false;
  let playerId;
  let playerObject;

	socket.on("name", (msg) => {
        if(msg.name !=  "")
            name = msg.name.substring(0, 32);
	});
	socket.on("join_game", (msg) => {
        if(msg != undefined && msg.name != undefined)
            if(msg.name !=  "")
                name = msg.name.substring(0, 32);

		if(!in_game){
			playerId = -1 + players.push(
                {
                    name: name,
                    socket: socket,
                    head: {},
                    tail: [],
                    direction: Math.floor(Math.random() * 4),
                    length: 3,
                    alive: true,
                    moved: false,
                    cleanup: () => {
                        console.log(in_game);
                        in_game = false;
                        playerId = undefined;
                        playerObject = {};
                    }

                }
            );

            if(playerId < spawnPoints.length){
                playerObject = players[playerId];
                playerObject.head.x = spawnPoints[playerId].x;
                playerObject.head.y = spawnPoints[playerId].y;
                in_game = true;
                drawMapAndSend();
                io.sockets.emit("player_list", {players: players.map((x)=>{return x.name})});
                socket.on('disconnect', () => {
                    if(gameStarted)
                        playerObject.alive = false;
                    else
                        players.splice(playerId, 1);
                });
                socket.on("move", (msg) => {
                    if(playerObject.moved === false){
                        playerObject.moved = true;
                        if(msg.direction === 0)
                            playerObject.direction = (4 + playerObject.direction - 1) % 4;
                        else if(msg.direction === 1)
                            playerObject.direction = (playerObject.direction + 1) % 4;
                    }
                });
            }
		}

        if(playerId === 1 && !gameStarted){
            countdownStart = Date.now();
            setTimeout(timeout, timeOut/100);
            io.sockets.emit("timeToStart", {time: timeOut/1000});
        }
	});


	//socket.emit("map", {map});
    emitOptimisedMap();
	socket.emit("player_list", {players: players.map((x) => {return x.name})})
	socket.emit("mapInfo", {size: mapSize})
});

function timeout(){
	let time = timeOut - (Date.now() - countdownStart);
	io.sockets.emit("timeToStart", {time: Math.ceil(time/1000)});

	switch(true){
		case (time < 10000 && time > 5000):
			setTimeout(timeout, 1000);
			break;
		case (time < 5000 && time > 3000):
			setTimeout(timeout, 500);
			break;
		case (time < 3000 && time > 0):
			setTimeout(timeout, 100);
			break;
		case (time <= 0):
			io.sockets.emit("timeToStart", {time: -1});
            gameStarted = true;
			setImmediate(game);
			break;
		default:
			setTimeout(timeout, 5000);
	}
}

let lastFrame;
function game (){
    lastFrame = Date.now();


    let newMap = new Array(mapSize).fill(0).map(() => {return Array(mapSize).fill(0).map(() => {return Array()})});

    newMap[fruit.x][fruit.y].push(mapObjects.fruit);

    players.map((player, index) => {
        if(player.alive){
            movePlayer(player);
            drawPlayer(player, index, newMap);
        }
    })

    if(updateMap(newMap))
        io.sockets.emit("player_list", {players: players.map((x)=>{return x.name + (x.alive ? "" : " ⚰️")})});

    emitOptimisedMap();

    players.forEach((player) => {player.moved = false});

    let alive = 0;
    players.map((x)=>{if(x.alive)alive++});
	if(alive > 0)
    	setTimeout(game, tick - (Date.now() - lastFrame));
    else if(alive === 0){
        let last;
        players.map((x)=>{if(x.alive)last = x.name;});
        io.sockets.emit("winner", {winner: last});
        cleanup();
    }
};

io.listen(5070);

//game();

drawMapAndSend();

//game functions

function cleanup(){
    players.forEach((player) => {
        player.cleanup();
    });

    players = [];
    gameStarted = false;
    fruit = {x: Math.floor(mapSize/2), y:  Math.floor(mapSize/2)};
}

function drawMapAndSend(){
    let newMap = new Array(mapSize).fill(0).map(() => {return Array(mapSize).fill(0).map(() => {return Array()})});

    newMap[fruit.x][fruit.y].push(mapObjects.fruit);

    players.map((player, index) => {
        drawPlayer(player, index, newMap);
    })

    updateMap(newMap);
    emitOptimisedMap();

    //io.sockets.emit("map", {map});
}

function emitOptimisedMap(){
    let message = map.map((x) => {
        return (x.map((y) => {
            return String.fromCharCode(y + 49)

        })).join('')
    }).join('');
    io.sockets.emit("map", {map: message});
}

function movePlayer(player){
    player.tail.unshift((4 + player.direction-2)%4);
    if(player.length < player.tail.length)
        player.tail.pop();
    switch (player.direction){
        case directions.up:
            player.head.y = (player.head.y + 1) % mapSize;
            break;
        case directions.down:
            player.head.y = (mapSize + player.head.y - 1) % mapSize;
            break;
        case directions.left:
            player.head.x = (mapSize + player.head.x - 1) % mapSize;
            break;
        case directions.right:
            player.head.x = (player.head.x + 1) % mapSize;
            break;
    }
}

function drawPlayer(player, index, newMap){
    let X = player.head.x, Y = player.head.y;
    newMap[X][Y].push(index);

    player.tail.map((tail) => {
        switch (tail){
            case directions.up:
                Y = (Y+1) % mapSize;
                break;
            case directions.down:
                Y = (mapSize+(Y-1)) % mapSize;
                break;
            case directions.left:
                X = (mapSize+(X-1)) % mapSize;
                break;
            case directions.right:
                X = (X+1) % mapSize;
                break;
        }
    newMap[X][Y].push(index);
    });
}

function updateMap(newMap){ //return if players are updated
    let playerNumberChanged = false;

    for(let x = 0; x < mapSize; x++)
        for(let y = 0; y < mapSize; y++){
            if(newMap[x][y].length == 0){
                map[x][y] = 0;
            } else if(newMap[x][y].length === 1){
                if(newMap[x][y][0] >= 0)
                    map[x][y] = newMap[x][y][0] + 1;
                else
                    map[x][y] = newMap[x][y][0];
            } else if(newMap[x][y].length === 2){
                if (newMap[x][y][0] == mapObjects.fruit){
                    players[newMap[x][y][1]].length++;
                    fruit.x = Math.floor(Math.random()*mapSize);
                    fruit.y = Math.floor(Math.random()*mapSize);
                    map[x][y] = newMap[x][y][1] + 1;
                } else {
                    // kill  TODO: add animation (?)
                    for(let z = newMap[x][y].length - 1; z >= 0; z--){
                        if(newMap[x][y][z] != undefined)
						if(newMap[x][y][z] > -1)
                            if(x == players[newMap[x][y][z]].head.x && y == players[newMap[x][y][z]].head.y){
                                //players.splice(newMap[x][y][z], 1); //TODO there is room for optimization  SET AS DEAD INSTEAD OF DELETING
                                players[newMap[x][y][z]].alive = false;
                                playerNumberChanged = true;
                            } else {
								map[x][y] = newMap[x][y][z];
							}
                    }
                    /*
                    newMap[x][y].map((player) => {

                        if(players[player] != undefined)  //TODO fix and test
                            if(x == players[player].head.x && y == players[player].head.y){
                                players.splice(player, 1);
                            }
                    })*/
                }
            } else {
                for(let z = newMap[x][y].length - 1; z >= 0; z--){	//console.log("2-"+z+":");console.log(newMap[x][y]);
                    if(newMap[x][y][z] != undefined)
					if(newMap[x][y][z] > -1)
                        if(x == players[newMap[x][y][z]].head.x && y == players[newMap[x][y][z]].head.y){
                            //players.splice(newMap[x][y][z], 1); //TODO there is room for optimization
                            players[newMap[x][y][z]].alive = false;
                            playerNumberChanged = true;
                        } else {
							map[x][y] = newMap[x][y][z];
						}
                }
                    /*
                newMap[x][y].map((player) => {
                    if(x == players[player].head.x && y == players[player].head.y){
                        players.splice(player, 1);
                    }
                })*/
            }
        }

        return playerNumberChanged;
}
