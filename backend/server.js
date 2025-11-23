import http from "http";
import env from "./src/utils/env.js";
import app from "./app.js";
import { setupSocket } from "./src/utils/socket.utils.js";

const server = http.createServer(app);
const port = env.port;


const io = setupSocket(server);
app.set("io", io);

server.listen(port, () => {
    console.log(`🚀 Server is running at port ${port}`);
    console.log(`🔌 Socket.io is ready`);
});