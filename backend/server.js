const net = require('net');

// Configuration
const PORT = process.env.PORT || process.argv[2] || 4000;
const IDLE_TIMEOUT = 60000; // 60 seconds in milliseconds

// Store connected users: { username: { socket, lastActivity, disconnecting } }
const users = new Map();

// Helper function to send message to a specific socket
function sendToSocket(socket, message) {
  try {
    if (!socket.destroyed) {
      socket.write(message + '\n');
    }
  } catch (error) {
    console.error('Error sending message:', error.message);
  }
}

// Broadcast message to all connected users
function broadcast(message, excludeSocket = null) {
  users.forEach(({ socket }) => {
    if (socket !== excludeSocket && !socket.destroyed) {
      sendToSocket(socket, message);
    }
  });
}

// Broadcast to all users including sender
function broadcastToAll(message) {
  users.forEach(({ socket }) => {
    if (!socket.destroyed) {
      sendToSocket(socket, message);
    }
  });
}

// Get username by socket
function getUsernameBySocket(socket) {
  for (const [username, data] of users.entries()) {
    if (data.socket === socket) {
      return username;
    }
  }
  return null;
}

// Update user's last activity timestamp
function updateActivity(socket) {
  const username = getUsernameBySocket(socket);
  if (username && users.has(username)) {
    users.get(username).lastActivity = Date.now();
  }
}

// Handle client disconnection - FIXED to always remove user
function handleDisconnect(socket, reason = 'unknown') {
  const username = getUsernameBySocket(socket);
  
  if (username) {
    const userData = users.get(username);
    
    // Prevent duplicate disconnect handling
    if (userData && userData.disconnecting) {
      return;
    }
    
    // Mark as disconnecting
    if (userData) {
      userData.disconnecting = true;
    }
    
    // Remove user from map IMMEDIATELY
    users.delete(username);
    
    // Notify others
    broadcast(`INFO ${username} disconnected`);
    console.log(`User disconnected: ${username} (reason: ${reason})`);
    console.log(`Active users: ${users.size}`);
  }
  
  // Ensure socket is destroyed
  if (!socket.destroyed) {
    try {
      socket.destroy();
    } catch (error) {
      console.error('Error destroying socket:', error.message);
    }
  }
}

// Parse and handle incoming commands
function handleCommand(socket, data) {
  const message = data.toString().trim();
  
  if (!message) return;

  updateActivity(socket);

  const username = getUsernameBySocket(socket);
  const parts = message.split(' ');
  const command = parts[0].toUpperCase();

  // LOGIN command - must be first command
  if (command === 'LOGIN') {
    if (username) {
      sendToSocket(socket, 'ERR already-logged-in');
      return;
    }

    const newUsername = parts.slice(1).join(' ').trim();
    
    if (!newUsername) {
      sendToSocket(socket, 'ERR invalid-username');
      return;
    }

    // Check if username is taken
    if (users.has(newUsername)) {
      sendToSocket(socket, 'ERR username-taken');
      console.log(`Login failed: Username "${newUsername}" already taken`);
      return;
    }

    // Add new user
    users.set(newUsername, { 
      socket, 
      lastActivity: Date.now(),
      disconnecting: false
    });
    sendToSocket(socket, 'OK');
    console.log(`User logged in: ${newUsername} (Total users: ${users.size})`);
    return;
  }

  // All other commands require login
  if (!username) {
    sendToSocket(socket, 'ERR not-logged-in');
    return;
  }

  // MSG command - broadcast message to all users
  if (command === 'MSG') {
    const text = parts.slice(1).join(' ').trim();
    
    if (!text) {
      sendToSocket(socket, 'ERR empty-message');
      return;
    }

    broadcastToAll(`MSG ${username} ${text}`);
    return;
  }

  // WHO command - list all active users
  if (command === 'WHO') {
    if (users.size === 0) {
      sendToSocket(socket, 'INFO no-users-online');
      return;
    }
    
    users.forEach((_, user) => {
      sendToSocket(socket, `USER ${user}`);
    });
    return;
  }

  // DM command - send private message
  if (command === 'DM') {
    if (parts.length < 3) {
      sendToSocket(socket, 'ERR invalid-dm-format');
      return;
    }

    const targetUsername = parts[1];
    const text = parts.slice(2).join(' ').trim();

    if (!text) {
      sendToSocket(socket, 'ERR empty-message');
      return;
    }

    if (!users.has(targetUsername)) {
      sendToSocket(socket, 'ERR user-not-found');
      return;
    }

    const targetData = users.get(targetUsername);
    if (targetData.socket.destroyed) {
      sendToSocket(socket, 'ERR user-not-found');
      return;
    }

    sendToSocket(targetData.socket, `DM ${username} ${text}`);
    sendToSocket(socket, `DM-SENT ${targetUsername}`);
    return;
  }

  // PING command - heartbeat
  if (command === 'PING') {
    sendToSocket(socket, 'PONG');
    return;
  }

  // Unknown command
  sendToSocket(socket, 'ERR unknown-command');
}

// Check for idle users and disconnect them
function checkIdleUsers() {
  const now = Date.now();
  const usersToDisconnect = [];

  users.forEach((data, username) => {
    if (now - data.lastActivity > IDLE_TIMEOUT && !data.disconnecting) {
      usersToDisconnect.push({ username, socket: data.socket });
    }
  });

  usersToDisconnect.forEach(({ username, socket }) => {
    console.log(`Disconnecting idle user: ${username}`);
    sendToSocket(socket, 'INFO disconnected-due-to-inactivity');
    handleDisconnect(socket, 'idle-timeout');
  });
}

// Start idle timeout checker (runs every 10 seconds)
setInterval(checkIdleUsers, 10000);

// Create TCP server
const server = net.createServer((socket) => {
  console.log(`New connection from: ${socket.remoteAddress}:${socket.remotePort}`);

  // Set encoding for text data
  socket.setEncoding('utf8');
  
  // Keep connection alive
  socket.setKeepAlive(true, 30000);

  // Handle incoming data
  socket.on('data', (data) => {
    // Handle multiple commands in one data chunk (split by newlines)
    const commands = data.toString().split('\n');
    commands.forEach(cmd => {
      if (cmd.trim()) {
        handleCommand(socket, cmd);
      }
    });
  });

  // Handle client disconnect (graceful)
  socket.on('end', () => {
    handleDisconnect(socket, 'client-end');
  });

  // Handle socket close
  socket.on('close', (hadError) => {
    handleDisconnect(socket, hadError ? 'close-with-error' : 'close-normal');
  });

  // Handle errors
  socket.on('error', (error) => {
    console.error('Socket error:', error.message);
    handleDisconnect(socket, 'socket-error');
  });

  // Handle timeout
  socket.on('timeout', () => {
    console.log('Socket timeout');
    handleDisconnect(socket, 'timeout');
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`=================================`);
  console.log(`Chat Server is running on port ${PORT}`);
  console.log(`Connect using: nc localhost ${PORT}`);
  console.log(`Or: telnet localhost ${PORT}`);
  console.log(`=================================`);
});

// Handle server errors
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Error: Port ${PORT} is already in use`);
    console.error(`Try a different port: node server.js <port>`);
  } else {
    console.error('Server error:', error.message);
  }
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n=================================');
  console.log('Shutting down server...');
  console.log(`Disconnecting ${users.size} user(s)...`);
  console.log('=================================');
  
  broadcast('INFO server-shutting-down');
  
  // Close all connections
  users.forEach(({ socket }) => {
    try {
      socket.destroy();
    } catch (error) {
      // Ignore errors during shutdown
    }
  });
  
  users.clear();
  
  server.close(() => {
    console.log('Server closed successfully');
    process.exit(0);
  });
  
  // Force exit after 5 seconds if server doesn't close
  setTimeout(() => {
    console.log('Forcing shutdown...');
    process.exit(0);
  }, 5000);
});