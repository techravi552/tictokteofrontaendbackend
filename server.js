// server.js
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const PORT = process.env.PORT || 5000;

// In-memory rooms storage
// Structure: rooms[roomId] = { id, players: [sockId,...], board: Array(9), currentTurn: "X"/"O", symbols: { socketId: "X"/"O" } }
const rooms = {};

// helper: make random room id
function makeRoomId() {
  return Math.random().toString(36).substring(2, 8);
}

// helper: check winner
function checkWinner(board) {
  const lines = [
    [0,1,2],[3,4,5],[6,7,8], // rows
    [0,3,6],[1,4,7],[2,5,8], // cols
    [0,4,8],[2,4,6]          // diags
  ];
  for (let [a,b,c] of lines) {
    if (board[a] && board[a] === board[b] && board[b] === board[c]) {
      return board[a]; // "X" or "O"
    }
  }
  if (board.every(cell => cell !== null)) return "draw";
  return null; // no winner yet
}

io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  // Create room -> first player becomes "X"
  socket.on("createRoom", (cb) => {
    const roomId = makeRoomId();
    rooms[roomId] = {
      id: roomId,
      players: [socket.id],
      board: Array(9).fill(null),
      currentTurn: "X",
      symbols: { [socket.id]: "X" }
    };
    socket.join(roomId);
    console.log(`Room ${roomId} created by ${socket.id}`);
    // send room created info to creator (their symbol)
    socket.emit("roomCreated", { roomId, symbol: "X" });
    if (cb) cb({ ok: true, roomId });
  });

  // Join room -> second player becomes "O"
  socket.on("joinRoom", ({ roomId }, cb) => {
    const room = rooms[roomId];
    if (!room) {
      if (cb) cb({ ok: false, error: "Room does not exist" });
      socket.emit("errorMessage", "Room does not exist.");
      return;
    }
    if (room.players.length >= 2) {
      if (cb) cb({ ok: false, error: "Room full" });
      socket.emit("errorMessage", "Room is full.");
      return;
    }
    // add player
    room.players.push(socket.id);
    room.symbols[socket.id] = "O";
    socket.join(roomId);
    console.log(`${socket.id} joined room ${roomId}`);
    // inform both players that game started
    // send each player their symbol
    room.players.forEach(pid => {
      const sym = room.symbols[pid];
      io.to(pid).emit("yourSymbol", { symbol: sym });
    });
    // broadcast game started with board and whose turn
    io.to(roomId).emit("gameStarted", { board: room.board, currentTurn: room.currentTurn });
    if (cb) cb({ ok: true });
  });

  // Make move
  socket.on("makeMove", ({ roomId, index }) => {
    const room = rooms[roomId];
    if (!room) {
      socket.emit("errorMessage", "Invalid room.");
      return;
    }
    const playerSymbol = room.symbols[socket.id];
    if (!playerSymbol) {
      socket.emit("errorMessage", "You are not part of this room.");
      return;
    }
    // check if it's this player's turn
    if (playerSymbol !== room.currentTurn) {
      socket.emit("errorMessage", "Not your turn.");
      return;
    }
    // check cell empty
    if (room.board[index] !== null) {
      socket.emit("errorMessage", "Cell already occupied.");
      return;
    }
    // accept move
    room.board[index] = playerSymbol;
    // check winner/draw
    const result = checkWinner(room.board);
    if (result === "draw") {
      io.to(roomId).emit("gameOver", { result: "draw", board: room.board });
    } else if (result === "X" || result === "O") {
      io.to(roomId).emit("gameOver", { result: "win", winner: result, board: room.board });
    } else {
      // continue game -> switch turn
      room.currentTurn = room.currentTurn === "X" ? "O" : "X";
      // send updated board and current turn
      io.to(roomId).emit("updateBoard", { board: room.board, currentTurn: room.currentTurn });
    }
  });

  // Restart game (optional)
  socket.on("restartGame", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    room.board = Array(9).fill(null);
    room.currentTurn = "X";
    io.to(roomId).emit("gameRestarted", { board: room.board, currentTurn: room.currentTurn });
  });

  // Handle disconnect
  socket.on("disconnect", () => {
    console.log("Disconnected:", socket.id);
    // find room(s) the socket was in and remove
    for (const rId in rooms) {
      const room = rooms[rId];
      if (room.players.includes(socket.id)) {
        // remove player
        room.players = room.players.filter(p => p !== socket.id);
        delete room.symbols[socket.id];
        // tell remaining player
        if (room.players.length === 1) {
          io.to(room.players[0]).emit("opponentLeft", { message: "Opponent disconnected." });
        } else {
          // no players left -> delete room
          delete rooms[rId];
        }
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
