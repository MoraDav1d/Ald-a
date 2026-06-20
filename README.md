# 📅 Al Día — Agenda & Gestor de Tareas Interactivo

Es una aplicación web premium y minimalista diseñada para la gestión diaria de actividades, proyectos y notas. Combina una interfaz interactiva de usuario en el frontend (con efectos parallax y soporte de arrastrar y soltar) con un servidor ágil en Node.js y SQLite para ofrecer un control de productividad óptimo.

## 🚀 Características Principales

*   **📅 Agenda Diaria Interactiva**: Planifica tus jornadas mediante un flujo de trabajo dinámico. Soporta ordenamiento personalizado de tareas mediante *Drag & Drop*.
*   **⚠️ Control de Tareas Vencidas**: Las tareas no completadas de días anteriores se mueven de forma automática a una bandeja de "Vencidas" para evitar que queden olvidadas.
*   **📝 Checklists y Subtareas**: Desglosa tus tareas principales en pasos más pequeños con una barra de progreso que se actualiza en tiempo real.
*   **💡 Notas al Vuelo**: Un lienzo rápido para capturar ideas, pensamientos y notas del proyecto sin interferir en tu flujo de trabajo.
*   **🔥 Rachas de Productividad**: Gamifica tu rutina manteniendo encendida tu racha de días completando todas tus actividades pendientes.
*   **📥 Exportación Rápida**: Descarga tus estadísticas y listados de tareas en formato CSV (para Excel o Google Sheets) o genera reportes en formato PDF listos para imprimir.
*   **🎨 Diseño Premium y Responsivo**: Interfaz fluida adaptada a dispositivos móviles y escritorio. Incluye un switch instantáneo para **Modo Oscuro** y **Modo Claro**.

## 🛠️ Stack Tecnológico

*   **Backend**: Node.js, Express.js (v5.2.1)
*   **Base de Datos**: SQLite3 (v6.0.1) con el ORM ligero `sqlite` (v5.1.1)
*   **Frontend**: HTML5 semántico, CSS3 personalizado (con variables dinámicas, auroras de fondo y transiciones suaves) y JavaScript nativo (Vanilla JS).


## ⚙️ Instalación y Configuración

Sigue estos pasos para arrancar el proyecto de forma local:

### Prerrequisitos

*   Tener instalado [Node.js](https://nodejs.org/) (versión 16 o superior recomendada).

### Pasos

1.  **Clonar o descargar** este repositorio en tu máquina local.

2.  Abrir una terminal en la carpeta raíz del proyecto.

3.  Instalar las dependencias de Node.js:
    npm install

4.  Iniciar el servidor en modo de desarrollo (utiliza `nodemon` para reinicios automáticos tras cambios de código):
    npm run dev

5.  Abre tu navegador y entra en la dirección:
    http://localhost:3000