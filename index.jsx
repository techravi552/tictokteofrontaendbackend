// src/App.js
import React, { useEffect, useState } from "react";
import { io } from "socket.io-client";
import "./App.css";

const socket = io("http://localhost:5000");

function App() {
  const [roomInput, setRoomInput] = useState("");
  const [roomId, setRoomId] = useState(null);
  const [board, setBoard] = useState(Array(9).fill(null));
  const [mySymbol, setMySymbol] = useState(null);
  const [currentTurn, setCurrentTurn] = useState(null);
  const [status, setStatus] = useState("Not connected");
  const [waiting, setWaiting] = useState(false);
  const [gameOver, setGameOver] = useState(false);

  useEffect(() => {
    socket.on("roomCreated", ({ roomId, symbol }) => {
      setRoomId(roomId);
      setMySymbol(symbol);
      setWaiting(true);
      setStatus(`Waiting for opponent...`);
      setGameOver(false);
    });

    socket.on("yourSymbol", ({ symbol }) => setMySymbol(symbol));

    socket.on("gameStarted", ({ board, currentTurn }) => {
      setBoard(board);
      setCurrentTurn(currentTurn);
      setWaiting(false);
      setStatus(currentTurn === mySymbol ? "Your turn" : "Opponent's turn");
      setGameOver(false);
    });

    socket.on("updateBoard", ({ board, currentTurn }) => {
      setBoard(board);
      setCurrentTurn(currentTurn);
      setStatus(currentTurn === mySymbol ? "Your turn" : "Opponent's turn");
    });

    socket.on("gameOver", ({ result, winner, board }) => {
      setBoard(board);
      setGameOver(true);
      if (result === "draw") setStatus("Draw!");
      else setStatus(winner === mySymbol ? "You won!" : "You lost!");
    });

    socket.on("gameRestarted", ({ board, currentTurn }) => {
      setBoard(board);
      setCurrentTurn(currentTurn);
      setStatus(currentTurn === mySymbol ? "Your turn" : "Opponent's turn");
      setGameOver(false);
    });

    socket.on("opponentLeft", ({ message }) => setStatus("Opponent left the game."));
    socket.on("errorMessage", (msg) => setStatus(msg));

    return () => {
      socket.off("roomCreated");
      socket.off("yourSymbol");
      socket.off("gameStarted");
      socket.off("updateBoard");
      socket.off("gameOver");
      socket.off("gameRestarted");
      socket.off("opponentLeft");
      socket.off("errorMessage");
    };
  }, [mySymbol]);

  const handleCreate = () => socket.emit("createRoom");
  const handleJoin = () => {
    if (!roomInput) return alert("Enter room id");
    setStatus("Joining...");
    socket.emit("joinRoom", { roomId: roomInput }, (res) => {
      if (res && !res.ok) setStatus(res.error || "Could not join");
      else setRoomId(roomInput);
    });
  };

  const handleCellClick = (index) => {
    if (!roomId) return alert("Join or create a room first");
    if (!mySymbol) return alert("Symbol not assigned yet.");
    if (gameOver) return;
    if (currentTurn !== mySymbol) return;
    if (board[index]) return;
    socket.emit("makeMove", { roomId, index });
  };

  const handleRestart = () => {
    if (!roomId) return;
    socket.emit("restartGame", { roomId });
  };

  return (
    <div className="app">
      <h1>Tic Tac Toe - Online</h1>

      {!roomId ? (
        <div className="controls">
          <button onClick={handleCreate}>Create Room</button>
          <input
            value={roomInput}
            onChange={(e) => setRoomInput(e.target.value)}
            placeholder="Room ID to join"
          />
          <button onClick={handleJoin}>Join Room</button>
          <div className="status-text status-waiting">{status}</div>
        </div>
      ) : (
        <div className="dashboard">
          <div>Room: <b className="room-id">{roomId}</b></div>
          <div>Your symbol: <b>{mySymbol || "-"}</b></div>
          <div className={`status-text ${
            status.includes("Your turn") ? "status-your-turn" :
            status.includes("Opponent") ? "status-opponent-turn" :
            status.includes("won") ? "status-win" :
            status.includes("lost") ? "status-lost" :
            status.includes("Draw") ? "status-draw" :
            status.includes("Waiting") ? "status-waiting" : ""
          }`}>{status}</div>

          {gameOver && <button onClick={handleRestart}>Restart</button>}

          <div className="board">
            {board.map((cell, idx) => (
              <div
                key={idx}
                className={`cell ${cell ? "filled" : ""} ${currentTurn !== mySymbol || gameOver ? "disabled" : ""}`}
                onClick={() => handleCellClick(idx)}
              >
                {cell}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
