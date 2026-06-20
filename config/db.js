const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

let dbInstance = null;

// Función para conectar a la base de datos (Retorna una conexión singleton)
async function conexionDB() {
    if (!dbInstance) {
        dbInstance = await open({
            filename: path.join(__dirname, '../database.db'),
            driver: sqlite3.Database
        });
        // Activar soporte para llaves foráneas (para relacionar proyectos y tareas)
        await dbInstance.get("PRAGMA foreign_keys = ON");
    }
    return dbInstance;
}

// Función para crear las tablas si no existen
async function inicializarDB() {
    const db = await conexionDB();
    
    // Activar soporte para llaves foráneas (para relacionar proyectos y tareas)
    await db.get("PRAGMA foreign_keys = ON");

    // Tabla de Usuarios
    await db.exec(`
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL
        )
    `);

    // Migraciones para la tabla usuarios: avatar, reset_token, reset_expires
    const usuariosColsToAdd = [
        "avatar TEXT",
        "reset_token TEXT",
        "reset_expires INTEGER"
    ];
    for (const colDef of usuariosColsToAdd) {
        const colName = colDef.split(" ")[0];
        try {
            await db.exec(`ALTER TABLE usuarios ADD COLUMN ${colDef}`);
            console.log(`Columna ${colName} añadida a usuarios.`);
        } catch (e) {
            // Ignorar si ya existe
        }
    }

    // Tabla de Proyectos
    await db.exec(`
        CREATE TABLE IF NOT EXISTS proyectos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario_id INTEGER,
            nombre TEXT NOT NULL,
            descripcion TEXT,
            fecha_inicio TEXT DEFAULT CURRENT_DATE,
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
        )
    `);

    // Tabla de Tareas
    await db.exec(`
        CREATE TABLE IF NOT EXISTS tareas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            proyecto_id INTEGER,
            usuario_id INTEGER,
            titulo TEXT NOT NULL,
            fecha TEXT,
            estado TEXT CHECK(estado IN ('pendiente', 'en_progreso', 'completada')) DEFAULT 'pendiente',
            FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE CASCADE,
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
        )
    `);

    // Tabla de Notas
    await db.exec(`
        CREATE TABLE IF NOT EXISTS notas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario_id INTEGER,
            contenido TEXT NOT NULL,
            fecha TEXT,
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
        )
    `);

    //Nueva tabla: Subtareas / Checklists
    await db.exec(`
        CREATE TABLE IF NOT EXISTS subtareas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tarea_id INTEGER,
            descripcion TEXT NOT NULL,
            completada INTEGER CHECK(completada IN (0, 1)) DEFAULT 0,
            FOREIGN KEY (tarea_id) REFERENCES tareas(id) ON DELETE CASCADE
        )
        `);

    // Migraciones para la tabla tareas (añadir columnas de forma segura)
    const columnsToAdd = [
        "hora TEXT",
        "prioridad INTEGER DEFAULT 3",
        "notas TEXT",
        "descripcion TEXT",
        "recordatorio_minutos INTEGER DEFAULT -1", // 🆕 -1 = Ninguno, 0 = Al momento, 15, 30, 60, 1440
        "notificado INTEGER DEFAULT 0",             // 🆕 Evita que la notificación se repita
        "orden INTEGER DEFAULT 0"
    ];

    for (const colDef of columnsToAdd) {
        const colName = colDef.split(" ")[0];
        try {
            await db.exec(`ALTER TABLE tareas ADD COLUMN ${colDef}`);
            console.log(`Columna ${colName} añadida a tareas.`);
        } catch (e) {
            // Ignorar el error si la columna ya existe
        }
    }

    // Migraciones para la tabla proyectos (añadir emoji y color de forma segura)
    const proyectosColumnsToAdd = [
        "emoji TEXT DEFAULT '📁'",
        "color TEXT"
    ];

    for (const colDef of proyectosColumnsToAdd) {
        const colName = colDef.split(" ")[0];
        try {
            await db.exec(`ALTER TABLE proyectos ADD COLUMN ${colDef}`);
            console.log(`Columna ${colName} añadida a proyectos.`);
        } catch (e) {
            // Ignorar el error si la columna ya existe
        }
    }
    
    console.log("=================================================");
    console.log("🗄️  Base de datos indexada y tablas creadas/actualizadas.");
}

// AQUÍ ESTÁ LA CORRECCIÓN: Exportación correcta en Node.js (CommonJS)
module.exports = { conexionDB, inicializarDB };