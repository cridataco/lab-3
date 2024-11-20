const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = 3000;

app.use(express.json());

let nodos = [];
let liderId = null;
let logs = [];

function logMessage(message) {
    const timestampedMessage = `${new Date().toISOString()} - ${message}`;
    console.log(timestampedMessage);
    logs.push(timestampedMessage);
    io.emit('newLog', timestampedMessage);
}

app.get('/logs', (req, res) => {
    res.json({ logs });
});

app.post('/agregarNodo', (req, res) => {
    const { id } = req.body;
    if (nodos.find(nodo => nodo.id === id)) {
        logMessage(`Intento de agregar un nodo con ID existente ${id}.`);
        return res.status(400).send('El nodo con este ID ya existe.');
    }
    const nuevoNodo = { id, estado: 'activo', esLider: false };
    nodos.push(nuevoNodo);
    logMessage(`Nodo ${id} agregado al sistema.`);

    if (nodos.length === 1) {
        nuevoNodo.esLider = true;
        liderId = id;
        logMessage(`Nodo ${id} es el único en la red y se ha convertido en el líder.`);
    }

    io.emit('updateNodos', nodos); // Emitir actualización de nodos
    res.status(201).send(`Nodo ${id} agregado exitosamente.`);
});

app.post('/detenerNodo', (req, res) => {
    const { id } = req.body;
    const nodo = nodos.find(n => n.id === id);
    if (!nodo) {
        logMessage(`Intento de detener un nodo inexistente con ID ${id}.`);
        return res.status(404).send('Nodo no encontrado.');
    }
    if (nodo.estado === 'detenido') {
        logMessage(`Nodo ${id} ya estaba detenido.`);
        return res.status(400).send('El nodo ya está detenido.');
    }
    nodo.estado = 'detenido';
    logMessage(`Nodo ${id} detenido.`);

    if (nodo.esLider) {
        nodo.esLider = false;
        liderId = null;
        logMessage(`El nodo ${id} era el líder y ha sido detenido. Se requiere una nueva elección.`);
    }

    io.emit('updateNodos', nodos);
    res.send(`Nodo ${id} detenido.`);
});

app.get('/lider', (req, res) => {
    if (liderId) {
        res.json({ liderId });
    } else {
        res.status(404).send('No hay líder actual.');
    }
});

// Emitir nodos y logs al conectar
io.on('connection', (socket) => {
    socket.emit('updateNodos', nodos);
    logs.forEach(log => socket.emit('newLog', log));
});

server.listen(PORT, () => {
    logMessage(`Servidor de monitoreo escuchando en el puerto ${PORT}`);
});

app.get('/nodos', (req, res) => {
    res.json(nodos);
});

app.use(express.static(path.join(__dirname)));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/monitor.html'));
});
