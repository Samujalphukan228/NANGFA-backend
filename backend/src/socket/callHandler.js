export const setupCallHandler = (io, socket) => {
    console.log('📞 Call handler initialized for:', socket.user?.email);

    // Admin calls kitchen
    socket.on('admin:call-kitchen', (data) => {
        const { offer } = data;
        console.log('📞 Admin calling kitchen');

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
        console.log('✅ Kitchen answered call');

        io.to(to).emit('admin:call-answered', { answer });
    });

    // Admin ends call
    socket.on('admin:end-call', () => {
        console.log('📴 Admin ended call');

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
        console.log('🔇 Admin muted kitchen');
        
        io.to('kitchen').emit('kitchen:muted');
    });

    // Admin unmutes kitchen
    socket.on('admin:unmute-kitchen', () => {
        console.log('🔊 Admin unmuted kitchen');
        
        io.to('kitchen').emit('kitchen:unmuted');
    });
};