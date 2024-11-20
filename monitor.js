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

// Función para registrar logs con timestamp
function logMessage(message) {
    const timestampedMessage = `${new Date().toISOString()} - ${message}`;
    console.log(timestampedMessage);
    logs.push(timestampedMessage);
    io.emit('newLog', timestampedMessage); // Enviar log a los clientes conectados
}

app.get('/logs', (req, res) => {
    res.json({ logs });
});

// Agregar un nuevo nodo
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

    io.emit('updateNodos', nodos);
    res.status(201).send(`Nodo ${id} agregado exitosamente.`);
});

// Notificar un nuevo líder
app.post('/nuevoLider', (req, res) => {
    const { id } = req.body;
    const nodo = nodos.find(n => n.id === id);
    if (!nodo) {
        logMessage(`Intento de declarar líder un nodo inexistente con ID ${id}.`);
        return res.status(404).send('Nodo no encontrado.');
    }
    liderId = id;
    nodos.forEach(n => (n.esLider = n.id === liderId));
    logMessage(`Nodo ${id} se ha declarado como el nuevo líder.`);
    io.emit('updateNodos', nodos);
    res.send(`Líder actualizado al nodo ${id}.`);
});

// Obtener líder actual
app.get('/lider', (req, res) => {
    if (liderId) {
        res.json({ liderId });
    } else {
        res.status(404).send('No hay líder actual.');
    }
});

// Obtener nodos
app.get('/nodos', (req, res) => {
    res.json(nodos);
});

// Endpoint de health check para el líder
app.get('/healthCheckLider', (req, res) => {
    if (liderId) {
        res.send(`Líder ${liderId} está activo.`);
    } else {
        res.status(404).send('No hay líder actual.');
    }
});

io.on('connection', (socket) => {
    socket.emit('updateNodos', nodos);
    logs.forEach(log => socket.emit('newLog', log));
});

server.listen(PORT, () => {
    logMessage(`Servidor de monitoreo escuchando en el puerto ${PORT}`);
});

app.use(express.static(path.join(__dirname)));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/monitor.html'));
});
