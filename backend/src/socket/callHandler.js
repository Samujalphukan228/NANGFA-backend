export const setupCallHandler = (io, socket) => {
    // Admin calls kitchen
    socket.on('admin:call-kitchen', (data) => {
        const { offer } = data;

        // Emit to all kitchen staff
        io.to('kitchen').emit('kitchen:incoming-call', {
            from: socket.id,
            adminEmail: socket.user?.email,
            offer
        });
    });

    // Kitchen auto-answers
    socket.on('kitchen:answer-call', (data) => {
        const { to, answer } = data;

        io.to(to).emit('admin:call-answered', { answer });
    });

    // Admin ends call
    socket.on('admin:end-call', () => {
        io.to('kitchen').emit('kitchen:call-ended');
    });

    // WebRTC ICE candidates
    socket.on('ice-candidate', (data) => {
        const { to, candidate } = data;
        
        if (to) {
            io.to(to).emit('ice-candidate', {
                candidate,
                from: socket.id
            });
        }
    });

    // Admin mutes kitchen
    socket.on('admin:mute-kitchen', () => {
        io.to('kitchen').emit('kitchen:muted');
    });

    // Admin unmutes kitchen
    socket.on('admin:unmute-kitchen', () => {
        io.to('kitchen').emit('kitchen:unmuted');
    });
};