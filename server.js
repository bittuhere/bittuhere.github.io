const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors({ origin: "*" })); 

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

mongoose.connect(process.env.MONGO_URI).then(() => console.log("MongoDB Connected!"));

let rooms = {};

io.on('connection', (socket) => {
    socket.on('joinRoom', ({ roomId, playerName }) => {
        socket.join(roomId);
        if (!rooms[roomId]) {
            rooms[roomId] = { board: Array(9).fill(""), players: {}, turn: 'X', status: 'waiting' };
        }
        
        const symbol = Object.keys(rooms[roomId].players).length === 0 ? 'X' : 'O';
        rooms[roomId].players[socket.id] = { name: playerName, symbol };
        
        // Naye player ko signal dena
        socket.emit('init', { symbol, board: rooms[roomId].board });

        // AGAR 2 PLAYERS HO GAYE: Dono ko 'playing' status bhej do!
        if (Object.keys(rooms[roomId].players).length === 2) {
            rooms[roomId].status = 'playing';
            io.to(roomId).emit('updateBoard', { 
                board: rooms[roomId].board, 
                turn: 'X', // Game hamesha X se shuru hoga
                status: 'playing' 
            });
            console.log(`ROOM START: ${roomId}`);
        }
    });

    socket.on('makeMove', ({ roomId, index }) => {
        const room = rooms[roomId];
        if (room && room.status === 'playing' && room.board[index] === "") {
            const player = room.players[socket.id];
            if (player && room.turn === player.symbol) {
                room.board[index] = player.symbol;
                room.turn = room.turn === 'X' ? 'O' : 'X';
                
                // Win Check Logic
                const winPatterns = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
                let winner = null;
                for (let p of winPatterns) {
                    if (room.board[p[0]] && room.board[p[0]] === room.board[p[1]] && room.board[p[0]] === room.board[p[2]]) {
                        winner = room.board[p[0]];
                    }
                }
                let status = winner ? 'finished' : (room.board.includes("") ? 'playing' : 'draw');
                io.to(roomId).emit('updateBoard', { board: room.board, turn: room.turn, status, winner });
            }
        }
    });

    socket.on('chatMessage', ({ roomId, msg, sender }) => {
        io.to(roomId).emit('newChatMessage', { text: msg, sender });
    });
});

server.listen(process.env.PORT || 10000);
