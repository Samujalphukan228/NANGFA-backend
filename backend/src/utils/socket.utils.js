import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import env from "./env.js";
import { employModel } from "../models/employ.model.js";
import { adminModel } from "../models/admin.model.js";

export const setupSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: "*",  // ✅ Allow all origins (development only!)
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
      
      console.log('🔐 Socket auth - Token:', token ? 'Received' : 'Missing');

      if (!token) {
        return next(new Error('No token provided'));
      }

      const decoded = jwt.verify(token, env.jwtSecret);
      console.log('✅ Token verified:', decoded.id);

      let user = await employModel.findById(decoded.id).select('-password');
      let userType = 'employee';
      
      if (!user) {
        user = await adminModel.findById(decoded.id).select('-password');
        userType = 'admin';
      }

      if (!user) {
        return next(new Error('User not found'));
      }

      socket.user = {
        id: user._id.toString(),
        email: user.email,
        role: user.role || userType,
        isApproved: user.isAproved !== undefined ? user.isAproved : true,
        name: user.name || user.email.split('@')[0],
        type: userType
      };

      console.log('✅ Socket user:', socket.user.email, socket.user.role, socket.user.type);
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
    console.log('🟢 Socket connected:', socket.id);
    console.log('👤 User:', socket.user?.email, '| Role:', socket.user?.role, '| Type:', socket.user?.type);
    console.log('📊 Total connections:', io.engine.clientsCount);

    // ============================================
    // JOIN ROLE ROOM
    // ============================================
    socket.on("joinRole", (role) => {
      socket.join(role);
      console.log(`👥 Socket ${socket.id} (${socket.user?.email}) joined room: "${role}"`);
      console.log(`📊 Room "${role}" members:`, io.sockets.adapter.rooms.get(role)?.size || 0);
      
      // Emit room info back to socket
      socket.emit('room:joined', {
        room: role,
        members: io.sockets.adapter.rooms.get(role)?.size || 0
      });
    });

    // Auto-join based on user type
    if (socket.user?.type === 'admin') {
      socket.join('role:admin');
      socket.join('admin'); // ✅ Also join 'admin' room for consistency
      console.log(`🔐 Auto-joined admin to role:admin and admin rooms`);
    } else if (socket.user?.role === 'kitchen') {
      socket.join('kitchen');
      console.log(`👨‍🍳 Auto-joined kitchen staff to kitchen room`);
    }

    // ============================================
    // JOIN TABLE ROOM
    // ============================================
    socket.on("joinTable", (tableNumber) => {
      if (tableNumber) {
        socket.join(`table:${tableNumber}`);
        console.log(`🪑 Socket ${socket.id} joined table ${tableNumber}`);
      }
    });

    // ============================================
    // ADMIN-TO-KITCHEN CALL EVENTS
    // ============================================

    // Admin calls kitchen
    socket.on('admin:call-kitchen', (data) => {
      const { offer } = data;
      console.log(`📞 Admin (${socket.user?.email}) calling kitchen`);
      console.log('📡 Offer SDP length:', offer?.sdp?.length || 0);

      // Get kitchen room info
      const kitchenRoom = io.sockets.adapter.rooms.get('kitchen');
      const kitchenMembers = kitchenRoom ? kitchenRoom.size : 0;
      
      console.log(`👨‍🍳 Kitchen room has ${kitchenMembers} member(s)`);

      if (kitchenMembers === 0) {
        socket.emit('call:error', { 
          message: 'No kitchen staff online' 
        });
        socket.emit('call:no-kitchen-available');
        console.log('⚠️ No kitchen staff online');
        return;
      }

      // Emit to all kitchen staff
      io.to('kitchen').emit('kitchen:incoming-call', {
        from: socket.id,
        adminEmail: socket.user?.email,
        adminName: socket.user?.name,
        offer,
        timestamp: Date.now()
      });

      console.log('✅ Call signal sent to kitchen room');
    });

    // Kitchen auto-answers
    socket.on('kitchen:answer-call', (data) => {
      const { to, answer } = data;
      console.log(`✅ Kitchen (${socket.user?.email}) answered call to ${to}`);
      console.log('📡 Answer SDP length:', answer?.sdp?.length || 0);

      // Send answer back to admin
      io.to(to).emit('admin:call-answered', { 
        answer,
        kitchenName: socket.user?.name,
        kitchenEmail: socket.user?.email,
        from: socket.id,
        timestamp: Date.now()
      });

      console.log('✅ Answer sent to admin socket:', to);
    });

    // Admin ends call
    socket.on('admin:end-call', (data) => {
      const { to } = data || {};
      console.log(`📴 Admin (${socket.user?.email}) ended call`);

      // Notify all kitchen staff
      io.to('kitchen').emit('kitchen:call-ended', {
        timestamp: Date.now(),
        reason: 'admin_ended'
      });

      // Also notify specific socket if provided
      if (to) {
        io.to(to).emit('kitchen:call-ended', {
          timestamp: Date.now(),
          reason: 'admin_ended'
        });
      }

      console.log('✅ End call signal sent to kitchen');
    });

    // Kitchen ends call (if needed)
    socket.on('kitchen:end-call', (data) => {
      const { to } = data || {};
      console.log(`📴 Kitchen (${socket.user?.email}) ended call`);

      if (to) {
        io.to(to).emit('admin:call-ended', {
          timestamp: Date.now(),
          reason: 'kitchen_ended'
        });
      }

      // Also notify admin room
      io.to('admin').emit('kitchen:call-ended', {
        timestamp: Date.now(),
        reason: 'kitchen_ended',
        kitchenName: socket.user?.name
      });

      console.log('✅ Kitchen end call signal sent');
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
        console.log(`🧊 ICE candidate: ${socket.id} → ${to}`);
      } else {
        console.log('⚠️ Invalid ICE candidate data:', { to, hasCandidate: !!candidate });
      }
    });

    // Admin mutes kitchen microphone
    socket.on('admin:mute-kitchen', () => {
      console.log(`🔇 Admin (${socket.user?.email}) muted kitchen`);
      
      io.to('kitchen').emit('kitchen:muted', {
        timestamp: Date.now()
      });
    });

    // Admin unmutes kitchen microphone
    socket.on('admin:unmute-kitchen', () => {
      console.log(`🔊 Admin (${socket.user?.email}) unmuted kitchen`);
      
      io.to('kitchen').emit('kitchen:unmuted', {
        timestamp: Date.now()
      });
    });

    // Admin toggles kitchen video
    socket.on('admin:toggle-kitchen-video', (data) => {
      const { enabled } = data;
      console.log(`📹 Admin ${enabled ? 'enabled' : 'disabled'} kitchen video`);
      
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

      console.log(`🔍 Kitchen availability check: ${isAvailable} (${kitchenRoom?.size || 0} members)`);
    });

    // Get active rooms info
    socket.on('get:rooms-info', () => {
      const rooms = {};
      io.sockets.adapter.rooms.forEach((sockets, roomName) => {
        // Only include named rooms, not socket IDs
        if (!roomName.includes('-')) {
          rooms[roomName] = sockets.size;
        }
      });

      socket.emit('rooms:info', {
        rooms,
        timestamp: Date.now()
      });

      console.log('📋 Rooms info requested:', rooms);
    });

    // ============================================
    // EXISTING EVENTS (Your other features)
    // ============================================

    // Employee registration notification (keep existing)
    socket.on('employee:registered', (data) => {
      io.to('role:admin').emit('employee:registered', data);
      console.log('✅ Employee registration notification sent');
    });

    // ============================================
    // DISCONNECT HANDLER
    // ============================================
    socket.on("disconnect", (reason) => {
      console.log('🔴 Socket disconnected:', socket.id);
      console.log('👤 User:', socket.user?.email);
      console.log('📝 Reason:', reason);
      
      // If user was in a call, notify the other party
      if (socket.user?.type === 'admin') {
        io.to('kitchen').emit('kitchen:call-ended', {
          timestamp: Date.now(),
          reason: 'admin_disconnected'
        });
        console.log('✅ Notified kitchen of admin disconnect');
      } else if (socket.user?.role === 'kitchen') {
        // Optionally notify admins
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
        console.log('✅ Notified admins of kitchen disconnect');
      }

      console.log('📊 Remaining connections:', io.engine.clientsCount);
    });

    // ============================================
    // ERROR HANDLER
    // ============================================
    socket.on('error', (error) => {
      console.error('❌ Socket error:', socket.id, error);
    });
  });

  // ============================================
  // HELPER FUNCTIONS
  // ============================================

  // Get all sockets in a room
  io.getRoomSockets = (roomName) => {
    const room = io.sockets.adapter.rooms.get(roomName);
    return room ? Array.from(room) : [];
  };

  // Check if room has any members
  io.isRoomEmpty = (roomName) => {
    const room = io.sockets.adapter.rooms.get(roomName);
    return !room || room.size === 0;
  };

  // Get room member count
  io.getRoomMemberCount = (roomName) => {
    const room = io.sockets.adapter.rooms.get(roomName);
    return room ? room.size : 0;
  };

  // Broadcast to room with sender info
  io.broadcastToRoom = (roomName, event, data, senderSocket = null) => {
    if (senderSocket) {
      senderSocket.to(roomName).emit(event, data);
    } else {
      io.to(roomName).emit(event, data);
    }
  };

  console.log('');
  console.log('╔═══════════════════════════════════════╗');
  console.log('║   🔌 Socket.IO Initialized            ║');
  console.log('║   📞 Call Support: Enabled            ║');
  console.log('║   🔐 Authentication: Required         ║');
  console.log('╚═══════════════════════════════════════╝');
  console.log('');
  
  return io;
};