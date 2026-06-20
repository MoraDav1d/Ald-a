const express = require('express');
const router = express.Router();
const { conexionDB } = require('../config/db');
const crypto = require('crypto');

// Helper para hashing de contraseñas con crypto nativo
function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return `${salt}:${hash}`;
}

// Helper para verificar contraseñas con soporte de retrocompatibilidad
function verifyPassword(password, storedValue) {
    if (!storedValue) return false;
    if (!storedValue.includes(':')) {
        // Soporte para contraseñas antiguas guardadas en texto plano
        return password === storedValue;
    }
    const [salt, originalHash] = storedValue.split(':');
    const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return hash === originalHash;
}

// Registro de usuario
router.post('/register', async (req, res) => {
    try {
        const { nombre, email, password } = req.body;
        
        if (!nombre || !email || !password) {
            return res.status(400).json({ error: "Todos los campos son obligatorios" });
        }

        const db = await conexionDB();
        
        // Comprobar si el email ya existe
        const usuarioExistente = await db.get("SELECT * FROM usuarios WHERE email = ?", [email]);
        if (usuarioExistente) {
            return res.status(400).json({ error: "El email ya está registrado" });
        }

        // Insertar usuario con contraseña hasheada
        const hashedPassword = hashPassword(password);
        const result = await db.run(
            "INSERT INTO usuarios (nombre, email, password) VALUES (?, ?, ?)",
            [nombre, email, hashedPassword]
        );
        
        res.status(201).json({ id: result.lastID, nombre, email });
    } catch (error) {
        console.error("Error en registro:", error);
        res.status(500).json({ error: "Error en el servidor al registrar usuario" });
    }
});

// Login de usuario
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: "Email y contraseña requeridos" });
        }

        const db = await conexionDB();
        
        // Buscar por email
        const usuario = await db.get("SELECT * FROM usuarios WHERE email = ?", [email]);
        
        // Verificar existencia y comparar contraseña (sea texto plano o hash)
        if (!usuario || !verifyPassword(password, usuario.password)) {
            return res.status(401).json({ error: "Credenciales inválidas" });
        }

        res.json({ id: usuario.id, nombre: usuario.nombre, email: usuario.email });
    } catch (error) {
        console.error("Error en login:", error);
        res.status(500).json({ error: "Error en el servidor al iniciar sesión" });
    }
});

// Recuperar contraseña - generar token temporal
router.post('/forgot', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email requerido' });
        const db = await conexionDB();
        const usuario = await db.get('SELECT * FROM usuarios WHERE email = ?', [email]);
        if (!usuario) return res.status(200).json({ ok: true }); // No revelar existencia

        const crypto = require('crypto');
        const token = crypto.randomBytes(20).toString('hex');
        const expires = Date.now() + 3600 * 1000; // 1 hora

        await db.run('UPDATE usuarios SET reset_token = ?, reset_expires = ? WHERE id = ?', [token, expires, usuario.id]);

        // NOTE: En un entorno real enviaríamos el token por email.
        console.log(`Password reset token for ${email}: ${token}`);

        res.json({ ok: true, message: 'Si el correo existe, recibirás instrucciones para recuperar tu contraseña.' });
    } catch (error) {
        console.error('Error en forgot:', error);
        res.status(500).json({ error: 'Error interno' });
    }
});

// Resetear contraseña usando token
router.post('/reset', async (req, res) => {
    try {
        const { token, password } = req.body;
        if (!token || !password) return res.status(400).json({ error: 'Token y nueva contraseña requeridos' });
        const db = await conexionDB();
        const usuario = await db.get('SELECT * FROM usuarios WHERE reset_token = ? AND reset_expires > ?', [token, Date.now()]);
        if (!usuario) return res.status(400).json({ error: 'Token inválido o expirado' });

        const hashedPassword = hashPassword(password);
        await db.run('UPDATE usuarios SET password = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?', [hashedPassword, usuario.id]);
        res.json({ ok: true, message: 'Contraseña actualizada' });
    } catch (error) {
        console.error('Error en reset:', error);
        res.status(500).json({ error: 'Error interno' });
    }
});

// Obtener datos de usuario
router.get('/user/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const db = await conexionDB();
        const usuario = await db.get('SELECT id, nombre, email, avatar FROM usuarios WHERE id = ?', [id]);
        if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });
        res.json(usuario);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error interno' });
    }
});

// Actualizar usuario (nombre, email, password, avatar)
router.put('/user/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const { nombre, email, password, avatar } = req.body;
        const db = await conexionDB();
        const usuario = await db.get('SELECT * FROM usuarios WHERE id = ?', [id]);
        if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

        const nuevoNombre = nombre !== undefined ? nombre : usuario.nombre;
        const nuevoEmail = email !== undefined ? email : usuario.email;
        
        let nuevaPassword = usuario.password;
        if (password !== undefined && password !== '') {
            nuevaPassword = hashPassword(password);
        }
        
        const nuevoAvatar = avatar !== undefined ? avatar : usuario.avatar;

        // Si cambian email, validamos duplicados
        if (nuevoEmail !== usuario.email) {
            const exist = await db.get('SELECT id FROM usuarios WHERE email = ?', [nuevoEmail]);
            if (exist && exist.id !== usuario.id) return res.status(400).json({ error: 'El correo ya está en uso' });
        }

        await db.run('UPDATE usuarios SET nombre = ?, email = ?, password = ?, avatar = ? WHERE id = ?', [nuevoNombre, nuevoEmail, nuevaPassword, nuevoAvatar, id]);
        res.json({ ok: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error interno' });
    }
});

module.exports = router;

