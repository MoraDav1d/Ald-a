const { conexionDB } = require('../config/db');

// ===============================================================================
// CONTROLADOR DE TAREAS
// ===============================================================================

exports.crearTarea = async (req, res) => {
    try {
        // 🆕 Añadimos recordatorio_minutos al recibir los datos del frontend, además de subtareas opcionales
        const { titulo, proyecto_id, usuario_id, fecha, estado, hora, prioridad, notas, descripcion, recordatorio_minutos, subtareas } = req.body;
        
        if (!titulo || !usuario_id) {
            return res.status(400).json({ error: "Título y usuario_id son obligatorios." });
        }

        const db = await conexionDB();

        let nuevoOrden = 1;
        if (fecha) {
            const maxOrden = await db.get(
                'SELECT MAX(orden) as max_ord FROM tareas WHERE usuario_id = ? AND fecha = ?', 
                [usuario_id, fecha]
            );
            if (maxOrden && maxOrden.max_ord) {
                nuevoOrden = maxOrden.max_ord + 1;
            }
        }

        const resultado = await db.run(
            `INSERT INTO tareas (
                titulo, proyecto_id, usuario_id, fecha, estado, hora, prioridad, notas, descripcion, recordatorio_minutos, orden
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                titulo.trim(), 
                proyecto_id || null, 
                usuario_id, 
                fecha || null, 
                estado || 'pendiente', 
                hora || null, 
                prioridad || 3, 
                notas || null, 
                descripcion || null,
                recordatorio_minutos !== undefined ? recordatorio_minutos : -1, // -1 significa sin recordatorio
                nuevoOrden
            ]
        );

        const tareaId = resultado.lastID;

        // Insertar subtareas si se proporcionan en el registro de la actividad
        if (subtareas && Array.isArray(subtareas)) {
            for (const sub of subtareas) {
                const desc = typeof sub === 'string' ? sub : sub.descripcion;
                if (desc && desc.trim()) {
                    await db.run(
                        'INSERT INTO subtareas (tarea_id, descripcion) VALUES (?, ?)',
                        [tareaId, desc.trim()]
                    );
                }
            }
        }

        // Obtener subtareas recién creadas para incluirlas en la respuesta
        const subtareasCreadas = await db.all('SELECT * FROM subtareas WHERE tarea_id = ?', [tareaId]);

        res.status(201).json({ 
            id: tareaId, titulo, proyecto_id, usuario_id, fecha, 
            estado: estado || 'pendiente', hora, prioridad: prioridad || 3, notas, descripcion,
            recordatorio_minutos: recordatorio_minutos !== undefined ? recordatorio_minutos : -1,
            subtareas: subtareasCreadas
        });
    } catch (error) {
        console.error("Error al crear tarea:", error);
        res.status(500).json({ error: "Error al crear la tarea." });
    }
};

exports.obtenerTareas = async (req, res) => {
    try {
        const { usuario_id, fecha } = req.query;
        if (!usuario_id) {
            return res.status(400).json({ error: "El usuario_id es obligatorio." });
        }

        const db = await conexionDB();
        const hoyStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD local

        let query = 'SELECT * FROM tareas WHERE usuario_id = ?';
        let params = [usuario_id];

        // LÓGICA DE FILTRADO PROFESIONAL
        if (fecha) {
            if (fecha === hoyStr) {
                // ⚠️ SI ES HOY: Traer tareas programadas para hoy Ó tareas del pasado que NO estén completadas (Vencidas)
                query += ' AND (fecha = ? OR (fecha < ? AND estado != "completada"))';
                params.push(fecha, hoyStr);
            } else {
                // SI ES OTRO DÍA: Traer estrictamente las tareas de esa fecha específica
                query += ' AND fecha = ?';
                params.push(fecha);
            }
        }

        // Ordenamos por fecha, orden personalizado, y hora para mantener la consistencia visual
        query += ' ORDER BY fecha ASC, orden ASC, hora ASC, id ASC';

        const tareas = await db.all(query, params);

        // Buscar las subtareas correspondientes para cada tarea encontrada
        for (let i = 0; i < tareas.length; i++) {
            const subtareas = await db.all('SELECT * FROM subtareas WHERE tarea_id = ?', [tareas[i].id]);
            tareas[i].subtareas = subtareas;
        }

        res.json(tareas);
    } catch (error) {
        console.error("Error al obtener tareas:", error);
        res.status(500).json({ error: "Error al obtener tareas." });
    }
};

exports.actualizarTarea = async (req, res) => {
    try {
        const { id } = req.params;
        const { titulo, proyecto_id, fecha, estado, hora, prioridad, notas, descripcion, recordatorio_minutos } = req.body;

        const db = await conexionDB();

        const tareaActual = await db.get('SELECT * FROM tareas WHERE id = ?', [id]);
        if (!tareaActual) {
            return res.status(404).json({ error: "Tarea no encontrada." });
        }

        const nuevoTitulo = titulo !== undefined ? titulo.trim() : tareaActual.titulo;
        const nuevoProyectoId = proyecto_id !== undefined ? (proyecto_id || null) : tareaActual.proyecto_id;
        const nuevaFecha = fecha !== undefined ? (fecha || null) : tareaActual.fecha;
        const nuevoEstado = estado !== undefined ? estado : tareaActual.estado;
        const nuevaHora = hora !== undefined ? (hora || null) : tareaActual.hora;
        const nuevaPrioridad = prioridad !== undefined ? prioridad : tareaActual.prioridad;
        const nuevasNotas = notas !== undefined ? (notas || null) : tareaActual.notas;
        const nuevaDescripcion = descripcion !== undefined ? (descripcion || null) : tareaActual.descripcion;
        const nuevoRecordatorioMinutos = recordatorio_minutos !== undefined ? recordatorio_minutos : tareaActual.recordatorio_minutos;

        let nuevoNotificado = tareaActual.notificado;
        if (nuevaHora !== tareaActual.hora || nuevaFecha !== tareaActual.fecha) {
            nuevoNotificado = 0;
        }

        let nuevoOrden = tareaActual.orden;
        if (fecha !== undefined && fecha !== tareaActual.fecha) {
            if (fecha) {
                const maxOrden = await db.get(
                    'SELECT MAX(orden) as max_ord FROM tareas WHERE usuario_id = ? AND fecha = ?', 
                    [tareaActual.usuario_id, fecha]
                );
                nuevoOrden = (maxOrden && maxOrden.max_ord) ? maxOrden.max_ord + 1 : 1;
            } else {
                nuevoOrden = 0;
            }
        }

        const resultado = await db.run(
            `UPDATE tareas SET 
                titulo = ?, 
                proyecto_id = ?, 
                fecha = ?, 
                estado = ?, 
                hora = ?, 
                prioridad = ?, 
                notas = ?, 
                descripcion = ?, 
                recordatorio_minutos = ?,
                notificado = ?,
                orden = ?
            WHERE id = ?`,
            [
                nuevoTitulo,
                nuevoProyectoId,
                nuevaFecha,
                nuevoEstado,
                nuevaHora,
                nuevaPrioridad,
                nuevasNotas,
                nuevaDescripcion,
                nuevoRecordatorioMinutos,
                nuevoNotificado,
                nuevoOrden,
                id
            ]
        );

        if (resultado.changes === 0) {
            return res.status(404).json({ error: "Tarea no encontrada." });
        }

        res.json({ mensaje: "Tarea actualizada." });
    } catch (error) {
        console.error("Error al actualizar tarea:", error);
        res.status(500).json({ error: "Error al actualizar." });
    }
};

exports.eliminarTarea = async (req, res) => {
    try {
        const { id } = req.params;
        const db = await conexionDB();
        const resultado = await db.run('DELETE FROM tareas WHERE id = ?', [id]);

        if (resultado.changes === 0) {
            return res.status(404).json({ error: "Tarea no encontrada." });
        }

        res.json({ mensaje: "Tarea eliminada." });
    } catch (error) {
        console.error("Error al eliminar tarea:", error);
        res.status(500).json({ error: "Error al eliminar." });
    }
};

// 🆕 ENDPOINT CRUCIAL PARA LAS NOTIFICACIONES EN TIEMPO REAL
exports.obtenerRecordatorios = async (req, res) => {
    try {
        const { usuario_id, offset } = req.query;
        if (!usuario_id) {
            return res.status(400).json({ error: "El usuario_id es obligatorio." });
        }

        const db = await conexionDB();
        
        // Traer tareas que tengan recordatorio activo (>= 0), con hora pautada y no notificadas
        const tareas = await db.all(`
            SELECT id, titulo, fecha, hora, recordatorio_minutos 
            FROM tareas 
            WHERE usuario_id = ? 
              AND estado != 'completada' 
              AND notificado = 0 
              AND recordatorio_minutos >= 0
              AND hora IS NOT NULL 
              AND fecha IS NOT NULL
        `, [usuario_id]);

        const ahoraUtc = Date.now();
        // Obtener el offset en minutos y convertirlo a milisegundos.
        // getTimezoneOffset() del navegador retorna minutos (positivo al oeste de UTC, negativo al este).
        const clientOffsetMs = (offset ? parseInt(offset, 10) : 0) * 60 * 1000;
        const alertasAEnviar = [];

        for (const tarea of tareas) {
            // Parsear la fecha local como UTC plano (agregando 'Z' para forzar parsing UTC)
            const tiempoTareaUtc = Date.parse(`${tarea.fecha}T${tarea.hora}Z`);
            
            if (isNaN(tiempoTareaUtc)) continue;

            // La hora real UTC de la tarea es la hora local más el offset
            // Ej: 14:30 en GMT-3 (offset 180m) => UTC = 14:30 + 3h = 17:30 UTC.
            const tiempoTareaRealUtc = tiempoTareaUtc + clientOffsetMs;
            
            // Restar los minutos configurados por el usuario
            const tiempoAlertaUtc = tiempoTareaRealUtc - (tarea.recordatorio_minutos * 60 * 1000);

            // Si ya pasamos la hora de la alerta y no excede un margen de error razonable (30min)
            if (ahoraUtc >= tiempoAlertaUtc && (ahoraUtc - tiempoAlertaUtc) < 30 * 60 * 1000) {
                alertasAEnviar.push(tarea);
                // Marcar como notificada inmediatamente para que no se repita en el próximo ciclo
                await db.run('UPDATE tareas SET notificado = 1 WHERE id = ?', [tarea.id]);
            }
        }

        res.json(alertasAEnviar);
    } catch (error) {
        console.error("Error al procesar recordatorios:", error);
        res.status(500).json({ error: "Error interno del servidor." });
    }
};


// ===============================================================================
// CONTROLADOR DE SUBTEAREAS (CHECKLISTS)
// ===============================================================================

exports.crearSubtarea = async (req, res) => {
    try {
        const { tarea_id } = req.params;
        const { descripcion } = req.body;

        if (!descripcion) {
            return res.status(400).json({ error: "La descripción de la subtarea es obligatoria."});
        }

        const db = await conexionDB();
        const resultado = await db.run(
            'INSERT INTO subtareas (tarea_id, descripcion) VALUES (?, ?)',
            [tarea_id, descripcion.trim()]
        );

        res.status(201).json({
            id: resultado.lastID,
            tarea_id: Number(tarea_id),
            descripcion: descripcion.trim(),
            completada: 0
        });
    } catch (error) {
        console.error("Error al crear subtarea:", error);
        res.status(500).json({ error: "Error al crear subtarea."});    
    }
};

exports.actualizarSubtarea = async (req, res) => {
    try {
        const { id } = req.params;
        const { completada, descripcion } = req.body;

        const db = await conexionDB();

        const subtareaActual = await db.get('SELECT * FROM subtareas WHERE id = ?', [id]);
        if (!subtareaActual) {
            return res.status(404).json({ error: "Subtarea no encontrada." });
        }

        const nuevaCompletada = completada !== undefined ? completada : subtareaActual.completada;
        const nuevaDescripcion = descripcion !== undefined ? descripcion : subtareaActual.descripcion;

        await db.run(
            'UPDATE subtareas SET completada = ?, descripcion = ? WHERE id = ?', 
            [nuevaCompletada, nuevaDescripcion, id]
        );

        res.json({
            mensaje: "Subtarea actualizada.",
            subtarea: { id: Number(id), tarea_id: subtareaActual.tarea_id, completada: nuevaCompletada, descripcion: nuevaDescripcion }
        });
    } catch (error) {
        console.error("Error al actualizar subtarea:", error);
        res.status(500).json({ error: "Error al actualizar la subtarea." });
    }
};

exports.eliminarSubtarea = async (req, res) => {
    try {
        const { id } = req.params;
        const db = await conexionDB();
        const resultado = await db.run('DELETE FROM subtareas WHERE id = ?', [id]);

        if (resultado.changes === 0) {
            return res.status(404).json({ error: "Subtarea no encontrada." });
        }

        res.json({ mensaje: "Subtarea eliminada con éxito." });
    } catch (error) {
        console.error("Error al eliminar subtarea:", error);
        res.status(500).json({ error: "Error al eliminar la subtarea." });
    }
};

exports.reordenarTareas = async (req, res) => {
    try {
        const { ordenamiento } = req.body;
        if (!ordenamiento || !Array.isArray(ordenamiento)) {
            return res.status(400).json({ error: "El ordenamiento es requerido y debe ser un array." });
        }

        const db = await conexionDB();
        
        await db.run('BEGIN TRANSACTION');
        for (const item of ordenamiento) {
            await db.run('UPDATE tareas SET orden = ? WHERE id = ?', [item.orden, item.id]);
        }
        await db.run('COMMIT');

        res.json({ mensaje: "Tareas reordenadas con éxito." });
    } catch (error) {
        console.error("Error al reordenar tareas:", error);
        res.status(500).json({ error: "Error al reordenar las tareas." });
    }
};