import http from "http";
import env from "./src/utils/env.js";
import app from "./app.js";
import { setupSocket } from "./src/utils/socket.utils.js";

const server = http.createServer(app);
const port = env.port;

const io = setupSocket(server);
app.set("io", io);

// Graceful shutdown
const gracefulShutdown = () => {
    server.close(() => {
        io.close(() => {
            process.exit(0);
        });
    });

    setTimeout(() => {
        process.exit(1);
    }, 30000);
};

// Handle process signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
process.on('uncaughtException', gracefulShutdown);
process.on('unhandledRejection', gracefulShutdown);

// Start server
server.listen(port, () => {
    console.log(`🚀 Server is running at port ${port}`);
    console.log(`🔌 Socket.io is ready`);
});

server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`Port ${port} is already in use`);
    }
    process.exit(1);
});