import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import env from "./env.js";
import { employModel } from "../models/employ.model.js";

const activeCalls = new Map();

export const setupSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization"]
    },
    transports: ['polling', 'websocket'],
    pingTimeout: 120000,
    pingInterval: 25000,
    upgradeTimeout: 30000,
    allowUpgrades: true,
    allowEIO3: true,
    cookie: false
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

      const user = await employModel.findById(decoded.id).select('-password');
      if (!user) return next(new Error('User not found'));

      console.log(`🔍 Socket user: ${user.email} | role: "${user.role}"`);

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
  // HELPER: Get real kitchen socket IDs only
  // ============================================
  const getRealKitchenSockets = (excludeSocketId = null) => {
    const kitchenRoom = io.sockets.adapter.rooms.get('kitchen');
    if (!kitchenRoom) return [];

    const realKitchen = [];
    kitchenRoom.forEach(socketId => {
      if (socketId === excludeSocketId) return;
      const memberSocket = io.sockets.sockets.get(socketId);
      if (memberSocket?.user?.role === 'kitchen') {
        realKitchen.push(socketId);
      }
    });
    return realKitchen;
  };

  // ============================================
  // CONNECTION
  // ============================================
  io.on("connection", (socket) => {
    const userRole = socket.user?.role;
    const userType = socket.user?.type;

    console.log(`🔌 Connected: ${socket.id} | ${socket.user?.email} | role: ${userRole} | type: ${userType}`);

    // AUTO-JOIN ROOMS
    if (userType === 'admin') {
      socket.join('admin');
      socket.join('role:admin');
      console.log(`✅ Admin joined rooms: admin, role:admin`);

    } else if (userRole === 'kitchen') {
      socket.join('kitchen');
      const kitchenCount = io.sockets.adapter.rooms.get('kitchen')?.size || 0;
      console.log(`✅ Kitchen joined room: kitchen | Total: ${kitchenCount}`);

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

    // ============================================
    // JOIN ROLE - with protection
    // ============================================
    socket.on("joinRole", (role) => {
      const uType = socket.user?.type;
      const uRole = socket.user?.role;

      // Block admin from joining kitchen or waiter
      if (uType === 'admin' && (role === 'kitchen' || role === 'waiter')) {
        console.log(`🚫 BLOCKED: Admin tried to join '${role}' room`);
        return;
      }

      // Block kitchen from joining waiter
      if (uRole === 'kitchen' && role === 'waiter') {
        console.log(`🚫 BLOCKED: Kitchen tried to join waiter room`);
        return;
      }

      // Block waiter from joining kitchen
      if (uRole === 'waiter' && role === 'kitchen') {
        console.log(`🚫 BLOCKED: Waiter tried to join kitchen room`);
        return;
      }

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
    // ADMIN-TO-KITCHEN CALL - FIXED
    // ============================================
    socket.on('admin:call-kitchen', (data) => {
      const { offer } = data;

      const realKitchenSocketIds = getRealKitchenSockets(socket.id);
      const realKitchenCount = realKitchenSocketIds.length;

      console.log(`📞 Admin calling kitchen...`);
      console.log(`   Total in kitchen room: ${io.sockets.adapter.rooms.get('kitchen')?.size || 0}`);
      console.log(`   Real kitchen staff: ${realKitchenCount}`);
      console.log(`   Kitchen socket IDs: ${realKitchenSocketIds.join(', ')}`);

      if (realKitchenCount === 0) {
        console.log(`❌ No real kitchen staff found`);
        socket.emit('call:error', { message: 'No kitchen staff online' });
        socket.emit('call:no-kitchen-available');
        return;
      }

      realKitchenSocketIds.forEach(kitchenSocketId => {
        io.to(kitchenSocketId).emit('kitchen:incoming-call', {
          from: socket.id,
          adminEmail: socket.user?.email,
          adminName: socket.user?.name,
          offer,
          timestamp: Date.now()
        });
      });

      console.log(`✅ Call sent to ${realKitchenCount} real kitchen staff`);
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

      const realKitchenSocketIds = getRealKitchenSockets(socket.id);
      realKitchenSocketIds.forEach(kitchenSocketId => {
        io.to(kitchenSocketId).emit('kitchen:call-ended', {
          timestamp: Date.now(),
          reason: 'admin_ended'
        });
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

    // ============================================
    // WAITER-TO-KITCHEN CALL
    // ============================================
    socket.on('waiter:call-kitchen', (data) => {
      const { offer } = data;

      const realKitchenSocketIds = getRealKitchenSockets();
      const realKitchenCount = realKitchenSocketIds.length;

      console.log(`📞 Waiter calling kitchen (${realKitchenCount} real staff online)`);

      if (realKitchenCount === 0) {
        socket.emit('waiter:call-error', { message: 'No kitchen staff online' });
        socket.emit('waiter:no-kitchen-available');
        return;
      }

      realKitchenSocketIds.forEach(kId => {
        activeCalls.set(socket.id, kId);
        activeCalls.set(kId, socket.id);
        io.to(kId).emit('kitchen:waiter-incoming-call', {
          from: socket.id,
          waiterEmail: socket.user?.email,
          waiterName: socket.user?.name,
          offer,
          timestamp: Date.now()
        });
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
    // ICE CANDIDATE
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
    // ADMIN CONTROLS
    // ============================================
    socket.on('admin:mute-kitchen', () => {
      const realKitchenSocketIds = getRealKitchenSockets(socket.id);
      realKitchenSocketIds.forEach(id => {
        io.to(id).emit('kitchen:muted', { timestamp: Date.now() });
      });
    });

    socket.on('admin:unmute-kitchen', () => {
      const realKitchenSocketIds = getRealKitchenSockets(socket.id);
      realKitchenSocketIds.forEach(id => {
        io.to(id).emit('kitchen:unmuted', { timestamp: Date.now() });
      });
    });

    socket.on('admin:toggle-kitchen-video', (data) => {
      const realKitchenSocketIds = getRealKitchenSockets(socket.id);
      realKitchenSocketIds.forEach(id => {
        io.to(id).emit('kitchen:video-toggled', {
          enabled: data?.enabled,
          timestamp: Date.now()
        });
      });
    });

    socket.on('admin:check-kitchen-availability', () => {
      const realKitchenSocketIds = getRealKitchenSockets(socket.id);
      const isAvailable = realKitchenSocketIds.length > 0;

      console.log(`🔍 Kitchen check: ${isAvailable ? 'ONLINE' : 'OFFLINE'} (${realKitchenSocketIds.length} real staff)`);

      socket.emit('kitchen:availability', {
        available: isAvailable,
        members: realKitchenSocketIds.length,
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
      io.to('role:admin').emit('employee:registered', data);
    });

    // ============================================
    // DISCONNECT
    // ============================================
    socket.on("disconnect", (reason) => {
      console.log(`🔌 Disconnected: ${socket.id} | ${reason} | ${userRole}`);

      if (userType === 'admin') {
        const realKitchenSocketIds = getRealKitchenSockets();
        realKitchenSocketIds.forEach(id => {
          io.to(id).emit('kitchen:call-ended', {
            timestamp: Date.now(),
            reason: 'admin_disconnected'
          });
        });

      } else if (userRole === 'kitchen') {
        io.to('admin').emit('kitchen:disconnected', {
          kitchenName: socket.user?.name,
          timestamp: Date.now()
        });
        io.to('role:admin').emit('kitchen:disconnected', {
          kitchenName: socket.user?.name,
          timestamp: Date.now()
        });

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
          timestamp: Date.now()
        });

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