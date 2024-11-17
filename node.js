const express = require('express');
const axios = require('axios');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const NODE_ID = parseInt(process.env.NODE_ID) || 3;
const MONITOR_URL = 'http://localhost:3000'; 
const PORT = 4000 + NODE_ID; 

let logs = []; 
let liderId = null; 
let esLider = false; 
let enProcesoDeEleccion = false; 

function logMessage(message) {
    const timestampedMessage = `${new Date().toISOString()} - ${message}`;
    console.log(timestampedMessage);
    logs.push(timestampedMessage);
    io.emit('log', timestampedMessage); 
}

async function realizarHealthCheck() {
    const intervalo = Math.floor(Math.random() * 5000) + 5000; // Entre 5 y 10 segundos
    setTimeout(async () => {
        if (liderId && liderId !== NODE_ID) {
            try {
                await axios.get(`${MONITOR_URL}/healthCheckLider`);
                logMessage(`Health check al líder con ID ${liderId} exitoso.`);
                io.emit('healthCheck', { liderId, status: 'exitoso' });
            } catch (error) {
                logMessage(`Health check fallido al líder con ID ${liderId}. Iniciando elección.`);
                io.emit('healthCheck', { liderId, status: 'fallido' });
                iniciarEleccion(); // Iniciar elección si el líder no responde
            }
        }
        realizarHealthCheck(); // Reiniciar el health check con otro intervalo aleatorio
    }, intervalo);
}

async function iniciarEleccion() {
    if (enProcesoDeEleccion) return;
    enProcesoDeEleccion = true;
    logMessage(`Nodo ${NODE_ID} inicia una elección.`);
    io.emit('eleccion', `Nodo ${NODE_ID} inicia una elección.`);

    const nodosMayores = [];

    try {
        const response = await axios.get(`${MONITOR_URL}/nodos`);
        nodosMayores.push(...response.data.filter(nodo => nodo.id > NODE_ID && nodo.estado === 'activo'));
    } catch (error) {
        logMessage(`Error al obtener nodos del monitor: ${error.message}`);
        enProcesoDeEleccion = false;
        return;
    }

    if (nodosMayores.length === 0) {
        declararseLider(); // No hay nodos mayores activos; el nodo se declara líder.
    } else {
        let respuestas = 0;
        for (const nodo of nodosMayores) {
            try {
                await axios.post(`http://localhost:${4000 + nodo.id}/eleccion`, { id: NODE_ID });
                respuestas++;
                logMessage(`Nodo ${NODE_ID} recibió respuesta de elección del nodo ${nodo.id}.`);
            } catch (error) {
                logMessage(`Nodo ${nodo.id} no respondió a la solicitud de elección.`);
            }
        }

        // Si no recibe respuestas, se declara líder
        if (respuestas === 0) {
            declararseLider();
        }
    }
    enProcesoDeEleccion = false;
}

async function declararseLider() {
    liderId = NODE_ID;
    esLider = true;
    logMessage(`Nodo ${NODE_ID} se declara como líder.`);
    io.emit('nuevoLider', NODE_ID);

    try {
        await axios.post(`${MONITOR_URL}/nuevoLider`, { id: NODE_ID });
        logMessage(`Nodo ${NODE_ID} notifica al monitor que es el nuevo líder.`);
    } catch (error) {
        logMessage(`Error al notificar al monitor del nuevo líder: ${error.message}`);
    }
}

// Endpoint para manejar solicitudes de elección
app.post('/eleccion', (req, res) => {
    const { id } = req.body;
    logMessage(`Nodo ${NODE_ID} recibió solicitud de elección de nodo ${id}.`);
    res.sendStatus(200);
});

app.get('/logs', (req, res) => {
    res.json({ logs });
});

// Endpoint para obtener el estado del nodo
app.get('/estado', (req, res) => {
    res.json({ esLider, liderId });
});

app.use(express.static('public'));

// Iniciar el nodo y registrarlo en el monitor
async function iniciarNodo() {
    try {
        await axios.post(`${MONITOR_URL}/agregarNodo`, { id: NODE_ID });
        logMessage(`Nodo ${NODE_ID} registrado en el monitor.`);
        
        const respuesta = await axios.get(`${MONITOR_URL}/lider`);
        liderId = respuesta.data.liderId;
        esLider = liderId === NODE_ID;
        logMessage(`Líder actual es el nodo ${liderId}.`);

        realizarHealthCheck();
    } catch (error) {
        logMessage(`Error al registrar nodo ${NODE_ID}: ${error.message}`);
    }
}

server.listen(PORT, () => {
    logMessage(`Nodo ${NODE_ID} escuchando en el puerto ${PORT}`);
    iniciarNodo();
});
