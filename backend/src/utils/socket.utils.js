import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import env from "./env.js";
import { employModel } from "../models/employ.model.js";

// Tracks active calls: socketId -> peerSocketId
const activeCalls = new Map();

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
      if (!token) return next(new Error('No token provided'));

      const decoded = jwt.verify(token, env.jwtSecret);
      if (!decoded?.id) return next(new Error('Bad token'));

      // ✅ FIXED: Check both id and email for admin
      if (decoded.id === 'admin' || decoded.email === env.adminEmail) {
        socket.user = {
          id: 'admin',
          email: decoded.email || env.adminEmail,
          role: 'admin',
          isApproved: true,
          name: 'Admin',
          type: 'admin'
        };
        console.log('✅ Admin authenticated via socket');
        return next();
      }

      // Employee
      const user = await employModel.findById(decoded.id).select('-password');
      if (!user) return next(new Error('User not found'));

      // ✅ This log tells you exactly what role is coming from DB
      console.log(`🔍 Socket user from DB: ${user.email} | role: "${user.role}"`);

      socket.user = {
        id: user._id.toString(),
        email: user.email,
        role: user.role,
        isApproved: user.isAproved,
        name: user.name,
        type: 'employee'
      };

      console.log(`✅ Employee authenticated: ${user.email} [${user.role}]`);
      next();
    } catch (err) {
      console.error('❌ Socket auth error:', err.message);
      next(new Error('Authentication failed'));
    }
  });

  // ============================================
  // CONNECTION
  // ============================================
  io.on("connection", (socket) => {
    const userRole = socket.user?.role;
    const userType = socket.user?.type;

    console.log(`🔌 Connected: ${socket.id} | ${socket.user?.email} | role: ${userRole} | type: ${userType}`);

    // ✅ AUTO-JOIN ROOMS
    if (userType === 'admin') {
      socket.join('admin');
      socket.join('role:admin');
      console.log(`✅ Admin joined rooms: admin, role:admin`);

    } else if (userRole === 'kitchen') {
      socket.join('kitchen');
      console.log(`✅ Kitchen staff joined room: kitchen | Total: ${io.sockets.adapter.rooms.get('kitchen')?.size}`);

      // Tell admin kitchen is online
      io.to('admin').emit('kitchen:online', {
        socketId: socket.id,
        name: socket.user?.name,
        email: socket.user?.email,
        timestamp: Date.now()
      });

    } else if (userRole === 'waiter') {
      socket.join('waiter');
      console.log(`✅ Waiter joined room: waiter`);
    }

    // Manual join (optional fallback)
    socket.on("joinRole", (role) => {
      socket.join(role);
      console.log(`✅ Manual joinRole: ${socket.id} joined ${role}`);
      socket.emit('room:joined', {
        room: role,
        members: io.sockets.adapter.rooms.get(role)?.size || 0
      });
    });

    socket.on("joinTable", (tableNumber) => {
      if (tableNumber) {
        socket.join(`table:${tableNumber}`);
      }
    });

    // ============================================
    // ADMIN-TO-KITCHEN CALL EVENTS
    // ============================================

    socket.on('admin:call-kitchen', (data) => {
      const { offer } = data;

      const kitchenRoom = io.sockets.adapter.rooms.get('kitchen');
      const kitchenMembers = kitchenRoom ? kitchenRoom.size : 0;

      // ✅ This log tells you if kitchen is in the room
      console.log(`📞 Admin calling kitchen...`);
      console.log(`   Kitchen room size: ${kitchenMembers}`);

      if (kitchenMembers === 0) {
        console.log(`❌ Call failed: No kitchen staff in room`);
        socket.emit('call:error', { message: 'No kitchen staff online' });
        socket.emit('call:no-kitchen-available');
        return;
      }

      console.log(`✅ Sending call to ${kitchenMembers} kitchen staff`);

      io.to('kitchen').emit('kitchen:incoming-call', {
        from: socket.id,
        adminEmail: socket.user?.email,
        adminName: socket.user?.name,
        offer,
        timestamp: Date.now()
      });
    });

    socket.on('kitchen:answer-call', (data) => {
      const { to, answer } = data;
      console.log(`📞 Kitchen answering admin call to ${to}`);
      io.to(to).emit('admin:call-answered', {
        answer,
        kitchenName: socket.user?.name,
        kitchenEmail: socket.user?.email,
        from: socket.id,
        timestamp: Date.now()
      });
    });

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

    socket.on('kitchen:end-call', (data) => {
      const { to } = data || {};
      console.log(`📞 Kitchen ended admin call`);
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

    // ============================================
    // WAITER-TO-KITCHEN CALL EVENTS
    // ============================================

    socket.on('waiter:call-kitchen', (data) => {
      const { offer } = data;
      const kitchenRoom = io.sockets.adapter.rooms.get('kitchen');
      const kitchenMembers = kitchenRoom ? kitchenRoom.size : 0;

      console.log(`📞 Waiter calling kitchen (${kitchenMembers} staff online)`);

      if (kitchenMembers === 0) {
        socket.emit('waiter:call-error', { message: 'No kitchen staff online' });
        socket.emit('waiter:no-kitchen-available');
        return;
      }

      // Track active call
      const kitchenSocketIds = Array.from(kitchenRoom);
      kitchenSocketIds.forEach(kId => {
        activeCalls.set(socket.id, kId);
        activeCalls.set(kId, socket.id);
      });

      io.to('kitchen').emit('kitchen:waiter-incoming-call', {
        from: socket.id,
        waiterEmail: socket.user?.email,
        waiterName: socket.user?.name,
        offer,
        timestamp: Date.now()
      });
    });

    socket.on('kitchen:answer-waiter-call', (data) => {
      const { to, answer } = data;
      console.log(`📞 Kitchen answering waiter call to ${to}`);
      activeCalls.set(socket.id, to);
      activeCalls.set(to, socket.id);
      io.to(to).emit('waiter:call-answered', {
        answer,
        kitchenName: socket.user?.name,
        from: socket.id,
        timestamp: Date.now()
      });
    });

    socket.on('waiter:end-call', (data) => {
      const { to } = data || {};
      console.log(`📞 Waiter ended call`);
      if (to) {
        io.to(to).emit('kitchen:waiter-call-ended', { 
          timestamp: Date.now(), 
          reason: 'waiter_ended' 
        });
        activeCalls.delete(to);
      }
      activeCalls.delete(socket.id);
    });

    socket.on('kitchen:end-waiter-call', (data) => {
      const { to } = data || {};
      console.log(`📞 Kitchen ended waiter call`);
      if (to) {
        io.to(to).emit('waiter:call-ended', { 
          timestamp: Date.now(), 
          reason: 'kitchen_ended' 
        });
        activeCalls.delete(to);
      }
      activeCalls.delete(socket.id);
    });

    // ============================================
    // SHARED ICE CANDIDATE
    // ============================================

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

    // ============================================
    // ADMIN CALL CONTROLS
    // ============================================

    socket.on('admin:mute-kitchen', () => {
      io.to('kitchen').emit('kitchen:muted', { timestamp: Date.now() });
    });

    socket.on('admin:unmute-kitchen', () => {
      io.to('kitchen').emit('kitchen:unmuted', { timestamp: Date.now() });
    });

    socket.on('admin:toggle-kitchen-video', (data) => {
      const { enabled } = data;
      io.to('kitchen').emit('kitchen:video-toggled', { 
        enabled, 
        timestamp: Date.now() 
      });
    });

    socket.on('admin:check-kitchen-availability', () => {
      const kitchenRoom = io.sockets.adapter.rooms.get('kitchen');
      const isAvailable = kitchenRoom && kitchenRoom.size > 0;
      console.log(`🔍 Kitchen availability check: ${isAvailable ? 'ONLINE' : 'OFFLINE'} (${kitchenRoom?.size || 0} members)`);
      socket.emit('kitchen:availability', {
        available: isAvailable,
        members: kitchenRoom ? kitchenRoom.size : 0,
        timestamp: Date.now()
      });
    });

    socket.on('get:rooms-info', () => {
      const rooms = {};
      io.sockets.adapter.rooms.forEach((sockets, roomName) => {
        if (!roomName.includes('-')) rooms[roomName] = sockets.size;
      });
      socket.emit('rooms:info', { rooms, timestamp: Date.now() });
    });

    socket.on('employee:registered', (data) => {
      console.log(`👤 New employee registered:`, data.email);
      io.to('role:admin').emit('employee:registered', data);
    });

    // ============================================
    // DISCONNECT
    // ============================================
    socket.on("disconnect", (reason) => {
      console.log(`🔌 Disconnected: ${socket.id} | reason: ${reason} | role: ${userRole}`);

      if (userType === 'admin') {
        io.to('kitchen').emit('kitchen:call-ended', { 
          timestamp: Date.now(), 
          reason: 'admin_disconnected' 
        });

      } else if (userRole === 'kitchen') {
        // Tell admin kitchen went offline
        io.to('admin').emit('kitchen:disconnected', {
          kitchenName: socket.user?.name,
          kitchenEmail: socket.user?.email,
          timestamp: Date.now()
        });
        io.to('role:admin').emit('kitchen:disconnected', {
          kitchenName: socket.user?.name,
          kitchenEmail: socket.user?.email,
          timestamp: Date.now()
        });

        // Notify peer waiter if in a call
        const peerSocketId = activeCalls.get(socket.id);
        if (peerSocketId) {
          io.to(peerSocketId).emit('waiter:call-ended', {
            timestamp: Date.now(),
            reason: 'kitchen_disconnected'
          });
          activeCalls.delete(peerSocketId);
          activeCalls.delete(socket.id);
        }

      } else if (userRole === 'waiter') {
        io.to('admin').emit('waiter:disconnected', {
          waiterName: socket.user?.name,
          waiterEmail: socket.user?.email,
          timestamp: Date.now()
        });

        // Notify peer kitchen if in a call
        const peerSocketId = activeCalls.get(socket.id);
        if (peerSocketId) {
          io.to(peerSocketId).emit('kitchen:waiter-call-ended', {
            timestamp: Date.now(),
            reason: 'waiter_disconnected'
          });
          activeCalls.delete(peerSocketId);
          activeCalls.delete(socket.id);
        }
      }
    });

    socket.on('error', (error) => {
      console.error('❌ Socket error:', error);
    });
  });

  // Helper methods
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