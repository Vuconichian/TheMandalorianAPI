const express = require('express');
const redis = require('redis');
const path = require('path');

const app = express();
const PORT = 4000;

// Crear cliente Redis
const client = redis.createClient();
client.connect();

const ALQUILER_TEMPORESERVA = 4 * 60; // 4 minutos en segundos

const capitulos = [
  'Chapter 1: The Mandalorian',
  'Chapter 2: The Child',
  'Chapter 3: The Sin',
  "Chapter 4: Sanctuary",
  "Chapter 5: The Gunslinger",
  "Chapter 6: The Prisoner",
  "Chapter 7: The Reckoning",
  "Chapter 8: Redemption",

  // Temporada 2
  "Chapter 9: The Marshal",
  "Chapter 10: The Passenger",
  "Chapter 11: The Heiress",
  "Chapter 12: The Siege",
  "Chapter 13: The Jedi",
  "Chapter 14: The Tragedy",
  "Chapter 15: The Believer",
  "Chapter 16: The Rescue",

  // Temporada 3
  "Chapter 17: The Apostate",
  "Chapter 18: The Mines of Mandalore",
  "Chapter 19: The Convert",
  "Chapter 20: The Foundling",
  "Chapter 21: The Pirate",
  "Chapter 22: Guns for Hire",
  "Chapter 23: The Spies",
  "Chapter 24: The Return",
];

app.use(express.static('public'));
app.use(express.json());

// Página principal
app.get('/', async (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/pago', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pago.html'));
});


// Obtener lista de capítulos
app.get('/capitulos', async (req, res) => {
  const lista = [];

  for (const cap of capitulos) {
    const key = `mandalorian:capitulo:${cap}`;
    const exists = await client.exists(key);

    if (!exists) {
      await client.hSet(key, {
        nombre: cap,
        estado: 'disponible',
      });
    }

    const capituloData = await client.hGetAll(key);
    lista.push({
      nombre: capituloData.nombre,
      estado: capituloData.estado
    });
  }

  res.json(lista);
});


// Alquilar capítulo
app.post('/alquilar', async (req, res) => {
  const { capitulo } = req.body;
  const key = `mandalorian:capitulo:${capitulo}`;

  const estado = await client.hGet(key, 'estado');
  if (estado === 'disponible') {
    await client.hSet(key, 'estado', 'alquilado');
    res.json({ exito: true });
  } else {
    res.json({ exito: false, mensaje: 'Capítulo no disponible' });
  }
});


app.post('/alquilar/:nombre', async (req, res) => {
    const capitulo = decodeURIComponent(req.params.nombre);
    const capKey = `mandalorian:capitulo:${capitulo}`;
    console.log(`Alquilando capítulo con clave: ${capKey}`);

    try {
        const capituloData = await client.hGetAll(capKey);

        if (!capituloData || !capituloData.nombre) {
            return res.status(404).json({ mensaje: 'Capítulo no encontrado' });
        }

        if (capituloData.estado !== 'disponible') {
            return res.status(400).json({ mensaje: 'Capítulo no disponible para alquilar.' });
        }

        // Primero, reservamos el capítulo por 4 minutos
        await client.hSet(capKey, 'estado', 'reservado');
        await client.setex(`${capKey}:reservado`, ALQUILER_TEMPORESERVA, 'reservado');

        res.json({ mensaje: `Capítulo ${capitulo} reservado por 4 minutos. Esperando confirmación de pago.` });

        // Después de 4 minutos, verificamos si el pago no se realizó y revertimos la reserva
        setTimeout(async () => {
            const estado = await client.hGet(capKey, 'estado');
            if (estado === 'reservado') {
                await client.hSet(capKey, 'estado', 'disponible');
                console.log(`Reserva expiró para el capítulo ${capitulo}, volvió a disponible.`);
            }
        }, ALQUILER_TEMPORESERVA * 1000);

    } catch (error) {
        console.error('Error al alquilar capítulo:', error);
        res.status(500).json({ mensaje: 'Hubo un problema al procesar el alquiler.' });
    }
});


// Devolver capítulo
app.post('/devolver', async (req, res) => {
  const { capitulo } = req.body;
  const key = `mandalorian:capitulo:${capitulo}`;

  try {
    const estado = await client.hGet(key, 'estado');

    if (estado === 'alquilado') {
      await client.hSet(key, 'estado', 'disponible');
      res.json({ exito: true });
    } else {
      res.json({ exito: false, mensaje: 'Capítulo no está alquilado' });
    }
  } catch (err) {
    console.error('Error al devolver capítulo:', err);
    res.status(500).json({ exito: false, mensaje: 'Error interno del servidor' });
  }
});


// Confirmar pago
app.post('/confirmar/:nombre', async (req, res) => {
  const capitulo = decodeURIComponent(req.params.nombre);
  const key = `mandalorian:capitulo:${capitulo}`;

  const estado = await client.hGet(key, 'estado');
  if (estado === 'reservado') {
    await client.hSet(key, 'estado', 'alquilado');
    res.json({ mensaje: 'Pago confirmado.' });
  } else {
    res.status(400).json({ mensaje: 'No se puede confirmar, no está reservado.' });
  }
});

// Cancelar reserva
app.post('/cancelar/:nombre', async (req, res) => {
  const capitulo = decodeURIComponent(req.params.nombre);
  const key = `mandalorian:capitulo:${capitulo}`;

  const estado = await client.hGet(key, 'estado');
  if (estado === 'reservado') {
    await client.hSet(key, 'estado', 'disponible');
  }
  res.json({ mensaje: 'Reserva cancelada.' });
});


app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
