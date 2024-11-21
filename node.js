const express = require('express');
const axios = require('axios');
const http = require('http');
const socketIo = require('socket.io-client');

const app = express();
const server = http.createServer(app);

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

// Función para registrar logs
function logMessage(message) {
    const timestampedMessage = `${new Date().toISOString()} - ${message}`;
    console.log(timestampedMessage);
    logs.push(timestampedMessage);
    socket.emit('log', timestampedMessage);
}

async function realizarHealthCheck() {
    const intervalo = Math.floor(Math.random() * 5000) + 5000; // Entre 5 y 10 segundos
    setTimeout(async () => {
        if (liderId) {
            try {
                if (liderId === NODE_ID) {
                    logMessage(`El nodo ${NODE_ID} es el líder. No se realiza health check a sí mismo.`);
                } else {
                    const { data } = await axios.get(`${MONITOR_URL}/nodos`);
                    const liderActivo = data.find(nodo => nodo.id === liderId && nodo.estado === 'activo');
                    if (!liderActivo) {
                        logMessage(`Líder ${liderId} no está activo. Iniciando elección.`);
                        iniciarEleccion();
                    } else {
                        logMessage(`Health check al líder ${liderId} exitoso.`);
                    }
                }
            } catch (error) {
                logMessage(`Error en el health check del líder ${liderId}: ${error.message}.`);
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
