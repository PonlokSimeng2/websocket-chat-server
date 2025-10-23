// server.js
const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Store connected clients with metadata
const clients = new Map();

// Health check endpoint (important for deployment platforms)
app.get('/', (req, res) => {
  res.send('WebSocket Chat Server is running!');
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', clients: clients.size });
});

wss.on('connection', (ws, req) => {
  const clientId = Math.random().toString(36).substring(7);
  console.log(`Client connected: ${clientId}`);
  
  // Store client info
  clients.set(ws, {
    id: clientId,
    username: null,
    connectedAt: new Date()
  });

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'system',
    message: 'Connected to chat server',
    clientId: clientId,
    timestamp: new Date().toISOString()
  }));

  // Broadcast user count
  broadcastUserCount();

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log('Received:', message);

      // Handle different message types
      switch (message.type) {
        case 'join':
          handleJoin(ws, message);
          break;
        case 'chat':
          handleChatMessage(ws, message);
          break;
        case 'typing':
          handleTyping(ws, message);
          break;
        default:
          console.log('Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  });

  ws.on('close', () => {
    const client = clients.get(ws);
    console.log(`Client disconnected: ${client?.id}`);
    
    // Broadcast leave message
    if (client?.username) {
      broadcast({
        type: 'system',
        message: `${client.username} left the chat`,
        timestamp: new Date().toISOString()
      }, ws);
    }
    
    clients.delete(ws);
    broadcastUserCount();
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

function handleJoin(ws, message) {
  const client = clients.get(ws);
  if (client) {
    client.username = message.username || 'Anonymous';
    
    // Notify others
    broadcast({
      type: 'system',
      message: `${client.username} joined the chat`,
      timestamp: new Date().toISOString()
    }, ws);
    
    // Send confirmation to sender
    ws.send(JSON.stringify({
      type: 'joined',
      username: client.username,
      timestamp: new Date().toISOString()
    }));
  }
}

function handleChatMessage(ws, message) {
  const client = clients.get(ws);
  if (client) {
    const chatMessage = {
      type: 'chat',
      username: client.username || 'Anonymous',
      message: message.message,
      timestamp: new Date().toISOString(),
      clientId: client.id
    };
    
    // Broadcast to all clients including sender
    broadcast(chatMessage);
  }
}

function handleTyping(ws, message) {
  const client = clients.get(ws);
  if (client) {
    broadcast({
      type: 'typing',
      username: client.username,
      isTyping: message.isTyping,
      timestamp: new Date().toISOString()
    }, ws); // Don't send to sender
  }
}

function broadcast(message, excludeWs = null) {
  const messageStr = JSON.stringify(message);
  
  clients.forEach((client, ws) => {
    if (ws !== excludeWs && ws.readyState === ws.OPEN) {
      ws.send(messageStr);
    }
  });
}

function broadcastUserCount() {
  broadcast({
    type: 'user_count',
    count: clients.size,
    timestamp: new Date().toISOString()
  });
}

const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
  console.log(`WebSocket server is running on port ${PORT}`);
});