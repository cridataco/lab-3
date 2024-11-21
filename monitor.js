const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const cors = require('cors');
const io = socketIo(server);

const PORT = 3000;

app.use(express.json());
app.use(cors());

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
        asignarLider(id);
    }

    io.emit('updateNodos', nodos);
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
        liderId = null;
        logMessage(`El líder ${id} ha sido detenido. Se requiere una nueva elección.`);
        io.emit('liderCaido');
    }

    io.emit('updateNodos', nodos);
    res.send(`Nodo ${id} detenido.`);
});

app.post('/marcarNodoCaido', (req, res) => {
    const { id } = req.body;
    const nodo = nodos.find(n => n.id === id);

    if (!nodo || nodo.estado === 'detenido') {
        logMessage(`Intento de marcar como caído un nodo inexistente o detenido con ID ${id}.`);
        return res.status(404).send('Nodo no encontrado o ya detenido.');
    }

    nodo.estado = 'caido';
    logMessage(`Nodo ${id} marcado como caído.`);

    if (nodo.esLider) {
        liderId = null;
        logMessage(`El líder ${id} ha caído. Se requiere una nueva elección.`);
        io.emit('liderCaido');
    }

    io.emit('updateNodos', nodos);
    res.status(200).send(`Nodo ${id} marcado como caído.`);
});

function asignarLider(id) {
    liderId = id;
    nodos.forEach(n => n.esLider = n.id === liderId);
    logMessage(`Nodo ${id} es el nuevo líder.`);
    io.emit('updateNodos', nodos);
}

app.post('/nuevoLider', (req, res) => {
    const { id } = req.body;
    asignarLider(id);
    res.send(`Líder actualizado al nodo ${id}.`);
});

app.get('/lider', (req, res) => {
    if (liderId) {
        res.json({ liderId });
    } else {
        res.status(404).send('No hay líder actual.');
    }
});

app.get('/nodos', (req, res) => {
    res.json(nodos);
});

io.on('connection', (socket) => {
    logMessage('Un cliente se ha conectado.');
    socket.emit('updateNodos', nodos);
    logs.forEach(log => socket.emit('newLog', log));

    socket.on('disconnect', () => {
        logMessage('Un cliente se ha desconectado.');
    });
});

app.use(express.static(path.join(__dirname)));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/monitor.html'));
});

// Iniciar servidor
server.listen(PORT, () => {
    logMessage(`Servidor de monitoreo escuchando en el puerto ${PORT}`);
});
