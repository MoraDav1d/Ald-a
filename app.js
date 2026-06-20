const express = require('express');
const path = require('path');
// 1. Importamos la función para inicializar la DB
const { inicializarDB } = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const proyectoRoutes = require('./routes/proyectoRoutes');
const tareaRoutes = require('./routes/tareaRoutes');
const notaRoutes = require('./routes/notaRoutes');
const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// 2. Inicializar la Base de Datos al arrancar el servidor
inicializarDB().catch(err => {
    console.error("❌ Error crítico al inicializar la base de datos:", err);
});

// Ruta de prueba
app.get('/api/ping', (req, res) => {
    res.json({ mensaje: "¡AlDía Backend reportándose con éxito" });
});

// Rutas API
app.use('/api/auth', authRoutes);
app.use('/api/proyectos', proyectoRoutes);
app.use('/api/tareas', tareaRoutes);
app.use('/api/notas', notaRoutes);

// Encender el servidor
app.listen(PORT, () => {
    console.log(`=================================================`);
    console.log(`🚀 Servidor corriendo en: http://localhost:${PORT}`);
    console.log(`=================================================`);
});