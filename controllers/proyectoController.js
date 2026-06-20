const { conexionDB } = require('../config/db');

// CREATE: Crear un proyecto validando duplicados sin importar mayúsculas
exports.crearProyecto = async (req, res) => {
    try {
        const { nombre, descripcion, usuario_id, emoji, color } = req.body;

        if (!nombre || nombre.trim() === "" || !usuario_id) {
            return res.status(400).json({ error: "El nombre del proyecto es obligatorio." });
        }

        const db = await conexionDB();
        
        // Validación insensible a mayúsculas y minúsculas (Case-Insensitive)
        const duplicado = await db.get(
            'SELECT id FROM proyectos WHERE LOWER(nombre) = LOWER(?) AND usuario_id = ?', 
            [nombre.trim(), usuario_id]
        );
        
        if (duplicado) {
            return res.status(400).json({ error: "Ya existe un proyecto con ese nombre (puedes estar confundiéndolo por variaciones en las mayúsculas)." });
        }

        const resultado = await db.run(
            'INSERT INTO proyectos (nombre, descripcion, usuario_id, emoji, color) VALUES (?, ?, ?, ?, ?)',
            [nombre.trim(), descripcion || '', usuario_id, emoji || '📁', color || '#3b82f6']
        );

        res.status(201).json({ id: resultado.lastID, nombre: nombre.trim(), emoji: emoji || '📁', color: color || '#3b82f6' });
    } catch (error) {
        console.error("Error al crear proyecto:", error);
        res.status(500).json({ error: "Error en el servidor al crear el proyecto." });
    }
};

// READ: Obtener todos los proyectos del usuario
exports.obtenerProyectos = async (req, res) => {
    try {
        const { usuario_id } = req.query;
        if (!usuario_id) {
            return res.status(400).json({ error: "El usuario_id es obligatorio." });
        }
        
        const db = await conexionDB();
        const proyectos = await db.all('SELECT * FROM proyectos WHERE usuario_id = ?', [usuario_id]);
        res.json(proyectos);
    } catch (error) {
        console.error("Error al obtener proyectos:", error);
        res.status(500).json({ error: "Error al obtener los proyectos." });
    }
};

// UPDATE: Modificar un proyecto existente validando duplicados en minúsculas/mayúsculas
exports.actualizarProyecto = async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, descripcion, emoji, color, usuario_id } = req.body;

        if (!nombre || nombre.trim() === "" || !usuario_id) {
            return res.status(400).json({ error: "El nombre no puede estar vacío." });
        }

        const db = await conexionDB();

        // Validar duplicado al renombrar de manera insensible a mayúsculas
        const duplicado = await db.get(
            'SELECT id FROM proyectos WHERE LOWER(nombre) = LOWER(?) AND usuario_id = ? AND id != ?', 
            [nombre.trim(), usuario_id, id]
        );
        
        if (duplicado) {
            return res.status(400).json({ error: "Ya existe otro proyecto con ese nombre." });
        }

        const resultado = await db.run(
            'UPDATE proyectos SET nombre = ?, descripcion = ?, emoji = ?, color = ? WHERE id = ?', 
            [nombre.trim(), descripcion || '', emoji || '📁', color || '#3b82f6', id]
        );

        if (resultado.changes === 0) {
            return res.status(404).json({ error: "Proyecto no encontrado." });
        }

        res.json({ mensaje: "Proyecto actualizado con éxito." });
    } catch (error) {
        console.error("Error al actualizar:", error);
        res.status(500).json({ error: "Error al actualizar el proyecto." });
    }
};

// DELETE: Eliminar un proyecto y sus tareas hijas en cascada lógica
exports.eliminarProyecto = async (req, res) => {
    try {
        const { id } = req.params;
        const db = await conexionDB();
        
        await db.run('DELETE FROM tareas WHERE proyecto_id = ?', [id]);
        const resultado = await db.run('DELETE FROM proyectos WHERE id = ?', [id]);

        if (resultado.changes === 0) {
            return res.status(404).json({ error: "Proyecto no encontrado." });
        }

        res.json({ mensaje: "Proyecto eliminado con éxito." });
    } catch (error) {
        console.error("Error al eliminar:", error);
        res.status(500).json({ error: "Error al eliminar el proyecto." });
    }
};