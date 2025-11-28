import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import env from "./env.js";
import { employModel } from "../models/employ.model.js";

export const setupSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST", "PUT", "DELETE"],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000
  });

  // ============================================
  // AUTHENTICATION MIDDLEWARE
  // ============================================
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;

      if (!token) {
        return next(new Error('No token provided'));
      }

      const decoded = jwt.verify(token, env.jwtSecret);

      // Handle admin (env-based, no database)
      if (decoded.id === 'admin') {
        socket.user = {
          id: 'admin',
          email: decoded.email || env.adminEmail,
          role: 'admin',
          isApproved: true,
          name: 'Admin',
          type: 'admin'
        };
        console.log('✅ Admin authenticated via JWT');
        return next();
      }

      // Handle employees (database)
      const user = await employModel.findById(decoded.id).select('-password');
      
      if (!user) {
        return next(new Error('User not found'));
      }

      socket.user = {
        id: user._id.toString(),
        email: user.email,
        role: user.role || 'employee',
        isApproved: user.isAproved !== undefined ? user.isAproved : true,
        name: user.name || user.email.split('@')[0],
        type: 'employee'
      };

      console.log('✅ Employee authenticated:', user.email);
      next();
    } catch (err) {
      console.error('❌ Socket auth error:', err.message);
      next(new Error('Authentication failed'));
    }
  });

  // ============================================
  // CONNECTION HANDLER
  // ============================================
  io.on("connection", (socket) => {
    console.log("🔌 Client connected:", socket.id, `[${socket.user?.type}]`);

    // ============================================
    // JOIN ROLE ROOM
    // ============================================
    socket.on("joinRole", (role) => {
      socket.join(role);
      console.log(`✅ Socket ${socket.id} joined room: ${role}`);
      
      socket.emit('room:joined', {
        room: role,
        members: io.sockets.adapter.rooms.get(role)?.size || 0
      });
    });

    // Auto-join based on user type
    if (socket.user?.type === 'admin') {
      socket.join('role:admin');
      socket.join('admin');
      console.log(`✅ Admin auto-joined rooms: role:admin, admin`);
    } else if (socket.user?.role === 'kitchen') {
      socket.join('kitchen');
      console.log(`✅ Kitchen staff auto-joined room: kitchen`);
    }

    // ============================================
    // JOIN TABLE ROOM
    // ============================================
    socket.on("joinTable", (tableNumber) => {
      if (tableNumber) {
        socket.join(`table:${tableNumber}`);
        console.log(`✅ Socket ${socket.id} joined table:${tableNumber}`);
      }
    });

    // ============================================
    // ADMIN-TO-KITCHEN CALL EVENTS
    // ============================================

    // Admin calls kitchen
    socket.on('admin:call-kitchen', (data) => {
      const { offer } = data;

      const kitchenRoom = io.sockets.adapter.rooms.get('kitchen');
      const kitchenMembers = kitchenRoom ? kitchenRoom.size : 0;

      console.log(`📞 Admin calling kitchen (${kitchenMembers} staff online)`);

      if (kitchenMembers === 0) {
        socket.emit('call:error', { 
          message: 'No kitchen staff online' 
        });
        socket.emit('call:no-kitchen-available');
        return;
      }

      io.to('kitchen').emit('kitchen:incoming-call', {
        from: socket.id,
        adminEmail: socket.user?.email,
        adminName: socket.user?.name,
        offer,
        timestamp: Date.now()
      });

      console.log(`📞 Call sent to kitchen room`);
    });

    // Kitchen auto-answers
    socket.on('kitchen:answer-call', (data) => {
      const { to, answer } = data;

      console.log(`📞 Kitchen answering call to socket ${to}`);

      io.to(to).emit('admin:call-answered', { 
        answer,
        kitchenName: socket.user?.name,
        kitchenEmail: socket.user?.email,
        from: socket.id,
        timestamp: Date.now()
      });
    });

    // Admin ends call
    socket.on('admin:end-call', (data) => {
      const { to } = data || {};

      console.log(`📞 Admin ended call`);

      io.to('kitchen').emit('kitchen:call-ended', {
        timestamp: Date.now(),
        reason: 'admin_ended'
      });

      if (to) {
        io.to(to).emit('kitchen:call-ended', {
          timestamp: Date.now(),
          reason: 'admin_ended'
        });
      }
    });

    // Kitchen ends call
    socket.on('kitchen:end-call', (data) => {
      const { to } = data || {};

      console.log(`📞 Kitchen ended call`);

      if (to) {
        io.to(to).emit('admin:call-ended', {
          timestamp: Date.now(),
          reason: 'kitchen_ended'
        });
      }

      io.to('admin').emit('kitchen:call-ended', {
        timestamp: Date.now(),
        reason: 'kitchen_ended',
        kitchenName: socket.user?.name
      });
    });

    // WebRTC ICE candidate exchange
    socket.on('ice-candidate', (data) => {
      const { to, candidate } = data;
      
      if (to && candidate) {
        io.to(to).emit('ice-candidate', {
          candidate,
          from: socket.id,
          timestamp: Date.now()
        });
      }
    });

    // Admin mutes kitchen microphone
    socket.on('admin:mute-kitchen', () => {
      console.log(`🔇 Admin muting kitchen`);
      io.to('kitchen').emit('kitchen:muted', {
        timestamp: Date.now()
      });
    });

    // Admin unmutes kitchen microphone
    socket.on('admin:unmute-kitchen', () => {
      console.log(`🔊 Admin unmuting kitchen`);
      io.to('kitchen').emit('kitchen:unmuted', {
        timestamp: Date.now()
      });
    });

    // Admin toggles kitchen video
    socket.on('admin:toggle-kitchen-video', (data) => {
      const { enabled } = data;
      
      console.log(`📹 Admin toggled kitchen video: ${enabled ? 'ON' : 'OFF'}`);
      
      io.to('kitchen').emit('kitchen:video-toggled', { 
        enabled,
        timestamp: Date.now()
      });
    });

    // Check kitchen availability
    socket.on('admin:check-kitchen-availability', () => {
      const kitchenRoom = io.sockets.adapter.rooms.get('kitchen');
      const isAvailable = kitchenRoom && kitchenRoom.size > 0;
      
      socket.emit('kitchen:availability', {
        available: isAvailable,
        members: kitchenRoom ? kitchenRoom.size : 0,
        timestamp: Date.now()
      });

      console.log(`🔍 Kitchen availability check: ${isAvailable ? 'Available' : 'Unavailable'}`);
    });

    // Get active rooms info
    socket.on('get:rooms-info', () => {
      const rooms = {};
      io.sockets.adapter.rooms.forEach((sockets, roomName) => {
        if (!roomName.includes('-')) {
          rooms[roomName] = sockets.size;
        }
      });

      socket.emit('rooms:info', {
        rooms,
        timestamp: Date.now()
      });

      console.log(`📋 Rooms info requested:`, rooms);
    });

    // ============================================
    // EMPLOYEE REGISTRATION EVENT
    // ============================================
    socket.on('employee:registered', (data) => {
      console.log(`👤 New employee registered:`, data.email);
      io.to('role:admin').emit('employee:registered', data);
    });

    // ============================================
    // DISCONNECT HANDLER
    // ============================================
    socket.on("disconnect", (reason) => {
      console.log(`🔌 Client disconnected: ${socket.id} (${reason})`);

      if (socket.user?.type === 'admin') {
        io.to('kitchen').emit('kitchen:call-ended', {
          timestamp: Date.now(),
          reason: 'admin_disconnected'
        });
      } else if (socket.user?.role === 'kitchen') {
        io.to('role:admin').emit('kitchen:disconnected', {
          kitchenName: socket.user?.name,
          kitchenEmail: socket.user?.email,
          timestamp: Date.now()
        });
        io.to('admin').emit('kitchen:disconnected', {
          kitchenName: socket.user?.name,
          kitchenEmail: socket.user?.email,
          timestamp: Date.now()
        });
      }
    });

    // ============================================
    // ERROR HANDLER
    // ============================================
    socket.on('error', (error) => {
      console.error('❌ Socket error:', error);
    });
  });

  // ============================================
  // HELPER FUNCTIONS
  // ============================================

  io.getRoomSockets = (roomName) => {
    const room = io.sockets.adapter.rooms.get(roomName);
    return room ? Array.from(room) : [];
  };

  io.isRoomEmpty = (roomName) => {
    const room = io.sockets.adapter.rooms.get(roomName);
    return !room || room.size === 0;
  };

  io.getRoomMemberCount = (roomName) => {
    const room = io.sockets.adapter.rooms.get(roomName);
    return room ? room.size : 0;
  };

  io.broadcastToRoom = (roomName, event, data, senderSocket = null) => {
    if (senderSocket) {
      senderSocket.to(roomName).emit(event, data);
    } else {
      io.to(roomName).emit(event, data);
    }
  };
  
  return io;
};