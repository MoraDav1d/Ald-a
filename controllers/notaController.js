const { conexionDB } = require('../config/db');

exports.crearNota = async (req, res) => {
    try {
        const { contenido, usuario_id, fecha } = req.body;
        
        if (!contenido || !usuario_id) {
            return res.status(400).json({ error: "Contenido y usuario_id son obligatorios." });
        }

        const db = await conexionDB();
        const resultado = await db.run(
            'INSERT INTO notas (contenido, usuario_id, fecha) VALUES (?, ?, ?)',
            [contenido.trim(), usuario_id, fecha || null]
        );

        res.status(201).json({ id: resultado.lastID, contenido, usuario_id, fecha });
    } catch (error) {
        console.error("Error al crear nota:", error);
        res.status(500).json({ error: "Error al crear la nota." });
    }
};

exports.obtenerNotas = async (req, res) => {
    try {
        const { usuario_id, fecha } = req.query;
        if (!usuario_id) {
            return res.status(400).json({ error: "El usuario_id es obligatorio." });
        }

        const db = await conexionDB();
        let query = 'SELECT * FROM notas WHERE usuario_id = ?';
        let params = [usuario_id];

        if (fecha) {
            query += ' AND fecha = ?';
            params.push(fecha);
        }

        const notas = await db.all(query, params);
        res.json(notas);
    } catch (error) {
        console.error("Error al obtener notas:", error);
        res.status(500).json({ error: "Error al obtener notas." });
    }
};

exports.actualizarNota = async (req, res) => {
    try {
        const { id } = req.params;
        const { contenido } = req.body;

        const db = await conexionDB();
        const resultado = await db.run(
            'UPDATE notas SET contenido = ? WHERE id = ?',
            [contenido, id]
        );

        if (resultado.changes === 0) {
            return res.status(404).json({ error: "Nota no encontrada." });
        }

        res.json({ mensaje: "Nota actualizada." });
    } catch (error) {
        console.error("Error al actualizar nota:", error);
        res.status(500).json({ error: "Error al actualizar." });
    }
};

exports.eliminarNota = async (req, res) => {
    try {
        const { id } = req.params;
        const db = await conexionDB();
        const resultado = await db.run('DELETE FROM notas WHERE id = ?', [id]);

        if (resultado.changes === 0) {
            return res.status(404).json({ error: "Nota no encontrada." });
        }

        res.json({ mensaje: "Nota eliminada." });
    } catch (error) {
        console.error("Error al eliminar nota:", error);
        res.status(500).json({ error: "Error al eliminar." });
    }
};
