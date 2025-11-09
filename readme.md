Simple TCP Chat Server

A lightweight multi-user chat server built using Node.js and the built-in net module.

It allows users to connect, log in, and chat with each other in real time over TCP - no frameworks or
databases used.

Features
- Multiple client connections (5-10 users)
- User login system (LOGIN <username>)
- Real-time messaging (MSG <text>)
- Private messages (DM <username> <text>)
- List of active users (WHO)
- Idle timeout (auto disconnect after 60s)
- Heartbeat support (PING -> PONG)
- Graceful disconnect and server shutdown

Installation
1. Make sure Node.js is installed.
2. Clone or download this repository.
3. Run the server:
 node server.js
 (Optionally specify a port: node server.js (specify port no here ))
 Default port: 4000

Usage
Connect Using Netcat (nc)
Open two terminals and connect as different users.

Client 1:
 nc localhost 4000
 LOGIN sunny
 MSG hello everyone

Client 2:
 nc localhost 4000
 LOGIN naman
 MSG hey sunny

Output:
 MSG sunny hello everyone
 MSG naman hey sunny

When a user disconnects:
 INFO sunny disconnected

Supported Commands
LOGIN <username> - Log in with a username
MSG <text> - Send message to all users
DM <username> <text> - Send private message
WHO - List all active users
PING - Responds with PONG
(auto) - Disconnects idle users after 60 seconds

Demo video : 

Notes
- Uses TCP sockets, not WebSockets or HTTP.
- No external dependencies.
- Works with nc or telnet.