const express = require('express');
const axios = require('axios');
const http = require('http');
const socketIo = require('socket.io-client');
const path = require('path');
const { log } = require('console');

const app = express();
const server = http.createServer(app);
const io = require('socket.io')(server);
const cors = require('cors');

app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
  }));

const NODE_ID = parseInt(process.env.NODE_ID) || 2;
const MONITOR_URL = 'http://localhost:3000';
const PORT = 4000 + NODE_ID;

let logs = [];
let liderId = null;
let esLider = false;
let enProcesoDeEleccion = false;

const socket = socketIo(MONITOR_URL);

socket.on('connect', () => {
    logMessage(`Nodo ${NODE_ID} conectado al monitor`);
});

socket.on('updateNodos', (nodos) => {
    console.log(`Nodo ${NODE_ID} recibió actualización de nodos:`, nodos);
    liderId = nodos.find(nodo => nodo.esLider)?.id || null;
    logMessage(`Líder actual reportado por el monitor: Nodo ${liderId}.`);
});

function logMessage(message) {
    const timestampedMessage = `${new Date().toISOString()} - ${message}`;
    console.log(timestampedMessage);
    logs.push(timestampedMessage);
    io.emit('otherLog', timestampedMessage); 
}

async function realizarHealthCheck() {
    const intervalo = Math.floor(Math.random() * 5000) + 5000; 
    setTimeout(async () => {
        if (liderId) {
            try {
                if (liderId === NODE_ID) {
                    logMessage(`El nodo ${NODE_ID} es el líder. No realiza health check a sí mismo.`);
                } else {
                    await axios.get(`http://localhost:${4000 + liderId}/health`);
                    logMessage(`Health check al líder ${liderId} exitoso.`);
                }
            } catch (error) {
                logMessage(`El líder ${liderId} no respondió al health check: ${error.message}`);
                try {
                    await axios.post(`${MONITOR_URL}/marcarNodoCaido`, { id: liderId });
                    logMessage(`Se notificó al monitor que el líder ${liderId} está caído.`);
                } catch (monitorError) {
                    logMessage(`Error al notificar al monitor sobre el líder caído: ${monitorError.message}`);
                }
                iniciarEleccion();
            }
        }
        realizarHealthCheck(); 
    }, intervalo);
}


async function iniciarEleccion() {
    if (enProcesoDeEleccion) return;
    enProcesoDeEleccion = true;
    logMessage(`Nodo ${NODE_ID} inicia una elección.`);

    const nodosMayores = [];
    try {
        const { data } = await axios.get(`${MONITOR_URL}/nodos`);
        nodosMayores.push(...data.filter(nodo => nodo.id > NODE_ID && nodo.estado === 'activo'));
    } catch (error) {
        logMessage(`Error al obtener nodos del monitor: ${error.message}`);
        enProcesoDeEleccion = false;
        return;
    }

    if (nodosMayores.length === 0) {
        declararseLider();
    } else {
        for (const nodo of nodosMayores) {
            try {
                await axios.post(`http://localhost:${4000 + nodo.id}/eleccion`, { id: NODE_ID });
                logMessage(`Nodo ${NODE_ID} recibió respuesta de elección del nodo ${nodo.id}.`);
            } catch {
                logMessage(`Nodo ${nodo.id} no respondió a la solicitud de elección.`);
            }
        }
    }
    enProcesoDeEleccion = false;
}

async function declararseLider() {
    liderId = NODE_ID;
    esLider = true;
    logMessage(`Nodo ${NODE_ID} se declara como líder.`);
    try {
        await axios.post(`${MONITOR_URL}/nuevoLider`, { id: NODE_ID });
    } catch (error) {
        logMessage(`Error al notificar al monitor del nuevo líder: ${error.message}`);
    }
}

app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

io.on('connection', (socket) => { 
    logs.forEach(log => socket.emit('otherLog', log));
});


app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

server.listen(PORT, async () => {
    logMessage(`Nodo ${NODE_ID} escuchando en el puerto ${PORT}`);
    try {
        await axios.post(`${MONITOR_URL}/agregarNodo`, { id: NODE_ID });
        const { data } = await axios.get(`${MONITOR_URL}/nodos`);
        liderId = data.find(nodo => nodo.esLider)?.id || null;
        logMessage(`Líder actual es el nodo ${liderId}.`);
        realizarHealthCheck();
    } catch (error) {
        logMessage(`Error al iniciar nodo: ${error.message}`);
    }
});
