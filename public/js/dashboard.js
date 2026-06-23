document.addEventListener('DOMContentLoaded', () => {
    // Variables globales de estado (declaradas al inicio para evitar errores de inicialización y TDZ)
    let currentDate = new Date();
    let selectedDate = new Date(); // YYYY-MM-DD
    let globalTareas = []; // Todas las tareas del usuario
    let proyectos = []; // Todos los proyectos
    let statusFilter = 'all'; // 'all' | 'completed' | 'pending'
    let projectFilter = null; // null | 'no-project' | proyectoId

    function formatISODate(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    const todayISO = formatISODate(new Date());

    // 1. Solicitar permisos de notificación nativos si aún no se han decidido
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
    
    // 2. Ejecutar el chequeo cada 60 segundos
    setInterval(chequearRecordatorios, 60000);
    chequearRecordatorios(); // Primera ejecución inmediata


    async function chequearRecordatorios() {
        try {
            const usuarioTemp = JSON.parse(localStorage.getItem('aldia_usuario'));
            const offset = new Date().getTimezoneOffset();
            const respuesta = await fetch(`/api/tareas/recordatorios?usuario_id=${usuarioTemp.id}&offset=${offset}`);
            if (!respuesta.ok) return;
            
            const tareasANotificar = await respuesta.json();
            
            tareasANotificar.forEach(tarea => {
                const textoAlerta = `Recordatorio: "${tarea.titulo}" pautada para las ${tarea.hora}.`;
                
                // Si el usuario dio permisos, mandamos la notificación de escritorio
                if (Notification.permission === 'granted') {
                    new Notification('⏰ Al Día - Recordatorio', {
                        body: textoAlerta,
                        icon: '/img/logo.png'
                    });
                    playChime('info');
                } else {
                    mostrarToastInterno({ title: 'Recordatorio', body: textoAlerta, type: 'info', timeout: 7000 });
                    playChime('info');
                }
            });
        } catch (error) {
            console.error('Error verificando recordatorios:', error);
        }
    }

    // Mostrar notificaciones por tareas vencidas (solo nuevas)
    const shownOverdue = new Set(JSON.parse(sessionStorage.getItem('aldia_shown_overdue') || '[]'));
    function checkOverdueNotifications() {
        try {
            const overdue = globalTareas.filter(t => t.fecha && t.fecha < todayISO && t.estado !== 'completada');
            const nuevos = overdue.filter(t => !shownOverdue.has(String(t.id)));
            if (nuevos.length > 0) {
                // Mostrar resumen bonito
                const lista = nuevos.slice(0, 4).map(t => `• ${t.titulo}`).join('<br>');
                mostrarToastInterno({
                    title: 'Tareas vencidas',
                    body: `${nuevos.length} tarea${nuevos.length>1?'s':' '} vencida${nuevos.length>1?'s':''}.<br>${lista}`,
                    type: 'warning',
                    actions: [
                        { label: 'Ver vencidas', primary: true, onClick: () => {
                            const linkVencidas = document.querySelector('.sidebar-link[data-target="seccion-vencidas"]');
                            if (linkVencidas) {
                                linkVencidas.click();
                            } else {
                                sections.forEach(s => s.classList.add('hidden-section'));
                                document.getElementById('seccion-vencidas').classList.remove('hidden-section');
                                renderVencidas();
                            }
                        } },
                        { label: 'Ignorar', primary: false, onClick: () => {} }
                    ],
                    timeout: 9000
                });

                // Desktop notification
                if ('Notification' in window && Notification.permission === 'granted') {
                    const n = new Notification('Tareas vencidas', { body: `${nuevos.length} tareas vencidas.`, icon: '/img/logo.png' });
                    n.onclick = () => window.focus();
                }
                playChime('warning');

                nuevos.forEach(t => shownOverdue.add(String(t.id)));
                sessionStorage.setItem('aldia_shown_overdue', JSON.stringify(Array.from(shownOverdue)));
            }
        } catch (err) { console.error('Error checking overdue notifications', err); }
    }

    // Notificación de racha muerta
    function checkStreakNotification() {
        try {
            if (!usuario) return;
            const currentRacha = calcularRacha(globalTareas);
            const last = Number(localStorage.getItem(`aldia_last_racha_${usuario.id}`) || '0');
            if (currentRacha > last) {
                // Racha aumentó
                mostrarToastInterno({
                    title: '¡Racha activa!',
                    body: `Tu racha ha subido a ${currentRacha} día${currentRacha>1?'s':''}. ¡Excelente trabajo!`,
                    type: 'info',
                    actions: [
                        { label: 'Ver racha', primary: true, onClick: () => { mostrarModalRacha(); } },
                        { label: 'Cerrar', primary: false, onClick: () => {} }
                    ],
                    timeout: 8000
                });
                if ('Notification' in window && Notification.permission === 'granted') {
                    const n = new Notification('¡Racha activa!', { body: `Racha: ${currentRacha} día${currentRacha>1?'s':''}.`, icon: '/img/logo.png' });
                    n.onclick = () => window.focus();
                }
                playChime('success');
            } else if (last > 0 && currentRacha < last) {
                // La racha se rompió
                mostrarToastInterno({
                    title: 'Racha terminada',
                    body: `Tu racha de ${last} día${last>1?'s':''} ha terminado. ¡Vuelve a intentarlo hoy!`,
                    type: 'error',
                    actions: [
                        { label: 'Ver racha', primary: true, onClick: () => { mostrarModalRacha(); } },
                        { label: 'Ignorar', primary: false, onClick: () => {} }
                    ],
                    timeout: 10000
                });
                if ('Notification' in window && Notification.permission === 'granted') {
                    const n = new Notification('Racha terminada', { body: `Tu racha de ${last} día${last>1?'s':''} ha terminado.`, icon: '/img/logo.png' });
                    n.onclick = () => window.focus();
                }
                playChime('error');
            }
            // Actualizar registro
            localStorage.setItem(`aldia_last_racha_${usuario.id}`, String(currentRacha));
        } catch (err) { console.error('Error checking streak', err); }
    }

    // Ciclo central de comprobación de notificaciones
    async function checkAllNotifications() {
        // Recordatorios son verificados por chequearRecordatorios (ya los dispara)
        checkOverdueNotifications();
        checkStreakNotification();
    }

    // Ejecutar comprobaciones periódicas junto a chequearRecordatorios
    setInterval(() => {
        checkAllNotifications();
    }, 60000);

    // Función para crear alertas dinámicas dentro del DOM (mejorada)
    function mostrarToastInterno(mensajeOrOptions) {
        const opts = typeof mensajeOrOptions === 'string' ? { body: mensajeOrOptions } : mensajeOrOptions || {};
        const title = opts.title || '';
        const body = opts.body || '';
        const type = opts.type || 'info'; // 'info'|'warning'|'error'
        const actions = opts.actions || []; // [{label, onClick}]

        const toast = document.createElement('div');
        toast.className = `toast-alerta ${type}`;

        toast.innerHTML = `
            ${title ? `<div class="toast-title">${title}</div>` : ''}
            <div class="toast-body">${body}</div>
            <div class="toast-actions"></div>
        `;

        const actionsEl = toast.querySelector('.toast-actions');
        actions.forEach(act => {
            const btn = document.createElement('button');
            btn.className = `toast-btn ${act.primary ? 'primary' : 'ghost'}`;
            btn.textContent = act.label;
            btn.onclick = (e) => {
                e.stopPropagation();
                try { act.onClick && act.onClick(); } catch (err) { console.error(err); }
                toast.classList.remove('visible');
                setTimeout(() => toast.remove(), 300);
            };
            actionsEl.appendChild(btn);
        });

        document.body.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('visible'));

        const timeout = opts.timeout !== undefined ? opts.timeout : 6000;
        if (timeout > 0) {
            setTimeout(() => {
                toast.classList.remove('visible');
                setTimeout(() => toast.remove(), 300);
            }, timeout);
        }
        return toast;
    }

    // Play a short chime using WebAudio
    function playChime(type='info') {
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = new AudioCtx();
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.type = 'sine';
            if (type === 'info') {
                o.frequency.setValueAtTime(880, ctx.currentTime);
            } else if (type === 'warning') {
                o.frequency.setValueAtTime(440, ctx.currentTime);
            } else if (type === 'error') {
                o.frequency.setValueAtTime(220, ctx.currentTime);
            } else {
                o.frequency.setValueAtTime(660, ctx.currentTime);
            }
            g.gain.setValueAtTime(0, ctx.currentTime);
            g.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.01);
            g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
            o.connect(g); g.connect(ctx.destination);
            o.start();
            setTimeout(() => { try { o.stop(); ctx.close(); } catch(e){} }, 700);
        } catch (err) { console.error('playChime error', err); }
    }
    const usuario = JSON.parse(localStorage.getItem('aldia_usuario'));
    
    if (!usuario) {
        window.location.href = 'login.html';
        return;
    }

    const greeting = document.getElementById('user-greeting');
    if (greeting) greeting.textContent = `Hola, ${usuario.nombre}`;

    // Inicializar Perfil en Sidebar
    const sidebarAvatar = document.getElementById('sidebar-avatar');
    const sidebarUserName = document.getElementById('sidebar-user-name');
    const sidebarUserEmail = document.getElementById('sidebar-user-email');
    const sidebarLogoutBtn = document.getElementById('sidebar-logout-btn');

    if (sidebarAvatar && usuario.nombre) {
        sidebarAvatar.textContent = usuario.nombre.charAt(0).toUpperCase();
    }
    if (sidebarUserName) sidebarUserName.textContent = usuario.nombre;
    if (sidebarUserEmail) sidebarUserEmail.textContent = usuario.email || 'sin@correo.com';

    if (sidebarLogoutBtn) {
        sidebarLogoutBtn.addEventListener('click', () => {
            localStorage.removeItem('aldia_usuario');
            sessionStorage.removeItem('aldia_shown_overdue');
            window.location.href = 'index.html';
        });
    }

    // (Variables Globales inicializadas al inicio del script)

    // ==============================================
    // HELPER: BUILDER DE CHECKLIST EN FORMULARIOS
    // ==============================================
    function inicializarChecklistBuilder(inputId, btnId, listId) {
        let items = [];
        const input = document.getElementById(inputId);
        const btn = document.getElementById(btnId);
        const list = document.getElementById(listId);

        if (!input || !btn || !list) return { getItems: () => [], clear: () => {} };

        const renderItems = () => {
            list.innerHTML = '';
            items.forEach((item, index) => {
                const div = document.createElement('div');
                div.className = 'subtarea-item';
                div.style.display = 'flex';
                div.style.alignItems = 'center';
                div.style.gap = '0.5rem';
                div.style.fontSize = '0.85rem';
                div.style.padding = '0.2rem 0';
                
                div.innerHTML = `
                    <span style="color: var(--text-primary); flex: 1;">☐ ${item}</span>
                    <button type="button" class="btn-eliminar-previo" style="background: none; border: none; color: #ef4444; cursor: pointer; padding: 0 0.2rem; font-size: 0.85rem;">✕</button>
                `;

                div.querySelector('.btn-eliminar-previo').onclick = () => {
                    items.splice(index, 1);
                    renderItems();
                };

                list.appendChild(div);
            });
        };

        const agregarItem = () => {
            const val = input.value.trim();
            if (val) {
                items.push(val);
                input.value = '';
                renderItems();
            }
        };

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            agregarItem();
        });

        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                agregarItem();
            }
        });

        return {
            getItems: () => items,
            clear: () => {
                items = [];
                renderItems();
            }
        };
    }

    const builderHoy = inicializarChecklistBuilder('input-checklist-hoy', 'btn-agregar-checklist-hoy', 'lista-checklist-previo-hoy');
    const builderProximo = inicializarChecklistBuilder('input-checklist-proximo', 'btn-agregar-checklist-proximo', 'lista-checklist-previo-proximo');
    const builderProyecto = inicializarChecklistBuilder('input-checklist-proyecto', 'btn-agregar-checklist-proyecto', 'lista-checklist-previo-proyecto');

    // Elementos del DOM
    const sidebar = document.getElementById('sidebar-menu');
    const menuToggle = document.getElementById('menu-toggle');
    const closeSidebar = document.getElementById('close-sidebar');
    const sidebarLinks = document.querySelectorAll('.sidebar-link');
    const sections = document.querySelectorAll('.dashboard-section');

    const calendarDays = document.getElementById('calendar-days');
    const monthYearText = document.getElementById('calendar-month-year');
    const selectedDateTitle = document.getElementById('selected-date-title');

    // Inicializar UI de Fecha de Hoy de forma segura
    const fechaHoyText = document.getElementById('fecha-hoy-text');
    if (fechaHoyText) {
        const fechaFormateada = new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        fechaHoyText.textContent = fechaFormateada.charAt(0).toUpperCase() + fechaFormateada.slice(1);
    }
    
    // ==============================================
    // UTILS: NORMALIZACIÓN DE TEXTO (VALIDACIONES)
    // ==============================================
    function normalizarTexto(texto) {
        if (!texto) return '';
        return texto
            .trim()
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "") // Eliminar acentos
            .replace(/\s+/g, ' '); // Colapsar espacios múltiples
    }

    function validarTareaDuplicada(tituloNuevo, idTareaExcluir = null) {
        const tituloNorm = normalizarTexto(tituloNuevo);
        return globalTareas.some(t => {
            if (idTareaExcluir && t.id === parseInt(idTareaExcluir)) return false;
            return normalizarTexto(t.titulo) === tituloNorm;
        });
    }

    // ==============================================
    // FUNCIÓN DE ALERTA PERSONALIZADA (ESTÉTICA GLASS)
    // ==============================================
    function mostrarAlertaPersonalizada(mensaje, tipo = 'info') {
        const alertaPrevia = document.getElementById('alerta-custom-glass');
        if (alertaPrevia) alertaPrevia.remove();

        const overlay = document.createElement('div');
        overlay.id = 'alerta-custom-glass';
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100vw';
        overlay.style.height = '100vh';
        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.4)';
        overlay.style.backdropFilter = 'blur(8px)';
        overlay.style.display = 'flex';
        overlay.style.justifyContent = 'center';
        overlay.style.alignItems = 'center';
        overlay.style.zIndex = '9999';
        overlay.style.animation = 'fadeIn 0.2s ease-out';

        const colorBorde = tipo === 'error' ? 'rgba(239, 68, 68, 0.5)' : 'rgba(59, 130, 246, 0.5)';
        const icono = tipo === 'error' ? '⚠️' : '💡';

        overlay.innerHTML = `
            <div style="background: var(--glass-bg); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
                        border: 1px solid ${colorBorde}; padding: 2rem; border-radius: 12px; max-width: 400px; width: 85%;
                        text-align: center; box-shadow: var(--shadow-lg); animation: scaleUp 0.25s ease-out; color: var(--text-primary);">
                <div style="font-size: 2.5rem; margin-bottom: 1rem;">${icono}</div>
                <p style="font-size: 1.05rem; line-height: 1.5; margin-bottom: 1.5rem; font-weight: 500;">${mensaje}</p>
                <button id="btn-cerrar-alerta-custom" class="btn btn-primary" style="padding: 0.5rem 2rem; margin: 0 auto; display: block; border-radius: 6px;">Aceptar</button>
            </div>
        `;

        document.body.appendChild(overlay);

        const btnCerrar = document.getElementById('btn-cerrar-alerta-custom');
        if (btnCerrar) {
            btnCerrar.addEventListener('click', () => overlay.remove());
        }
        overlay.addEventListener('click', (e) => {
            if(e.target === overlay) overlay.remove();
        });
    }

    if (!document.getElementById('alerta-animaciones-css')) {
        const style = document.createElement('style');
        style.id = 'alerta-animaciones-css';
        style.innerHTML = `
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes scaleUp { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        `;
        document.head.appendChild(style);
    }

    // ==============================================
    // NAVEGACIÓN Y SIDEBAR
    // ==============================================
    if (menuToggle && sidebar) {
        menuToggle.addEventListener('click', () => sidebar.classList.toggle('hidden-sidebar'));
    }
    if (closeSidebar && sidebar) {
        closeSidebar.addEventListener('click', () => sidebar.classList.add('hidden-sidebar'));
    }

    sidebarLinks.forEach(link => {
        link.addEventListener('click', async (e) => {
            e.preventDefault();
            
            const targetId = link.getAttribute('data-target');
            const targetSection = document.getElementById(targetId);
            if (!targetSection) return;

            sidebarLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            // Buscar sección activa actual para aplicar fade-out de salida
            const activeSection = document.querySelector('.dashboard-section:not(.hidden-section)');
            if (activeSection && activeSection !== targetSection) {
                activeSection.classList.add('fade-out-section');
                // Esperar a que termine la animación de salida (150ms)
                await new Promise(resolve => setTimeout(resolve, 150));
                activeSection.classList.remove('fade-out-section');
            }
            
            sections.forEach(s => s.classList.add('hidden-section'));
            targetSection.classList.remove('hidden-section');
            
            // Al hacer clic en el menú lateral, limpiamos el buscador global
            const searchInputEl = document.getElementById('global-search-input');
            if (searchInputEl) searchInputEl.value = '';
            previousSectionId = targetId;
            
            if (targetId === 'seccion-hoy') {
                renderHoy();
            } else if (targetId === 'seccion-vencidas') {
                renderVencidas();
            } else if (targetId === 'seccion-proximo') {
                renderCalendar();
                cargarDatosProximo();
            } else if (targetId === 'seccion-reportes') {
                renderReportes();
            }

            if (window.innerWidth < 768 && sidebar) {
                sidebar.classList.add('hidden-sidebar');
            }
        });
    });

    // ==============================================
    // UTILIDADES DE FECHA
    // ==============================================
    // (formatISODate definida al inicio del script)

    function getProyectoNombre(proyectoId) {
        const p = proyectos.find(p => p.id === parseInt(proyectoId));
        return p ? p.nombre : 'Sin Proyecto';
    }

    function applyFiltersToTasks(tasks) {
        let out = tasks.slice();
        if (projectFilter === 'no-project') {
            out = out.filter(t => !t.proyecto_id);
        } else if (projectFilter) {
            out = out.filter(t => t.proyecto_id === projectFilter || String(t.proyecto_id) === String(projectFilter));
        }

        if (statusFilter === 'completed') {
            out = out.filter(t => t.estado === 'completada');
        } else if (statusFilter === 'pending') {
            out = out.filter(t => t.estado !== 'completada');
        }

        return out;
    }

    function refrescarPantallaActiva() {
        const activeSection = document.querySelector('.dashboard-section:not(.hidden-section)');
        if(activeSection) {
            if(activeSection.id === 'seccion-hoy') renderHoy();
            if(activeSection.id === 'seccion-vencidas') renderVencidas();
            if(activeSection.id === 'seccion-busqueda') {
                const queryText = globalSearchInput ? globalSearchInput.value.trim() : '';
                ejecutarBusquedaGlobal(queryText);
            }
            if(activeSection.id === 'seccion-proximo') { renderCalendar(); cargarDatosProximo(); }
            if(activeSection.id === 'seccion-reportes') renderReportes();
        }
        
        // Si el modal de proyectos está abierto, se refrescan internamente sus datos
        const modalProyecto = document.getElementById('project-modal');
        if (modalProyecto && !modalProyecto.classList.contains('hidden')) {
            const pId = modalProyecto.getAttribute('data-current-proyecto-id');
            const pObj = proyectos.find(p => p.id === parseInt(pId));
            if (pObj) {
                refrescarTareasModalProyecto(pObj.id);
            }
        }
    }

    // ==============================================
    // CARGA DE DATOS DESDE API
    // ==============================================
    async function cargarProyectos() {
        try {
            const res = await fetch(`/api/proyectos?usuario_id=${usuario.id}`);
            proyectos = await res.json();
            
            const selectProyectoHoy = document.getElementById('proyecto-tarea-hoy');
            const selectProyectoProximo = document.getElementById('proyecto-tarea-proximo');
            const filtroReportes = document.getElementById('filtro-proyecto-reporte');
            
            if (selectProyectoHoy) selectProyectoHoy.innerHTML = '<option value="">Sin Proyecto</option>';
            if (selectProyectoProximo) selectProyectoProximo.innerHTML = '<option value="">Sin Proyecto</option>';
            if (filtroReportes) filtroReportes.innerHTML = '<option value="todos">Todos los proyectos</option><option value="individuales">Sin Proyecto (Individuales)</option>';

            proyectos.forEach(p => {
                if (selectProyectoHoy) {
                    const optHoy = document.createElement('option');
                    optHoy.value = p.id;
                    optHoy.textContent = p.nombre;
                    selectProyectoHoy.appendChild(optHoy);
                }

                if (selectProyectoProximo) {
                    const optProx = document.createElement('option');
                    optProx.value = p.id;
                    optProx.textContent = p.nombre;
                    selectProyectoProximo.appendChild(optProx);
                }

                if (filtroReportes) {
                    const optFiltro = document.createElement('option');
                    optFiltro.value = p.id;
                    optFiltro.textContent = p.nombre;
                    filtroReportes.appendChild(optFiltro);
                }
            });

            renderProyectosSidebar();
        } catch (error) {
            console.error("Error cargando proyectos:", error);
        }
    }

    function renderProyectosSidebar() {
        const listaSidebar = document.getElementById('sidebar-proyectos-lista');
        if (!listaSidebar) return;
        listaSidebar.innerHTML = '';

        proyectos.forEach(p => {
            const tareasPendientes = globalTareas.filter(t => t.proyecto_id === p.id && t.estado !== 'completada').length;
            const div = document.createElement('div');
            div.className = 'project-item-sidebar';
            
            const colores = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];
            const colorIndex = p.id % colores.length;
            const colorSeleccionado = p.color || colores[colorIndex];
            const projectEmoji = p.emoji || '📁';

            // Generar colores translúcidos para el badge de tareas
            const badgeBg = colorSeleccionado + '1f'; // 12% opacidad en hex
            const badgeBorder = colorSeleccionado + '40'; // 25% opacidad en hex

            div.innerHTML = `
                <div class="project-dot-name">
                    <span class="project-indicator-dot" style="background-color: ${colorSeleccionado};"></span>
                    <span style="font-size: 1.1rem; margin-right: 0.1rem;">${projectEmoji}</span>
                    <span>${p.nombre}</span>
                </div>
                <div class="project-sidebar-actions">
                    ${tareasPendientes > 0 ? `<span class="project-task-badge" style="background-color: ${badgeBg}; color: ${colorSeleccionado}; border-color: ${badgeBorder};">${tareasPendientes}</span>` : ''}
                    <button class="project-sidebar-delete-btn" title="Eliminar Proyecto" onclick="event.stopPropagation(); window.eliminarProyectoRapido(${p.id}, '${p.nombre.replace(/'/g, "\\'")}')">🗑️</button>
                </div>
            `;
            div.onclick = () => abrirModalProyecto(p.id, p.nombre);
            listaSidebar.appendChild(div);
        });

        // Añadir una división y encabezado para la sección 'Sin proyecto'
        const divider = document.createElement('hr');
        divider.style.borderColor = 'var(--glass-border)';
        divider.style.margin = '0.8rem 0';
        listaSidebar.appendChild(divider);

        const headerNoProj = document.createElement('div');
        headerNoProj.style.fontSize = '0.95rem';
        headerNoProj.style.color = 'var(--text-secondary)';
        headerNoProj.style.marginBottom = '0.4rem';
        headerNoProj.textContent = 'Sin proyecto';
        listaSidebar.appendChild(headerNoProj);

        // Item que luce exactamente igual que un proyecto
        const sinProyectoCount = globalTareas.filter(t => !t.proyecto_id).length;
        const divSin = document.createElement('div');
        divSin.className = 'project-item-sidebar';
        divSin.innerHTML = `
            <div class="project-dot-name">
                <span class="project-indicator-dot" style="background-color: #94a3b8;"></span>
                <span style="font-size: 1.1rem; margin-right: 0.1rem;">📁</span>
                <span>Sin proyecto</span>
            </div>
            <div class="project-sidebar-actions">
                ${sinProyectoCount > 0 ? `<span class="project-task-badge" style="background-color: rgba(148,163,184,0.12); color: #64748b;">${sinProyectoCount}</span>` : ''}
            </div>
        `;
        divSin.onclick = (e) => {
            e.stopPropagation();
            // Abrir modal estandar "Sin proyecto" (solo lectura)
            window.abrirModalProyecto('no-project', 'Sin proyecto');
        };
        listaSidebar.appendChild(divSin);
    }

    function mostrarSinProyecto() {
        projectFilter = 'no-project';
        // Ir a la sección 'Hoy' y renderizar con filtro
        sections.forEach(s => s.classList.add('hidden-section'));
        const seccion = document.getElementById('seccion-hoy');
        if (seccion) seccion.classList.remove('hidden-section');
        renderHoy();
    }

    // Manejo de botones de filtro (Total / Completadas / Pendientes)
    const btnTotal = document.getElementById('filter-btn-total');
    const btnCompletadas = document.getElementById('filter-btn-completadas');
    const btnPendientes = document.getElementById('filter-btn-pendientes');
    const btnClear = document.getElementById('filter-clear');

    function actualizarBotonesFiltro() {
        // small btns (hidden by CSS) kept for backward compatibility
        if (btnTotal) btnTotal.classList.toggle('active-filter', statusFilter === 'all');
        if (btnCompletadas) btnCompletadas.classList.toggle('active-filter', statusFilter === 'completed');
        if (btnPendientes) btnPendientes.classList.toggle('active-filter', statusFilter === 'pending');
        // Metric cards in the header
        const metricTotal = document.getElementById('metric-total')?.closest('.metric-card');
        const metricCompletadas = document.getElementById('metric-completadas')?.closest('.metric-card');
        const metricPendientes = document.getElementById('metric-pendientes')?.closest('.metric-card');

        if (metricTotal) metricTotal.classList.toggle('active-filter', statusFilter === 'all');
        if (metricCompletadas) metricCompletadas.classList.toggle('active-filter', statusFilter === 'completed');
        if (metricPendientes) metricPendientes.classList.toggle('active-filter', statusFilter === 'pending');

        if (btnClear) {
            if (statusFilter === 'all' && !projectFilter) btnClear.classList.add('hidden'); else btnClear.classList.remove('hidden');
        }
    }

    // Bind clicks to metric cards in header so they act as filters
    const metricCardTotal = document.getElementById('metric-total') ? document.getElementById('metric-total').closest('.metric-card') : null;
    const metricCardCompletadas = document.getElementById('metric-completadas') ? document.getElementById('metric-completadas').closest('.metric-card') : null;
    const metricCardPendientes = document.getElementById('metric-pendientes') ? document.getElementById('metric-pendientes').closest('.metric-card') : null;

    if (metricCardTotal) { metricCardTotal.classList.add('filterable'); metricCardTotal.addEventListener('click', () => { statusFilter = 'all'; projectFilter = null; actualizarBotonesFiltro(); renderHoy(); }); }
    if (metricCardCompletadas) { metricCardCompletadas.classList.add('filterable'); metricCardCompletadas.addEventListener('click', () => { statusFilter = 'completed'; projectFilter = null; actualizarBotonesFiltro(); renderHoy(); }); }
    if (metricCardPendientes) { metricCardPendientes.classList.add('filterable'); metricCardPendientes.addEventListener('click', () => { statusFilter = 'pending'; projectFilter = null; actualizarBotonesFiltro(); renderHoy(); }); }

    if (btnTotal) btnTotal.addEventListener('click', () => { statusFilter = 'all'; projectFilter = null; actualizarBotonesFiltro(); renderHoy(); });
    if (btnCompletadas) btnCompletadas.addEventListener('click', () => { statusFilter = 'completed'; actualizarBotonesFiltro(); renderHoy(); });
    if (btnPendientes) btnPendientes.addEventListener('click', () => { statusFilter = 'pending'; actualizarBotonesFiltro(); renderHoy(); });
    if (btnClear) btnClear.addEventListener('click', () => { statusFilter = 'all'; projectFilter = null; actualizarBotonesFiltro(); renderHoy(); });

    async function cargarTodasLasTareas() {
        try {
            const res = await fetch(`/api/tareas?usuario_id=${usuario.id}`);
            globalTareas = await res.json();
            actualizarRachaUI();
            renderProyectosSidebar();
            // Comprobar notificaciones tras actualizar tareas
            try { markTodaySuccessIfApplicable(); } catch(e) { console.error(e); }
            try { checkAllNotifications(); } catch (e) { console.error('Error checking notifications after load', e); }
        } catch (e) { console.error("Error global tareas:", e); }
    }

    // ==============================================
    // SECCIÓN HOY
    // ==============================================
    const priorityLabels = ['', 'Muy Baja', 'Baja', 'Media', 'Alta', 'Muy Alta'];

    function getSaludoHora() {
        const h = new Date().getHours();
        if (h < 12) return 'Buenos días';
        if (h < 18) return 'Buenas tardes';
        return 'Buenas noches';
    }

    function updateMetrics(tareasHoy) {
        const total = tareasHoy.length;
        const completadas = tareasHoy.filter(t => t.estado === 'completada').length;
        const pendientes = total - completadas;
        const porcentaje = total > 0 ? Math.round((completadas / total) * 100) : 0;

        const mTotal = document.getElementById('metric-total');
        const mCompletadas = document.getElementById('metric-completadas');
        const mPendientes = document.getElementById('metric-pendientes');
        const mPorcentaje = document.getElementById('metric-porcentaje');
        const mBarFill = document.getElementById('progress-bar-fill');

        if(mTotal) mTotal.textContent = total;
        if(mCompletadas) mCompletadas.textContent = completadas;
        if(mPendientes) mPendientes.textContent = pendientes;
        if(mPorcentaje) mPorcentaje.textContent = porcentaje + '%';
        if(mBarFill) mBarFill.style.width = porcentaje + '%';

        const saludo = document.getElementById('saludo-dinamico');
        if (saludo) saludo.textContent = `${getSaludoHora()}, ${usuario.nombre} 👋`;
        
        const resumen = document.getElementById('resumen-dia');
        if (resumen) {
            if (total === 0) {
                resumen.textContent = 'No tienes actividades para hoy. ¡Planifica tu día!';
            } else if (completadas === total) {
                resumen.textContent = '🎉 ¡Completaste todas tus tareas de hoy! Excelente trabajo.';
            } else {
                resumen.textContent = `Tienes ${pendientes} tarea${pendientes > 1 ? 's' : ''} pendiente${pendientes > 1 ? 's' : ''} y has completado ${completadas}.`;
            }
        }

        const fraseEl = document.getElementById('frase-motivacional');
        if (fraseEl) {
            fraseEl.innerHTML = `💡 <em>"${obtenerFraseDiaria(new Date())}"</em>`;
        }
    }

    function renderHoy() {
        const grid = document.getElementById('lista-tareas-hoy-grid');
        if (!grid) return;

        // Filtrar únicamente tareas de la fecha de hoy
        const tareasHoy = globalTareas.filter(t => t.fecha === todayISO);
        
        tareasHoy.sort((a, b) => {
            if (a.orden !== b.orden) return a.orden - b.orden;
            if (a.estado === 'completada' && b.estado !== 'completada') return 1;
            if (a.estado !== 'completada' && b.estado === 'completada') return -1;
            if (a.hora && b.hora) return a.hora.localeCompare(b.hora);
            if (a.hora && !b.hora) return -1;
            if (!a.hora && b.hora) return 1;
            return 0;
        });

        // Aplicar filtros activos (proyecto / estado)
        const tareasFiltradas = applyFiltersToTasks(tareasHoy);

        updateMetrics(tareasFiltradas);
        grid.innerHTML = '';

        if (tareasHoy.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📝</div>
                    <p>No tienes actividades pautadas para hoy. Haz clic en <strong>"+ Nueva Actividad"</strong> para empezar a planificar.</p>
                </div>
            `;
            return;
        }

        // Variable para controlar si el arrastre se inició desde el tirador
        let isDraggingFromHandle = false;

        tareasFiltradas.forEach((t, index) => {
            const isCompletada = t.estado === 'completada';
            const prioridad = t.prioridad || 3;
            const proyectoNombre = getProyectoNombre(t.proyecto_id);

            // 1. CONSTRUIR EL HTML DE LAS SUBTAREAS EXISTENTES
            let subtareasHTML = '';
            if (t.subtareas && t.subtareas.length > 0) {
                subtareasHTML = `<div class="subtareas-container" style="margin: 0.8rem 0; padding-left: 0.2rem; display: flex; flex-direction: column; gap: 0.5rem;">`;
                t.subtareas.forEach(sub => {
                    const isSubDone = sub.completada === 1;
                    subtareasHTML += `
                        <div class="subtarea-item" style="display: flex; align-items: center; gap: 0.6rem; font-size: 0.85rem;">
                            <input type="checkbox" 
                                   class="check-subtarea" 
                                   data-sub-id="${sub.id}" 
                                   ${isSubDone ? 'checked' : ''} 
                                   style="cursor: pointer; accent-color: #2563eb;">
                            <span style="${isSubDone ? 'text-decoration: line-through; opacity: 0.5;' : 'color: var(--text-primary);'} flex: 1;">
                                ${sub.descripcion}
                            </span>
                            <button class="btn-eliminar-subtarea" data-sub-id="${sub.id}" style="background: none; border: none; color: #ef4444; cursor: pointer; opacity: 0.6; font-size: 0.8rem; padding: 0 0.2rem;">✕</button>
                        </div>
                    `;
                });
                subtareasHTML += `</div>`;
            }

            // 1.5. CONSTRUIR EL PROGRESO DE SUBTAREAS
            let progressHTML = '';
            if (t.subtareas && t.subtareas.length > 0) {
                const completedCount = t.subtareas.filter(sub => sub.completada === 1).length;
                const totalCount = t.subtareas.length;
                const percent = Math.round((completedCount / totalCount) * 100);
                progressHTML = `
                    <div class="task-progress-container" style="margin-top: 0.5rem; margin-bottom: 0.5rem;">
                        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.2rem;">
                            <span>Progreso de pasos</span>
                            <span>${completedCount}/${totalCount} (${percent}%)</span>
                        </div>
                        <div style="width: 100%; height: 4px; background: rgba(255, 255, 255, 0.1); border-radius: 2px; overflow: hidden;">
                            <div style="width: ${percent}%; height: 100%; background: linear-gradient(90deg, #3b82f6, #10b981); transition: width 0.3s ease;"></div>
                        </div>
                    </div>
                `;
            }

            // 2. CONSTRUIR EL FORMULARIO COMPACTO PARA AÑADIR SUBTAREAS
            const inputSubtareaHTML = `
                <div class="add-subtarea-inline" style="display: flex; gap: 0.4rem; margin-top: 0.6rem; margin-bottom: 0.6rem; padding-top: 0.5rem; border-top: 1px solid var(--glass-border, rgba(255,255,255,0.1));">
                    <input type="text" 
                           placeholder="Añadir paso..." 
                           class="input-nueva-subtarea" 
                           style="flex: 1; padding: 0.2rem 0.5rem; font-size: 0.8rem; border-radius: 4px; border: 1px solid var(--glass-border, rgba(255,255,255,0.1)); background: rgba(0,0,0,0.2); color: var(--text-primary); outline: none;">
                    <button class="btn-add-subtarea" 
                            style="padding: 0.2rem 0.5rem; font-size: 0.8rem; background: #2563eb; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">
                        +
                    </button>
                </div>
            `;

            const item = document.createElement('div');
            item.className = 'timeline-item';
            item.style.animationDelay = `${index * 0.05}s`;
            item.setAttribute('draggable', 'true');
            item.setAttribute('data-task-id', t.id);

            item.innerHTML = `
                <div class="timeline-dot ${isCompletada ? 'completed' : ''}" 
                     title="${isCompletada ? 'Marcar como pendiente' : 'Completar tarea'}"
                     data-task-id="${t.id}" 
                     data-new-estado="${isCompletada ? 'pendiente' : 'completada'}">
                </div>
                <div class="timeline-card ${isCompletada ? 'completed' : ''}" data-task-index="${index}">
                    <div class="timeline-card-header">
                        <div style="display: flex; align-items: center; gap: 0.5rem; flex: 1;">
                            <div class="drag-handle" title="Arrastrar para reordenar">⋮⋮</div>
                            <h4 class="${isCompletada ? 'done' : ''}">${t.titulo}</h4>
                        </div>
                        ${isCompletada ? '<span class="pill pill-status-done">✓ Completada</span>' : '<span class="pill pill-status-pending">Pendiente</span>'}
                    </div>
                    
                    ${progressHTML}
                    ${subtareasHTML}
                    ${inputSubtareaHTML}

                    <div class="timeline-card-footer">
                        ${t.hora ? `<span class="pill pill-time">🕒 ${t.hora}</span>` : ''}
                        <span class="pill pill-priority-${prioridad}">P${prioridad} ${priorityLabels[prioridad]}</span>
                        ${t.proyecto_id ? `<span class="pill pill-project">📁 ${proyectoNombre}</span>` : ''}
                    </div>
                </div>
            `;

            // EVENTO: Checkbox principal de la tarea
            const dot = item.querySelector('.timeline-dot');
            if (dot) {
                dot.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const taskId = dot.getAttribute('data-task-id');
                    const newEstado = dot.getAttribute('data-new-estado');
                    toggleTarea(parseInt(taskId), newEstado);
                });
            }

            // EVENTO: Abrir modal al hacer clic en la tarjeta (solo si no se interactúa con subtareas ni se arrastra)
            const card = item.querySelector('.timeline-card');
            if (card) {
                card.addEventListener('click', () => abrirModalTarea(t));
            }

            // Evitamos que al hacer clic dentro de las subtareas se abra el modal de la tarea
            const subContainer = item.querySelector('.subtareas-container');
            if (subContainer) {
                subContainer.addEventListener('click', (e) => e.stopPropagation());
            }
            const addSubContainer = item.querySelector('.add-subtarea-inline');
            if (addSubContainer) {
                addSubContainer.addEventListener('click', (e) => e.stopPropagation());
            }

            // CONTROLADOR: Cambiar estado de un Checkbox de subtarea
            item.querySelectorAll('.check-subtarea').forEach(chk => {
                chk.addEventListener('change', async () => {
                    const subId = chk.getAttribute('data-sub-id');
                    const completada = chk.checked ? 1 : 0;
                    try {
                        const response = await fetch(`/api/tareas/subtareas/${subId}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ completada })
                        });
                        if (response.ok) {
                            await cargarTodasLasTareas();
                            renderHoy();
                        }
                    } catch (error) {
                        console.error("Error al actualizar la subtarea:", error);
                    }
                });
            });

            // CONTROLADOR: Eliminar una subtarea (botón ✕)
            item.querySelectorAll('.btn-eliminar-subtarea').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const subId = btn.getAttribute('data-sub-id');
                    try {
                        const response = await fetch(`/api/tareas/subtareas/${subId}`, {
                            method: 'DELETE'
                        });
                        if (response.ok) {
                            await cargarTodasLasTareas();
                            renderHoy();
                        }
                    } catch (error) {
                        console.error("Error al eliminar la subtarea:", error);
                    }
                });
            });

            // CONTROLADOR: Guardar una nueva subtarea (Botón "+" o tecla Enter)
            const btnAdd = item.querySelector('.btn-add-subtarea');
            const inputAdd = item.querySelector('.input-nueva-subtarea');
            
            if (btnAdd && inputAdd) {
                const ejecutarGuardadoSubtarea = async () => {
                    const descripcion = inputAdd.value.trim();
                    if (!descripcion) return;

                    try {
                        const response = await fetch(`/api/tareas/${t.id}/subtareas`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ descripcion })
                        });
                        if (response.ok) {
                            inputAdd.value = '';
                            await cargarTodasLasTareas();
                            renderHoy();
                        }
                    } catch (error) {
                        console.error("Error al crear subtarea:", error);
                    }
                };

                btnAdd.addEventListener('click', ejecutarGuardadoSubtarea);
                inputAdd.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') ejecutarGuardadoSubtarea();
                });
            }

            // ==============================================
            // EVENTOS DE DRAG & DROP PARA CADA ITEM
            // ==============================================
            const handle = item.querySelector('.drag-handle');
            if (handle) {
                handle.addEventListener('mousedown', () => {
                    isDraggingFromHandle = true;
                });
                handle.addEventListener('mouseup', () => {
                    isDraggingFromHandle = false;
                });
            }

            item.addEventListener('dragstart', (e) => {
                if (!isDraggingFromHandle) {
                    e.preventDefault();
                    return;
                }
                item.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', t.id);
            });

            item.addEventListener('dragend', async () => {
                item.classList.remove('dragging');
                isDraggingFromHandle = false;
                
                // Al terminar de arrastrar, leemos el nuevo orden desde el DOM
                const currentItems = [...grid.querySelectorAll('.timeline-item')];
                const ordenamiento = currentItems.map((ci, idx) => {
                    const dot = ci.querySelector('.timeline-dot');
                    return {
                        id: parseInt(dot.getAttribute('data-task-id')),
                        orden: idx + 1
                    };
                });
                
                // Guardar en la base de datos
                try {
                    const response = await fetch('/api/tareas/reordenar/bulk', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ordenamiento })
                    });
                    if (response.ok) {
                        // Actualizar en memoria local
                        ordenamiento.forEach(ord => {
                            const taskObj = globalTareas.find(gt => gt.id === ord.id);
                            if (taskObj) taskObj.orden = ord.orden;
                        });
                        // Volver a renderizar
                        renderHoy();
                    }
                } catch (error) {
                    console.error("Error al persistir el reordenamiento:", error);
                }
            });

            grid.appendChild(item);
        });

        // Configurar el evento dragover una vez en el contenedor
        grid.ondragover = (e) => {
            e.preventDefault();
            const draggingItem = grid.querySelector('.timeline-item.dragging');
            if (!draggingItem) return;
            
            const afterElement = getDragAfterElement(grid, e.clientY);
            if (afterElement == null) {
                grid.appendChild(draggingItem);
            } else {
                grid.insertBefore(draggingItem, afterElement);
            }
        };
    }

    function getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.timeline-item:not(.dragging)')];
        
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    function renderVencidas() {
        const grid = document.getElementById('lista-tareas-vencidas-grid');
        if (!grid) return;

        // Filtrar tareas pendientes del pasado
        const tareasVencidas = globalTareas.filter(t => {
            return t.fecha && t.fecha < todayISO && t.estado !== 'completada';
        });

        // Ordenar: primero las más antiguas (fecha ASC) y luego por hora
        tareasVencidas.sort((a, b) => {
            if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha);
            if (a.hora && b.hora) return a.hora.localeCompare(b.hora);
            if (a.hora && !b.hora) return -1;
            if (!a.hora && b.hora) return 1;
            return 0;
        });

        grid.innerHTML = '';

        if (tareasVencidas.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🎉</div>
                    <p style="font-size: 1.1rem; color: var(--text-secondary);">¡No tienes tareas vencidas! Estás completamente al día.</p>
                </div>
            `;
            return;
        }

        tareasVencidas.forEach((t, index) => {
            const isCompletada = t.estado === 'completada';
            const prioridad = t.prioridad || 3;
            const proyectoNombre = getProyectoNombre(t.proyecto_id);

            // 1. CONSTRUIR EL HTML DE LAS SUBTAREAS EXISTENTES
            let subtareasHTML = '';
            if (t.subtareas && t.subtareas.length > 0) {
                subtareasHTML = `<div class="subtareas-container" style="margin: 0.8rem 0; padding-left: 0.2rem; display: flex; flex-direction: column; gap: 0.5rem;">`;
                t.subtareas.forEach(sub => {
                    const isSubDone = sub.completada === 1;
                    subtareasHTML += `
                        <div class="subtarea-item" style="display: flex; align-items: center; gap: 0.6rem; font-size: 0.85rem;">
                            <input type="checkbox" 
                                   class="check-subtarea-vencida" 
                                   data-sub-id="${sub.id}" 
                                   ${isSubDone ? 'checked' : ''} 
                                   style="cursor: pointer; accent-color: #2563eb;">
                            <span style="${isSubDone ? 'text-decoration: line-through; opacity: 0.5;' : 'color: var(--text-primary);'} flex: 1;">
                                ${sub.descripcion}
                            </span>
                            <button class="btn-eliminar-subtarea-vencida" data-sub-id="${sub.id}" style="background: none; border: none; color: #ef4444; cursor: pointer; opacity: 0.6; font-size: 0.8rem; padding: 0 0.2rem;">✕</button>
                        </div>
                    `;
                });
                subtareasHTML += `</div>`;
            }

            // 1.5. CONSTRUIR EL PROGRESO DE SUBTAREAS
            let progressHTML = '';
            if (t.subtareas && t.subtareas.length > 0) {
                const completedCount = t.subtareas.filter(sub => sub.completada === 1).length;
                const totalCount = t.subtareas.length;
                const percent = Math.round((completedCount / totalCount) * 100);
                progressHTML = `
                    <div class="task-progress-container" style="margin-top: 0.5rem; margin-bottom: 0.5rem;">
                        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.2rem;">
                            <span>Progreso de pasos</span>
                            <span>${completedCount}/${totalCount} (${percent}%)</span>
                        </div>
                        <div style="width: 100%; height: 4px; background: rgba(255, 255, 255, 0.1); border-radius: 2px; overflow: hidden;">
                            <div style="width: ${percent}%; height: 100%; background: linear-gradient(90deg, #3b82f6, #10b981); transition: width 0.3s ease;"></div>
                        </div>
                    </div>
                `;
            }

            // 2. CONSTRUIR EL FORMULARIO COMPACTO PARA AÑADIR SUBTAREAS
            const inputSubtareaHTML = `
                <div class="add-subtarea-inline-vencida" style="display: flex; gap: 0.4rem; margin-top: 0.6rem; margin-bottom: 0.6rem; padding-top: 0.5rem; border-top: 1px solid var(--glass-border, rgba(255,255,255,0.1));">
                    <input type="text" 
                           placeholder="Añadir paso..." 
                           class="input-nueva-subtarea-vencida" 
                           style="flex: 1; padding: 0.2rem 0.5rem; font-size: 0.8rem; border-radius: 4px; border: 1px solid var(--glass-border, rgba(255,255,255,0.1)); background: rgba(0,0,0,0.2); color: var(--text-primary); outline: none;">
                    <button class="btn-add-subtarea-vencida" 
                            style="padding: 0.2rem 0.5rem; font-size: 0.8rem; background: #2563eb; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">
                        +
                    </button>
                </div>
            `;

            const item = document.createElement('div');
            item.className = 'timeline-item';
            item.style.animationDelay = `${index * 0.05}s`;

            item.innerHTML = `
                <div class="timeline-dot vencida" 
                     title="Completar tarea"
                     data-task-id="${t.id}" 
                     data-new-estado="completada">
                </div>
                <div class="timeline-card vencida" data-task-index="${index}">
                    <div class="timeline-card-header">
                        <h4 style="color: var(--text-primary); font-weight: 600;">${t.titulo}</h4>
                        <div style="display: flex; gap: 0.4rem; align-items: center;">
                            <span class="pill pill-overdue">⚠️ Vencida</span>
                        </div>
                    </div>
                    
                    ${progressHTML}
                    ${subtareasHTML}
                    ${inputSubtareaHTML}

                    <div class="timeline-card-footer">
                        <span class="pill pill-time" style="background: rgba(239, 68, 68, 0.15); color: var(--danger);">📅 ${t.fecha}</span>
                        ${t.hora ? `<span class="pill pill-time">🕒 ${t.hora}</span>` : ''}
                        <span class="pill pill-priority-${prioridad}">P${prioridad} ${priorityLabels[prioridad]}</span>
                        ${t.proyecto_id ? `<span class="pill pill-project">📁 ${proyectoNombre}</span>` : ''}
                    </div>
                </div>
            `;

            // EVENTO: Checkbox principal de la tarea
            const dot = item.querySelector('.timeline-dot');
            if (dot) {
                dot.addEventListener('click', (e) => {
                    e.stopPropagation();
                    toggleTarea(t.id, 'completada');
                });
            }

            // EVENTO: Abrir modal al hacer clic en la tarjeta
            const card = item.querySelector('.timeline-card');
            if (card) {
                card.addEventListener('click', () => abrirModalTarea(t));
            }

            // Prevenir propagación de clicks
            const subContainer = item.querySelector('.subtareas-container');
            if (subContainer) {
                subContainer.addEventListener('click', (e) => e.stopPropagation());
            }
            const addSubContainer = item.querySelector('.add-subtarea-inline-vencida');
            if (addSubContainer) {
                addSubContainer.addEventListener('click', (e) => e.stopPropagation());
            }

            // Checkbox subtarea
            item.querySelectorAll('.check-subtarea-vencida').forEach(chk => {
                chk.addEventListener('change', async () => {
                    const subId = chk.getAttribute('data-sub-id');
                    const completada = chk.checked ? 1 : 0;
                    try {
                        const response = await fetch(`/api/tareas/subtareas/${subId}`, {
                           method: 'PUT',
                           headers: { 'Content-Type': 'application/json' },
                           body: JSON.stringify({ completada })
                        });
                        if (response.ok) {
                            await cargarTodasLasTareas();
                            renderVencidas();
                        }
                    } catch (error) {
                        console.error(error);
                    }
                });
            });

            // Eliminar subtarea
            item.querySelectorAll('.btn-eliminar-subtarea-vencida').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const subId = btn.getAttribute('data-sub-id');
                    try {
                        const response = await fetch(`/api/tareas/subtareas/${subId}`, { method: 'DELETE' });
                        if (response.ok) {
                            await cargarTodasLasTareas();
                            renderVencidas();
                        }
                    } catch (error) {
                        console.error(error);
                    }
                });
            });

            // Guardar nueva subtarea inline
            const btnAdd = item.querySelector('.btn-add-subtarea-vencida');
            const inputAdd = item.querySelector('.input-nueva-subtarea-vencida');
            if (btnAdd && inputAdd) {
                const ejecutarGuardado = async () => {
                    const descripcion = inputAdd.value.trim();
                    if (!descripcion) return;
                    try {
                        const response = await fetch(`/api/tareas/${t.id}/subtareas`, {
                           method: 'POST',
                           headers: { 'Content-Type': 'application/json' },
                           body: JSON.stringify({ descripcion })
                        });
                        if (response.ok) {
                            inputAdd.value = '';
                            await cargarTodasLasTareas();
                            renderVencidas();
                        }
                    } catch (error) {
                        console.error(error);
                    }
                };
                btnAdd.addEventListener('click', ejecutarGuardado);
                inputAdd.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') ejecutarGuardado();
                });
            }

            grid.appendChild(item);
        });
    }

    // ==============================================
    // SECCIÓN PRÓXIMO (CALENDARIO)
    // ==============================================
    function renderCalendar() {
        if (!calendarDays || !monthYearText) return;
        calendarDays.innerHTML = '';
        
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        
        const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
        monthYearText.textContent = `${monthNames[month]} ${year}`;

        for (let i = 0; i < firstDay; i++) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'calendar-day empty';
            calendarDays.appendChild(emptyDiv);
        }

        const selectedISO = formatISODate(selectedDate);

        for (let i = 1; i <= daysInMonth; i++) {
            const dayDiv = document.createElement('div');
            dayDiv.className = 'calendar-day';
            dayDiv.textContent = i;
            
            const cellDate = new Date(year, month, i);
            const cellISO = formatISODate(cellDate);

            if (cellISO === todayISO) dayDiv.classList.add('today');
            if (cellISO === selectedISO) dayDiv.classList.add('active');

            const hasTasks = globalTareas.some(t => t.fecha === cellISO && t.estado !== 'completada');
            if (hasTasks) {
                const dot = document.createElement('div');
                dot.className = 'task-dot';
                dayDiv.appendChild(dot);
            }

            dayDiv.addEventListener('click', () => {
                selectedDate = cellDate;
                if (selectedDateTitle) selectedDateTitle.textContent = `Actividades del Día: ${cellISO}`;
                renderCalendar();
                cargarDatosProximo();
            });

            calendarDays.appendChild(dayDiv);
        }
    }

    function cargarDatosProximo() {
        const lista = document.getElementById('lista-tareas-proximo');
        if (!lista) return;

        const fechaStr = formatISODate(selectedDate);
        const tareasDia = globalTareas.filter(t => t.fecha === fechaStr);
        
        lista.innerHTML = '';

        if(tareasDia.length === 0){
             lista.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.9rem;">Sin tareas pautadas para este día.</p>';
             return;
        }

        tareasDia.forEach(t => {
            const div = document.createElement('div');
            div.className = 'item-card';
            div.style.cursor = 'pointer';
            const isCompletada = t.estado === 'completada';
            let progressSuffix = '';
            if (t.subtareas && t.subtareas.length > 0) {
                const completedCount = t.subtareas.filter(sub => sub.completada === 1).length;
                progressSuffix = ` <span style="font-size: 0.8rem; color: var(--text-secondary); font-weight: normal;">(${completedCount}/${t.subtareas.length} pasos)</span>`;
            }

            div.innerHTML = `
                <div class="item-info" style="flex:1;">
                    <h4 style="${isCompletada ? 'text-decoration: line-through; opacity: 0.7;' : ''}">${t.titulo}${progressSuffix}</h4>
                    <p>${t.hora ? t.hora + ' | ' : ''}${getProyectoNombre(t.proyecto_id)}</p>
                </div>
                <button class="btn btn-sm ${isCompletada ? 'btn-outline' : 'btn-primary'} btn-prox-toggle" data-task-id="${t.id}" data-target-state="${isCompletada ? 'pendiente' : 'completada'}" style="margin-right: 0.5rem;">
                    ${isCompletada ? 'Reabrir' : 'Completar'}
                </button>
            `;
            
            div.addEventListener('click', (e) => {
                if(!e.target.classList.contains('btn-prox-toggle')) {
                    abrirModalTarea(t);
                }
            });

            const btnToggle = div.querySelector('.btn-prox-toggle');
            if (btnToggle) {
                btnToggle.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const tId = e.target.getAttribute('data-task-id');
                    const nState = e.target.getAttribute('data-target-state');
                    toggleTarea(parseInt(tId), nState);
                });
            }

            lista.appendChild(div);
        });
    }

    const prevMonthBtn = document.getElementById('prev-month');
    if (prevMonthBtn) {
        prevMonthBtn.addEventListener('click', () => {
            currentDate.setMonth(currentDate.getMonth() - 1);
            renderCalendar();
        });
    }

    const nextMonthBtn = document.getElementById('next-month');
    if (nextMonthBtn) {
        nextMonthBtn.addEventListener('click', () => {
            currentDate.setMonth(currentDate.getMonth() + 1);
            renderCalendar();
        });
    }

    // ==============================================
    // SECCIÓN REPORTES
    // ==============================================
    let chartEstado = null;
    let chartSemanal = null;
    const chartColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

    function renderReportes() {
        const total = globalTareas.length;
        const completadas = globalTareas.filter(t => t.estado === 'completada').length;
        const pendientes = total - completadas;
        const tasa = total > 0 ? Math.round((completadas / total) * 100) : 0;

        const rTotal = document.getElementById('rep-total-global');
        const rCompletas = document.getElementById('rep-completadas-global');
        const rPendientes = document.getElementById('rep-pendientes-global');
        const rTasa = document.getElementById('rep-tasa-global');

        if(rTotal) rTotal.textContent = total;
        if(rCompletas) rCompletas.textContent = completadas;
        if(rPendientes) rPendientes.textContent = pendientes;
        if(rTasa) rTasa.textContent = tasa + '%';

        renderChartEstado(completadas, pendientes);
        renderChartSemanal();
        renderProyectosBreakdown();
        renderHistorialFiltrado();
    }

    // ==============================================
    // EXPORTACIÓN DE REPORTES (CSV & PDF)
    // ==============================================
    const btnExportarCSV = document.getElementById('btn-exportar-csv');
    if (btnExportarCSV) {
        btnExportarCSV.addEventListener('click', () => {
            const data = globalTareas;
            if (data.length === 0) {
                mostrarAlertaPersonalizada('No hay tareas registradas para exportar.', 'error');
                return;
            }
            
            let csv = '\uFEFF'; // BOM para asegurar compatibilidad de acentos UTF-8 en Excel
            csv += ['ID', 'Actividad', 'Fecha', 'Hora', 'Prioridad', 'Estado', 'Proyecto', 'Pasos Totales', 'Pasos Completados', 'Notas', 'Descripción'].join(';') + '\r\n';
            
            data.forEach(t => {
                const proyectoNombre = getProyectoNombre(t.proyecto_id);
                const prioritadTexto = `Prioridad ${t.prioridad || 3}`;
                const totalPasos = t.subtareas ? t.subtareas.length : 0;
                const completedPasos = t.subtareas ? t.subtareas.filter(sub => sub.completada === 1).length : 0;
                
                const row = [
                    t.id,
                    t.titulo,
                    t.fecha || 'Sin fecha',
                    t.hora || 'Sin hora',
                    prioritadTexto,
                    t.estado === 'completada' ? 'Completada' : 'Pendiente',
                    proyectoNombre,
                    totalPasos,
                    completedPasos,
                    t.notas || '',
                    t.descripcion || ''
                ].map(escapeCSV);
                
                csv += row.join(';') + '\r\n';
            });
            
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.setAttribute('href', url);
            link.setAttribute('download', `AlDia_Reporte_Productividad_${formatISODate(new Date())}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    }

    function escapeCSV(val) {
        if (val === null || val === undefined) return '';
        let str = String(val).replace(/"/g, '""');
        if (str.includes(';') || str.includes(',') || str.includes('\n') || str.includes('"')) {
            str = `"${str}"`;
        }
        return str;
    }

    const btnExportarPDF = document.getElementById('btn-exportar-pdf');
    if (btnExportarPDF) {
        btnExportarPDF.addEventListener('click', () => {
            const data = globalTareas;
            if (data.length === 0) {
                mostrarAlertaPersonalizada('No hay tareas registradas para generar el reporte.', 'error');
                return;
            }
            
            const total = data.length;
            const completadas = data.filter(t => t.estado === 'completada').length;
            const pendientes = total - completadas;
            const tasa = total > 0 ? Math.round((completadas / total) * 100) : 0;
            
            // Construir tabla de progreso por proyecto
            let proyectosHTML = '';
            const grupos = {};
            proyectos.forEach(p => {
                const tareasP = data.filter(t => t.proyecto_id === p.id);
                if (tareasP.length > 0) {
                    const comp = tareasP.filter(t => t.estado === 'completada').length;
                    grupos[p.id] = { nombre: p.nombre, total: tareasP.length, completadas: comp };
                }
            });
            const individuales = data.filter(t => !t.proyecto_id);
            if (individuales.length > 0) {
                const comp = individuales.filter(t => t.estado === 'completada').length;
                grupos['sin-proyecto'] = { nombre: 'Sin Proyecto (Individuales)', total: individuales.length, completadas: comp };
            }
            
            Object.values(grupos).forEach(g => {
                const pct = Math.round((g.completadas / g.total) * 100);
                proyectosHTML += `
                    <tr>
                        <td><strong>📁 ${g.nombre}</strong></td>
                        <td>${g.total}</td>
                        <td>${g.completadas}</td>
                        <td>${pct}%</td>
                    </tr>
                `;
            });
            
            // Construir historial de tareas
            let tareasHTML = '';
            const tareasOrdenadas = [...data].sort((a, b) => {
                if (a.fecha !== b.fecha) return (b.fecha || '').localeCompare(a.fecha || '');
                return (b.hora || '').localeCompare(a.hora || '');
            });
            
            tareasOrdenadas.forEach(t => {
                const projName = getProyectoNombre(t.proyecto_id);
                const steps = t.subtareas && t.subtareas.length > 0
                    ? `(${t.subtareas.filter(s => s.completada === 1).length}/${t.subtareas.length} pasos)`
                    : '';
                tareasHTML += `
                    <tr>
                        <td>${t.fecha || 'Sin fecha'} ${t.hora ? ' - ' + t.hora : ''}</td>
                        <td><strong>${t.titulo}</strong> ${steps ? '<br><small style="color:#64748b;">' + steps + '</small>' : ''}</td>
                        <td>${projName}</td>
                        <td>P${t.prioridad || 3}</td>
                        <td><span class="status-badge ${t.estado}">${t.estado === 'completada' ? 'Completada' : 'Pendiente'}</span></td>
                    </tr>
                `;
            });
            
            const printWindow = window.open('', '_blank');
            printWindow.document.write(`
                <!DOCTYPE html>
                <html lang="es">
                <head>
                    <meta charset="UTF-8">
                    <title>Reporte de Productividad - Al Día</title>
                    <style>
                        body {
                            font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                            color: #1e293b;
                            margin: 0;
                            padding: 2.5rem;
                            background-color: #ffffff;
                            line-height: 1.5;
                        }
                        .header {
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            border-bottom: 2px solid #e2e8f0;
                            padding-bottom: 1.5rem;
                            margin-bottom: 2rem;
                        }
                        .header h1 {
                            margin: 0;
                            font-size: 2.2rem;
                            color: #10b981;
                            letter-spacing: -0.025em;
                        }
                        .header-meta {
                            text-align: right;
                            font-size: 0.9rem;
                            color: #64748b;
                        }
                        .section-title {
                            font-size: 1.3rem;
                            color: #0f172a;
                            border-bottom: 1px solid #e2e8f0;
                            padding-bottom: 0.5rem;
                            margin-top: 2rem;
                            margin-bottom: 1rem;
                            font-weight: 600;
                        }
                        .metrics-grid {
                            display: grid;
                            grid-template-columns: repeat(4, 1fr);
                            gap: 1rem;
                            margin-bottom: 2.5rem;
                        }
                        .metric-card {
                            background: #f8fafc;
                            border: 1px solid #e2e8f0;
                            border-radius: 8px;
                            padding: 1.2rem 1rem;
                            text-align: center;
                        }
                        .metric-card .val {
                            font-size: 2rem;
                            font-weight: 700;
                            color: #0f172a;
                            margin-bottom: 0.2rem;
                        }
                        .metric-card .lbl {
                            font-size: 0.75rem;
                            color: #64748b;
                            text-transform: uppercase;
                            font-weight: 600;
                            letter-spacing: 0.05em;
                        }
                        table {
                            width: 100%;
                            border-collapse: collapse;
                            margin-bottom: 2rem;
                            font-size: 0.9rem;
                        }
                        th, td {
                            border: 1px solid #e2e8f0;
                            padding: 0.8rem 1rem;
                            text-align: left;
                        }
                        th {
                            background-color: #f8fafc;
                            color: #475569;
                        }
                        .status-badge {
                            display: inline-block;
                            padding: 0.25rem 0.6rem;
                            border-radius: 12px;
                            font-size: 0.75rem;
                            font-weight: 600;
                            text-transform: uppercase;
                            letter-spacing: 0.02em;
                        }
                        .status-badge.completada {
                            background-color: #d1fae5;
                            color: #065f46;
                        }
                        .status-badge.pendiente {
                            background-color: #fef3c7;
                            color: #92400e;
                        }
                        @media print {
                            body { padding: 0; }
                            tr { page-break-inside: avoid; }
                            thead { display: table-header-group; }
                        }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <div>
                            <h1>Al Día</h1>
                            <p style="margin: 0.2rem 0 0 0; color: #64748b; font-size: 1.05rem;">Reporte de Productividad Personal</p>
                        </div>
                        <div class="header-meta">
                            <p style="margin: 0; font-weight: 600; font-size: 1.05rem;">Usuario: ${usuario.nombre}</p>
                            <p style="margin: 0.2rem 0 0 0;">Generado el: ${new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                    </div>
                    
                    <div class="metrics-grid">
                        <div class="metric-card">
                            <div class="val">${total}</div>
                            <div class="lbl">Tareas Totales</div>
                        </div>
                        <div class="metric-card">
                            <div class="val" style="color: #10b981;">${completadas}</div>
                            <div class="lbl">Completadas</div>
                        </div>
                        <div class="metric-card">
                            <div class="val" style="color: #f59e0b;">${pendientes}</div>
                            <div class="lbl">Pendientes</div>
                        </div>
                        <div class="metric-card">
                            <div class="val" style="color: #3b82f6;">${tasa}%</div>
                            <div class="lbl">Tasa de Éxito</div>
                        </div>
                    </div>
                    
                    <div class="section-title">Rendimiento por Proyecto</div>
                    <table>
                        <thead>
                            <tr>
                                <th>Proyecto</th>
                                <th>Tareas Asignadas</th>
                                <th>Tareas Completadas</th>
                                <th>Progreso</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${proyectosHTML}
                        </tbody>
                    </table>
                    
                    <div class="section-title">Historial Detallado de Actividades</div>
                    <table>
                        <thead>
                            <tr>
                                <th>Fecha / Hora</th>
                                <th>Actividad / Pasos</th>
                                <th>Proyecto</th>
                                <th>Prioridad</th>
                                <th>Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tareasHTML}
                        </tbody>
                    </table>
                    
                    <script>
                        window.onload = function() {
                            window.print();
                        };
                    </script>
                </body>
                </html>
            `);
            printWindow.document.close();
        });
    }

    function renderChartEstado(completadas, pendientes) {
        const canvas = document.getElementById('chart-estado');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (chartEstado) chartEstado.destroy();
        const isDark = document.body.classList.contains('dark-mode');
        
        chartEstado = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Completadas', 'Pendientes'],
                datasets: [{
                    data: [completadas, pendientes],
                    backgroundColor: ['#10b981', '#f59e0b'],
                    borderColor: isDark ? '#1e293b' : '#ffffff',
                    borderWidth: 3,
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true,
                cutout: '65%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: isDark ? '#f8fafc' : '#1e293b', padding: 15, font: { family: 'Inter', size: 13 } }
                    }
                }
            }
        });
    }

    function renderChartSemanal() {
        const canvas = document.getElementById('chart-semanal');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (chartSemanal) chartSemanal.destroy();
        const isDark = document.body.classList.contains('dark-mode');

        const labels = [];
        const dataCompletadas = [];
        const dataCreadas = [];
        const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const iso = formatISODate(d);
            labels.push(dayNames[d.getDay()] + ' ' + d.getDate());
            
            dataCreadas.push(globalTareas.filter(t => t.fecha === iso).length);
            dataCompletadas.push(globalTareas.filter(t => t.fecha === iso && t.estado === 'completada').length);
        }

        chartSemanal = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Creadas',
                        data: dataCreadas,
                        backgroundColor: isDark ? 'rgba(96, 165, 250, 0.6)' : 'rgba(59, 130, 246, 0.6)',
                        borderColor: isDark ? '#60a5fa' : '#3b82f6',
                        borderWidth: 1,
                        borderRadius: 6
                    },
                    {
                        label: 'Completadas',
                        data: dataCompletadas,
                        backgroundColor: isDark ? 'rgba(52, 211, 153, 0.6)' : 'rgba(16, 185, 129, 0.6)',
                        borderColor: isDark ? '#34d399' : '#10b981',
                        borderWidth: 1,
                        borderRadius: 6
                    }
                ]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { stepSize: 1, color: isDark ? '#94a3b8' : '#64748b', font: { family: 'Inter' } },
                        grid: { color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }
                    },
                    x: {
                        ticks: { color: isDark ? '#94a3b8' : '#64748b', font: { family: 'Inter', size: 11 } },
                        grid: { display: false }
                    }
                },
                plugins: {
                    legend: { labels: { color: isDark ? '#f8fafc' : '#1e293b', font: { family: 'Inter', size: 12 } } }
                }
            }
        });
    }

    function renderProyectosBreakdown() {
        const container = document.getElementById('reporte-proyectos-breakdown');
        if (!container) return;
        container.innerHTML = '';

        const grupos = {};
        const individuales = globalTareas.filter(t => !t.proyecto_id);
        if (individuales.length > 0) {
            const comp = individuales.filter(t => t.estado === 'completada').length;
            grupos['sin-proyecto'] = { nombre: 'Sin Proyecto', total: individuales.length, completadas: comp };
        }

        proyectos.forEach(p => {
            const tareasP = globalTareas.filter(t => t.proyecto_id === p.id);
            if (tareasP.length > 0) {
                const comp = tareasP.filter(t => t.estado === 'completada').length;
                grupos[p.id] = { nombre: p.nombre, total: tareasP.length, completadas: comp };
            }
        });

        const entries = Object.values(grupos);
        if (entries.length === 0) {
            container.innerHTML = '<p style="color: var(--text-secondary);">No hay datos de proyectos todavía.</p>';
            return;
        }

        entries.forEach((g, i) => {
            const pct = Math.round((g.completadas / g.total) * 100);
            const color = chartColors[i % chartColors.length];
            const item = document.createElement('div');
            item.className = 'project-breakdown-item';
            item.innerHTML = `
                <div style="font-size: 1.5rem; width: 40px; text-align: center;">📁</div>
                <div class="project-breakdown-info">
                    <h4>${g.nombre}</h4>
                    <p>${g.completadas} de ${g.total} completadas</p>
                    <div class="project-breakdown-bar-bg">
                        <div class="project-breakdown-bar-fill" style="width: ${pct}%; background: ${color};"></div>
                    </div>
                </div>
                <div class="project-breakdown-percentage" style="color: ${color};">${pct}%</div>
            `;
            container.appendChild(item);
        });
    }

    function renderHistorialFiltrado() {
        const filtroSelect = document.getElementById('filtro-proyecto-reporte');
        const lista = document.getElementById('lista-reportes');
        if (!filtroSelect || !lista) return;

        const filtro = filtroSelect.value;
        lista.innerHTML = '';

        let terminadas = globalTareas.filter(t => t.estado === 'completada');

        if (filtro === 'individuales') {
            terminadas = terminadas.filter(t => !t.proyecto_id);
        } else if (filtro !== 'todos') {
            terminadas = terminadas.filter(t => t.proyecto_id === parseInt(filtro));
        }

        terminadas.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

        if (terminadas.length === 0) {
            lista.innerHTML = '<p style="color: var(--text-secondary);">No hay actividades completadas para este filtro.</p>';
            return;
        }

        terminadas.forEach(t => {
            const div = document.createElement('div');
            div.className = 'item-card';
            div.style.cursor = 'pointer';
            const prioridad = t.prioridad || 3;
            div.innerHTML = `
                <div class="item-info" style="flex: 1;">
                    <h4>${t.titulo}</h4>
                    <p>📅 ${t.fecha || 'Sin fecha'} ${t.hora ? '🕒 ' + t.hora : ''} | 📁 ${getProyectoNombre(t.proyecto_id)}</p>
                </div>
                <span class="pill pill-priority-${prioridad}" style="margin-left: 0.5rem;">P${prioridad}</span>
                <span class="pill pill-status-done" style="margin-left: 0.5rem;">✓</span>
            `;
            div.onclick = () => abrirModalTarea(t);
            lista.appendChild(div);
        });
    }

    const filtroProyectoReporte = document.getElementById('filtro-proyecto-reporte');
    if (filtroProyectoReporte) {
        filtroProyectoReporte.addEventListener('change', renderHistorialFiltrado);
    }

    // ==============================================
    // MODAL DETALLES DE TAREA (VISTA DINÁMICA DE EDICIÓN)
    // ==============================================
    let currentTaskInModal = null;
    
    window.abrirModalTarea = (tarea) => {
        currentTaskInModal = tarea;
        const modal = document.getElementById('task-detail-modal');
        const modalBody = document.getElementById('task-modal-body');
        if (!modal || !modalBody) return;

        // Renderizar por defecto el modo Vista de Lectura
        renderModoLecturaTarea();
        modal.classList.remove('hidden');
    }

    function renderModoLecturaTarea() {
        const modalBody = document.getElementById('task-modal-body');
        const t = currentTaskInModal;
        const isCompletada = t.estado === 'completada';
        const proyectoNombre = getProyectoNombre(t.proyecto_id);
        const prioridad = t.prioridad || 3;

        modalBody.innerHTML = `
            <span class="close-modal" id="close-task-detail">&times;</span>
            <h2 style="margin-bottom: 1rem; color: var(--accent); padding-right: 2rem;">${t.titulo}</h2>
            <div style="display: flex; flex-direction: column; gap: 1rem; font-size: 1.1rem;">
                <p><strong>Fecha Pautada:</strong> <span>${t.fecha || 'Sin fecha'}</span> <span style="color: var(--text-secondary);">${t.hora ? ' a las ' + t.hora : ''}</span></p>
                <p><strong>Proyecto:</strong> <span>${proyectoNombre}</span></p>
                <p><strong>Prioridad:</strong> <span class="pill pill-priority-${prioridad}">P${prioridad} ${priorityLabels[prioridad]}</span></p>
                <p><strong>Estado:</strong> <span>${isCompletada ? 'Completada' : 'Pendiente'}</span></p>
                
                <div style="background: var(--input-bg); padding: 1rem; border-radius: 8px; border: 1px solid var(--glass-border);">
                    <strong style="color: var(--accent);">Descripción:</strong>
                    <p style="font-size: 0.95rem; margin-top: 0.5rem; white-space: pre-wrap;">${t.descripcion || 'Sin descripción...'}</p>
                </div>

                <div id="modal-task-checklist-container" style="background: var(--input-bg); padding: 1rem; border-radius: 8px; border: 1px solid var(--glass-border);">
                    <strong style="color: var(--accent); display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                        <span>Pasos internos (Checklist):</span>
                        <span id="modal-task-checklist-progress" style="font-size: 0.8rem; font-weight: normal; color: var(--text-secondary);"></span>
                    </strong>
                    
                    <div id="modal-task-checklist-bar-bg" style="width: 100%; height: 4px; background: rgba(255, 255, 255, 0.1); border-radius: 2px; overflow: hidden; margin-bottom: 0.8rem; display: none;">
                        <div id="modal-task-checklist-bar-fill" style="width: 0%; height: 100%; background: linear-gradient(90deg, #3b82f6, #10b981); transition: width 0.3s ease;"></div>
                    </div>
                    
                    <div id="modal-task-subtareas-list" style="display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 0.8rem;"></div>
                    
                    <div style="display: flex; gap: 0.4rem; border-top: 1px solid var(--glass-border); padding-top: 0.6rem;">
                        <input type="text" id="modal-input-nueva-subtarea" placeholder="Añadir paso..." class="form-control" style="flex: 1; padding: 0.3rem 0.6rem; font-size: 0.85rem; border-radius: 6px; border: 1px solid var(--glass-border); background: rgba(0,0,0,0.2); color: var(--text-primary); outline: none;">
                        <button id="modal-btn-add-subtarea" class="btn btn-primary" style="padding: 0.3rem 0.8rem; font-size: 0.85rem; font-weight: bold; border-radius: 6px;">+</button>
                    </div>
                </div>
                
                <div style="background: var(--input-bg); padding: 1rem; border-radius: 8px; border: 1px solid var(--glass-border);">
                    <strong style="color: var(--warning);">Notas:</strong>
                    <p style="font-size: 0.95rem; margin-top: 0.5rem; white-space: pre-wrap;">${t.notas || 'Sin notas adicionales...'}</p>
                </div>
            </div>
            <div style="margin-top: 2rem; display: flex; gap: 0.5rem; flex-wrap: wrap;">
                <button id="modal-task-toggle-btn" class="btn ${isCompletada ? 'btn-outline' : 'btn-primary'}">${isCompletada ? 'Reabrir Tarea' : 'Completar Tarea'}</button>
                <button id="modal-task-edit-btn" class="btn btn-outline">✏️ Editar</button>
                <button id="modal-task-delete-btn" class="btn btn-danger">Eliminar</button>
            </div>
        `;

        document.getElementById('close-task-detail').onclick = () => document.getElementById('task-detail-modal').classList.add('hidden');
        
        // Renderizar la checklist del modal
        const renderModalChecklist = () => {
            const listContainer = document.getElementById('modal-task-subtareas-list');
            const progressText = document.getElementById('modal-task-checklist-progress');
            const progressBg = document.getElementById('modal-task-checklist-bar-bg');
            const progressFill = document.getElementById('modal-task-checklist-bar-fill');
            
            if (!listContainer) return;
            
            listContainer.innerHTML = '';
            const subs = t.subtareas || [];
            
            if (subs.length === 0) {
                listContainer.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.85rem; margin: 0.2rem 0;">No hay pasos definidos para esta actividad.</p>';
                progressText.textContent = '';
                progressBg.style.display = 'none';
            } else {
                progressBg.style.display = 'block';
                const doneCount = subs.filter(s => s.completada === 1).length;
                const percent = Math.round((doneCount / subs.length) * 100);
                progressText.textContent = `${doneCount}/${subs.length} (${percent}%)`;
                progressFill.style.width = `${percent}%`;
                
                subs.forEach(sub => {
                    const isSubDone = sub.completada === 1;
                    const div = document.createElement('div');
                    div.style.display = 'flex';
                    div.style.alignItems = 'center';
                    div.style.gap = '0.6rem';
                    div.style.fontSize = '0.9rem';
                    
                    div.innerHTML = `
                        <input type="checkbox" 
                               class="modal-check-subtarea" 
                               data-sub-id="${sub.id}" 
                               ${isSubDone ? 'checked' : ''} 
                               style="cursor: pointer; accent-color: #2563eb;">
                        <span style="${isSubDone ? 'text-decoration: line-through; opacity: 0.5;' : 'color: var(--text-primary);'} flex: 1;">
                            ${sub.descripcion}
                        </span>
                        <button class="modal-btn-eliminar-subtarea" data-sub-id="${sub.id}" style="background: none; border: none; color: #ef4444; cursor: pointer; opacity: 0.6; font-size: 0.85rem; padding: 0 0.2rem;">✕</button>
                    `;
                    
                    div.querySelector('.modal-check-subtarea').onchange = async (e) => {
                        const completada = e.target.checked ? 1 : 0;
                        try {
                            const res = await fetch(`/api/tareas/subtareas/${sub.id}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ completada })
                            });
                            if (res.ok) {
                                sub.completada = completada;
                                await cargarTodasLasTareas();
                                const updatedTask = globalTareas.find(gt => gt.id === t.id);
                                if (updatedTask) t.subtareas = updatedTask.subtareas;
                                renderModalChecklist();
                                refrescarPantallaActiva();
                            }
                        } catch (err) {
                            console.error(err);
                        }
                    };
                    
                    div.querySelector('.modal-btn-eliminar-subtarea').onclick = async () => {
                        try {
                            const res = await fetch(`/api/tareas/subtareas/${sub.id}`, { method: 'DELETE' });
                            if (res.ok) {
                                t.subtareas = t.subtareas.filter(s => s.id !== sub.id);
                                await cargarTodasLasTareas();
                                renderModalChecklist();
                                refrescarPantallaActiva();
                            }
                        } catch (err) {
                            console.error(err);
                        }
                    };
                    
                    listContainer.appendChild(div);
                });
            }
        };

        renderModalChecklist();

        const btnAddSub = document.getElementById('modal-btn-add-subtarea');
        const inputAddSub = document.getElementById('modal-input-nueva-subtarea');
        
        if (btnAddSub && inputAddSub) {
            const addSubtarea = async () => {
                const descripcion = inputAddSub.value.trim();
                if (!descripcion) return;
                
                try {
                    const res = await fetch(`/api/tareas/${t.id}/subtareas`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ descripcion })
                    });
                    if (res.ok) {
                        const nuevaSub = await res.json();
                        if (!t.subtareas) t.subtareas = [];
                        t.subtareas.push(nuevaSub);
                        inputAddSub.value = '';
                        await cargarTodasLasTareas();
                        renderModalChecklist();
                        refrescarPantallaActiva();
                    }
                } catch (err) {
                    console.error(err);
                }
            };
            
            btnAddSub.onclick = addSubtarea;
            inputAddSub.onkeypress = (e) => {
                if (e.key === 'Enter') addSubtarea();
            };
        }

        document.getElementById('modal-task-toggle-btn').onclick = async () => {
            const newEstado = t.estado === 'completada' ? 'pendiente' : 'completada';
            await ejecutarToggleEstadoTarea(t.id, newEstado);
        };

        document.getElementById('modal-task-delete-btn').onclick = async () => {
            if(confirm('¿Estás seguro de que deseas eliminar esta tarea?')) {
                await fetch(`/api/tareas/${t.id}`, { method: 'DELETE' });
                document.getElementById('task-detail-modal').classList.add('hidden');
                await cargarTodasLasTareas();
                refrescarPantallaActiva();
            }
        };

        document.getElementById('modal-task-edit-btn').onclick = () => {
            renderModoEdicionTarea();
        };
    }

    function renderModoEdicionTarea() {
        const modalBody = document.getElementById('task-modal-body');
        const t = currentTaskInModal;

        // Construir opciones de proyectos dinámicamente
        let opcionesProyectos = '<option value="">Sin Proyecto</option>';
        proyectos.forEach(p => {
            opcionesProyectos += `<option value="${p.id}" ${parseInt(t.proyecto_id) === p.id ? 'selected' : ''}>${p.nombre}</option>`;
        });

        modalBody.innerHTML = `
            <h3 style="color: var(--accent); margin-bottom: 1.5rem;">Editar Actividad</h3>
            <form id="form-modal-editar-tarea" style="display: flex; flex-direction: column; gap: 1rem;">
                <div>
                    <label style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.3rem; display: block;">Nombre de la actividad</label>
                    <input type="text" id="edit-modal-titulo" value="${t.titulo}" required class="form-control" style="width:100%; padding: 0.7rem; border-radius: 6px; border: 1px solid var(--glass-border); background: var(--bg-card); color: var(--text-primary);">
                </div>

                <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
                    <div style="flex: 1; min-width: 140px;">
                        <label style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.3rem; display: block;">Fecha</label>
                        <input type="date" id="edit-modal-fecha" value="${t.fecha || ''}" required class="form-control" style="width:100%; padding: 0.7rem; border-radius: 6px; border: 1px solid var(--glass-border); background: var(--bg-card); color: var(--text-primary);">
                    </div>
                    <div style="flex: 1; min-width: 100px;">
                        <label style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.3rem; display: block;">Hora</label>
                        <input type="time" id="edit-modal-hora" value="${t.hora || ''}" class="form-control" style="width:100%; padding: 0.7rem; border-radius: 6px; border: 1px solid var(--glass-border); background: var(--bg-card); color: var(--text-primary);">
                    </div>
                </div>

                <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
                    <div style="flex: 1; min-width: 150px;">
                        <label style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.3rem; display: block;">Prioridad</label>
                        <select id="edit-modal-prioridad" class="form-control" style="width:100%; padding: 0.7rem; border-radius: 6px; border: 1px solid var(--glass-border); background: var(--bg-card); color: var(--text-primary);">
                            <option value="1" ${parseInt(t.prioridad) === 1 ? 'selected' : ''}>1 - Muy Baja</option>
                            <option value="2" ${parseInt(t.prioridad) === 2 ? 'selected' : ''}>2 - Baja</option>
                            <option value="3" ${parseInt(t.prioridad) === 3 ? 'selected' : ''}>3 - Media</option>
                            <option value="4" ${parseInt(t.prioridad) === 4 ? 'selected' : ''}>4 - Alta</option>
                            <option value="5" ${parseInt(t.prioridad) === 5 ? 'selected' : ''}>5 - Muy Alta</option>
                        </select>
                    </div>
                    <div style="flex: 1; min-width: 150px;">
                        <label style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.3rem; display: block;">Proyecto Asignado</label>
                        <select id="edit-modal-proyecto" class="form-control" style="width:100%; padding: 0.7rem; border-radius: 6px; border: 1px solid var(--glass-border); background: var(--bg-card); color: var(--text-primary);">
                            ${opcionesProyectos}
                        </select>
                    </div>
                </div>

                <div>
                    <label style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.3rem; display: block;">Descripción</label>
                    <textarea id="edit-modal-descripcion" rows="2" class="form-control" style="width:100%; padding: 0.7rem; border-radius: 6px; border: 1px solid var(--glass-border); background: var(--bg-card); color: var(--text-primary);">${t.descripcion || ''}</textarea>
                </div>

                <div>
                    <label style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.3rem; display: block;">Notas</label>
                    <textarea id="edit-modal-notas" rows="2" class="form-control" style="width:100%; padding: 0.7rem; border-radius: 6px; border: 1px solid var(--glass-border); background: var(--bg-card); color: var(--text-primary);">${t.notas || ''}</textarea>
                </div>

                <div style="margin-top: 1rem; display: flex; gap: 0.5rem;">
                    <button type="submit" class="btn btn-primary" style="flex:1;">💾 Guardar Cambios</button>
                    <button type="button" id="btn-cancelar-edicion-tarea" class="btn btn-outline" style="flex:1;">Cancelar</button>
                </div>
            </form>
        `;

        document.getElementById('btn-cancelar-edicion-tarea').onclick = () => renderModoLecturaTarea();

        const formEditar = document.getElementById('form-modal-editar-tarea');
        formEditar.onsubmit = async (e) => {
            e.preventDefault();
            
            const tituloNuevo = document.getElementById('edit-modal-titulo').value.trim();
            
            if(!tituloNuevo) {
                mostrarAlertaPersonalizada('El nombre de la actividad es obligatorio.', 'error');
                return;
            }

            // Realizar validación estricta contra duplicados
            if (validarTareaDuplicada(tituloNuevo, t.id)) {
                mostrarAlertaPersonalizada(`Ya tienes una actividad registrada con el nombre "${tituloNuevo}" (los nombres no pueden repetirse, ignorando acentos y mayúsculas).`, 'error');
                return;
            }

            const payload = {
                titulo: tituloNuevo,
                fecha: document.getElementById('edit-modal-fecha').value,
                hora: document.getElementById('edit-modal-hora').value || null,
                prioridad: parseInt(document.getElementById('edit-modal-prioridad').value),
                proyecto_id: document.getElementById('edit-modal-proyecto').value || null,
                descripcion: document.getElementById('edit-modal-descripcion').value,
                notas: document.getElementById('edit-modal-notas').value,
                estado: t.estado // Mantener el estado actual
            };

            try {
                const response = await fetch(`/api/tareas/${t.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (response.ok) {
                    // Actualizar el objeto en memoria local y regresar a vista lectura actualizada
                    currentTaskInModal = { ...t, ...payload };
                    await cargarTodasLasTareas();
                    renderModoLecturaTarea();
                    refrescarPantallaActiva();
                } else {
                    mostrarAlertaPersonalizada('Ocurrió un error en el servidor al intentar guardar los cambios.', 'error');
                }
            } catch (err) {
                console.error(err);
            }
        };
    }

    async function ejecutarToggleEstadoTarea(id, estado) {
        await fetch(`/api/tareas/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ estado })
        });
        await cargarTodasLasTareas();
        // Marcar éxito del día si corresponde (no se revierte al reabrir)
        try { markTodaySuccessIfApplicable(); } catch (e) { console.error(e); }
        
        // Sincronizar el objeto modal activo
        if(currentTaskInModal && currentTaskInModal.id === id) {
            currentTaskInModal.estado = estado;
            renderModoLecturaTarea();
        }
        refrescarPantallaActiva();
    }

    window.toggleTarea = async (id, estado) => {
        await ejecutarToggleEstadoTarea(id, estado);
    };

    // ==============================================
    // MODAL PROYECTOS (ABRIR / RENOMBRAR / ELIMINAR / CONTROL TAREAS)
    // ==============================================
    window.eliminarProyectoRapido = async (proyectoId, proyectoNombre) => {
        if (confirm(`¿Estás completamente seguro de eliminar el proyecto "${proyectoNombre}" y todas sus actividades?`)) {
            try {
                const response = await fetch(`/api/proyectos/${proyectoId}`, { method: 'DELETE' });
                if (response.ok) {
                    const modal = document.getElementById('project-modal');
                    if (modal && modal.getAttribute('data-current-proyecto-id') == proyectoId) {
                        modal.classList.add('hidden');
                    }
                    await cargarProyectos();
                    await cargarTodasLasTareas();
                    refrescarPantallaActiva();
                } else {
                    mostrarAlertaPersonalizada('Error al intentar eliminar el proyecto.', 'error');
                }
            } catch (error) {
                console.error("Error eliminando proyecto:", error);
            }
        }
    };

    window.abrirModalProyecto = (proyectoId, proyectoNombre) => {
        const modal = document.getElementById('project-modal');
        if (!modal) return;

        const headerContainer = modal.querySelector('.project-modal-header');
        
        modal.setAttribute('data-current-proyecto-id', proyectoId);
        
        // Limpiar y resetear el formulario interno del proyecto al abrir
        const formProjInterno = document.getElementById('form-tarea-proyecto-interno');
        if(formProjInterno) formProjInterno.reset();
        document.getElementById('contenedor-form-proyecto-interno').classList.add('hidden');

        // Buscar el proyecto actual para obtener su emoji y color
        const isNoProject = proyectoId === 'no-project' || proyectoId === null || proyectoId === undefined;
        const proyectoActual = isNoProject ? null : proyectos.find(p => p.id === proyectoId);
        const currentEmoji = proyectoActual ? (proyectoActual.emoji || '📁') : '📁';
        const currentColor = proyectoActual ? (proyectoActual.color || '#3b82f6') : '#3b82f6';

        // Calcular estadísticas del proyecto
        const tareasDelProyecto = isNoProject ? globalTareas.filter(t => !t.proyecto_id) : globalTareas.filter(t => t.proyecto_id === parseInt(proyectoId));
        const totalTareas = tareasDelProyecto.length;
        const completadas = tareasDelProyecto.filter(t => t.estado === 'completada').length;
        const porcentaje = totalTareas > 0 ? Math.round((completadas / totalTareas) * 100) : 0;

        if (headerContainer) {
            headerContainer.innerHTML = `
                <div class="project-title-container" style="display: flex; flex-direction: column; gap: 0.3rem; flex: 1;">
                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                        <span style="font-size: 1.75rem; width: 42px; height: 42px; display: inline-flex; align-items: center; justify-content: center; border-radius: 12px; background: ${currentColor}18; border: 1px solid ${currentColor}30;">${currentEmoji}</span>
                        <div>
                            <h3 id="modal-project-title" style="margin: 0; font-size: 1.35rem; font-weight: 700; letter-spacing: -0.02em;">${proyectoNombre}</h3>
                            <p class="project-modal-subtitle">${totalTareas} actividad${totalTareas !== 1 ? 'es' : ''} · ${completadas} completada${completadas !== 1 ? 's' : ''} · ${porcentaje}%</p>
                        </div>
                    </div>
                </div>
                    <div class="project-actions-container" style="display: flex; align-items: center; gap: 0.4rem;">
                        ${isNoProject ? '' : '<button id="btn-comenzar-renombrar" class="nav-circle-btn" style="width: 34px; height: 34px; font-size: 0.95rem;" title="Editar Proyecto">✏️</button>'}
                        ${isNoProject ? '' : '<button id="btn-eliminar-proyecto" class="nav-circle-btn" style="width: 34px; height: 34px; font-size: 0.95rem;" title="Eliminar Proyecto">🗑️</button>'}
                        <button id="close-project-modal" class="close-project-modal-circle" title="Cerrar">&times;</button>
                    </div>
            `;
        }

        document.getElementById('close-project-modal').onclick = () => modal.classList.add('hidden');

        // Lógica para renombrar y editar proyecto
        const btnComenzarRenombrar = document.getElementById('btn-comenzar-renombrar');
        if (!isNoProject && btnComenzarRenombrar && headerContainer) {
            btnComenzarRenombrar.addEventListener('click', () => {
                const container = headerContainer.querySelector('.project-title-container');
                if (!container) return;

                container.innerHTML = `
                    <div style="display: flex; flex-direction: column; gap: 0.5rem; width: 100%;">
                        <input type="text" id="input-renombrar-proyecto" value="${proyectoNombre}" 
                               style="padding: 0.4rem; border-radius: 4px; border: 1px solid var(--glass-border); background: var(--input-bg); color: var(--text-primary); font-size: 1.1rem; width: 100%;" required />
                        <div style="display: flex; gap: 0.5rem; width: 100%;">
                            <select id="select-renombrar-emoji" style="flex: 1; padding: 0.4rem; border-radius: 4px; border: 1px solid var(--glass-border); background: var(--input-bg); color: var(--text-primary); font-size: 0.85rem;">
                                <option value="📁">📁 Folder</option>
                                <option value="🚀">🚀 Lanzamiento</option>
                                <option value="💼">💼 Trabajo</option>
                                <option value="🛒">🛒 Compras</option>
                                <option value="📚">📚 Estudios</option>
                                <option value="💻">💻 Programación</option>
                                <option value="🎨">🎨 Diseño</option>
                                <option value="🏠">🏠 Hogar</option>
                                <option value="🔥">🔥 Metas</option>
                                <option value="🎯">🎯 Enfoque</option>
                            </select>
                            <select id="select-renombrar-color" style="flex: 1; padding: 0.4rem; border-radius: 4px; border: 1px solid var(--glass-border); background: var(--input-bg); color: var(--text-primary); font-size: 0.85rem;">
                                <option value="#3b82f6">🔵 Azul</option>
                                <option value="#10b981">🟢 Verde</option>
                                <option value="#f59e0b">🟡 Amarillo</option>
                                <option value="#ef4444">🔴 Rojo</option>
                                <option value="#8b5cf6">🟣 Morado</option>
                                <option value="#ec4899">💗 Rosa</option>
                                <option value="#06b6d4">🔵 Cyan</option>
                            </select>
                        </div>
                        <div style="display: flex; gap: 0.5rem;">
                            <button id="btn-guardar-proyecto" class="btn btn-sm btn-primary" style="padding: 0.4rem 0.8rem; flex: 1;">💾 Guardar</button>
                            <button id="btn-cancelar-proyecto" class="btn btn-sm btn-outline" style="padding: 0.4rem 0.8rem; flex: 1;">X</button>
                        </div>
                    </div>
                `;

                const selectEmoji = document.getElementById('select-renombrar-emoji');
                const selectColor = document.getElementById('select-renombrar-color');
                if (selectEmoji) selectEmoji.value = currentEmoji;
                if (selectColor) selectColor.value = currentColor;

                document.getElementById('btn-cancelar-proyecto').onclick = () => abrirModalProyecto(proyectoId, proyectoNombre);

                document.getElementById('btn-guardar-proyecto').onclick = async () => {
                    const inputRenombrar = document.getElementById('input-renombrar-proyecto');
                    const selEmoji = document.getElementById('select-renombrar-emoji');
                    const selColor = document.getElementById('select-renombrar-color');

                    const nuevoNombre = inputRenombrar ? inputRenombrar.value.trim() : '';
                    const nuevoEmoji = selEmoji ? selEmoji.value : '📁';
                    const nuevoColor = selColor ? selColor.value : '#3b82f6';

                    if(!nuevoNombre) {
                        mostrarAlertaPersonalizada('El nombre del proyecto no puede estar vacío.', 'error');
                        return;
                    }
                    try {
                        const response = await fetch(`/api/proyectos/${proyectoId}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ 
                                nombre: nuevoNombre, 
                                emoji: nuevoEmoji, 
                                color: nuevoColor, 
                                usuario_id: usuario.id 
                            })
                        });
                        
                        if(response.ok) {
                            await cargarProyectos();
                            abrirModalProyecto(proyectoId, nuevoNombre);
                            refrescarPantallaActiva();
                        } else {
                            const err = await response.json();
                            mostrarAlertaPersonalizada(err.error || 'Error al actualizar el proyecto.', 'error');
                        }
                    } catch (error) {
                        console.error("Error al renombrar el proyecto:", error);
                    }
                };
            });
        }

        // Lógica para eliminar proyecto (no disponible para 'Sin proyecto')
        if (!isNoProject) {
            const btnEliminar = document.getElementById('btn-eliminar-proyecto');
            if (btnEliminar) {
                btnEliminar.onclick = async () => {
                    if (confirm(`¿Estás completamente seguro de eliminar el proyecto "${proyectoNombre}" y todas sus actividades?`)) {
                        try {
                            const response = await fetch(`/api/proyectos/${proyectoId}`, { method: 'DELETE' });
                            if (response.ok) {
                                modal.classList.add('hidden');
                                await cargarProyectos();
                                await cargarTodasLasTareas();
                                refrescarPantallaActiva();
                            }
                        } catch (error) {
                            console.error("Error eliminando proyecto:", error);
                        }
                    }
                };
            }
        }

        // Renderizar sub-tareas de la carpeta
        refrescarTareasModalProyecto(proyectoId);
        modal.classList.remove('hidden');
    };

    function refrescarTareasModalProyecto(proyectoId) {
        const taskList = document.getElementById('modal-project-tasks');
        if (!taskList) return;
        taskList.innerHTML = '';

        const isNoProject = proyectoId === 'no-project' || proyectoId === null || proyectoId === undefined;
        const tareasProyecto = isNoProject ? globalTareas.filter(t => !t.proyecto_id) : globalTareas.filter(t => t.proyecto_id === parseInt(proyectoId));
        
        if (tareasProyecto.length === 0) {
            taskList.innerHTML = `
                <div style="text-align: center; padding: 2.5rem 1rem; color: var(--text-secondary);">
                    <p style="font-size: 2rem; margin-bottom: 0.5rem;">📋</p>
                    <p style="font-size: 0.9rem; font-weight: 500;">No hay actividades en este proyecto todavía</p>
                    <p style="font-size: 0.8rem; opacity: 0.7;">Agrega tu primera actividad con el botón de arriba</p>
                </div>`;
            return;
        }

        tareasProyecto.forEach(t => {
            const div = document.createElement('div');
            const isCompletada = t.estado === 'completada';
            div.className = 'modal-item-card' + (isCompletada ? ' completed' : '');

            // Badge soft
            let badgeClass = 'badge-soft-pendiente';
            let estadoText = 'Pendiente';
            if (isCompletada) { badgeClass = 'badge-soft-completada'; estadoText = 'Completada'; }

            // Mini progress bar para subtareas
            let progressHTML = '';
            if (t.subtareas && t.subtareas.length > 0) {
                const completedCount = t.subtareas.filter(sub => sub.completada === 1).length;
                const pct = Math.round((completedCount / t.subtareas.length) * 100);
                progressHTML = `
                    <div class="task-mini-progress-wrapper">
                        <div class="task-mini-progress-bg">
                            <div class="task-mini-progress-fill" style="width: ${pct}%;"></div>
                        </div>
                        <span class="task-mini-progress-text">${completedCount}/${t.subtareas.length}</span>
                    </div>`;
            }

            // Fecha formateada
            let fechaDisplay = '';
            if (t.fecha) {
                const parts = t.fecha.split('-');
                if (parts.length === 3) {
                    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
                    fechaDisplay = `${parseInt(parts[2])} ${meses[parseInt(parts[1]) - 1]}`;
                } else {
                    fechaDisplay = t.fecha;
                }
            }

            div.innerHTML = `
                <div class="task-checkbox-circle ${isCompletada ? 'completed' : ''}" 
                     data-task-id="${t.id}" data-current-state="${t.estado}" title="${isCompletada ? 'Reabrir' : 'Completar'}"></div>
                <div style="flex: 1; min-width: 0;">
                    <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                        <span style="font-weight: 600; font-size: 0.95rem; ${isCompletada ? 'text-decoration: line-through; opacity: 0.65;' : ''}">${t.titulo}</span>
                        <span class="badge ${badgeClass}" style="font-size: 0.7rem; padding: 0.15rem 0.55rem; border-radius: 12px;">${estadoText}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 0.6rem; margin-top: 0.3rem; flex-wrap: wrap;">
                        ${fechaDisplay ? `<span style="font-size: 0.78rem; color: var(--text-secondary);">📅 ${fechaDisplay}</span>` : ''}
                        ${t.hora ? `<span style="font-size: 0.78rem; color: var(--text-secondary);">🕒 ${t.hora}</span>` : ''}
                    </div>
                    ${progressHTML}
                </div>
            `;

            // Clic en la tarjeta abre el modal de detalles
            div.addEventListener('click', (e) => {
                if (!e.target.classList.contains('task-checkbox-circle')) {
                    abrirModalTarea(t);
                }
            });

            // Clic en el checkbox circular alterna el estado
            const checkbox = div.querySelector('.task-checkbox-circle');
            if (checkbox) {
                checkbox.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const tId = parseInt(e.target.getAttribute('data-task-id'));
                    const cState = e.target.getAttribute('data-current-state');
                    const nState = cState === 'completada' ? 'pendiente' : 'completada';
                    await ejecutarToggleEstadoTarea(tId, nState);
                });
            }

            taskList.appendChild(div);
        });
    }

    // ==============================================
    // CONTROL DEL FORMULARIO INTERNO DE PROYECTOS
    // ==============================================
    const btnMostrarFormProjInterno = document.getElementById('btn-mostrar-form-proj-interno');
    const btnCerrarFormProjInterno = document.getElementById('btn-cerrar-form-proj-interno');
    const contenedorFormProjInterno = document.getElementById('contenedor-form-proyecto-interno');

    if(btnMostrarFormProjInterno && contenedorFormProjInterno) {
        btnMostrarFormProjInterno.onclick = () => {
            contenedorFormProjInterno.classList.remove('hidden');
            // Colocar por defecto la fecha de hoy en el input del modal por comodidad
            document.getElementById('fecha-proj-interno').value = todayISO;
        };
    }

    if(btnCerrarFormProjInterno && contenedorFormProjInterno) {
        btnCerrarFormProjInterno.onclick = () => {
            contenedorFormProjInterno.classList.add('hidden');
            builderProyecto.clear();
        };
    }

    const formTareaProyectoInterno = document.getElementById('form-tarea-proyecto-interno');
    if (formTareaProyectoInterno) {
        formTareaProyectoInterno.onsubmit = async (e) => {
            e.preventDefault();
            const modalProyecto = document.getElementById('project-modal');
            const proyectoId = modalProyecto ? modalProyecto.getAttribute('data-current-proyecto-id') : null;
            
            if(!proyectoId) return;

            const tituloNuevaTarea = document.getElementById('titulo-proj-interno').value.trim();

            if(!tituloNuevaTarea) {
                mostrarAlertaPersonalizada('El nombre de la actividad no puede estar vacío.', 'error');
                return;
            }

            // Validar nombres duplicados de forma estricta global
            if (validarTareaDuplicada(tituloNuevaTarea)) {
                mostrarAlertaPersonalizada(`Ya tienes una actividad registrada con el nombre "${tituloNuevaTarea}" en tu agenda (los nombres son únicos, ignorando acentos y mayúsculas).`, 'error');
                return;
            }

            const payload = {
                titulo: tituloNuevaTarea,
                fecha: document.getElementById('fecha-proj-interno').value,
                hora: document.getElementById('hora-proj-interno').value || null,
                prioridad: parseInt(document.getElementById('prioridad-proj-interno').value),
                proyecto_id: parseInt(proyectoId),
                descripcion: document.getElementById('desc-proj-interno').value,
                notas: document.getElementById('notas-proj-interno').value,
                usuario_id: usuario.id,
                subtareas: builderProyecto.getItems()
            };

            const res = await fetch('/api/tareas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                e.target.reset();
                builderProyecto.clear();
                if (contenedorFormProjInterno) contenedorFormProjInterno.classList.add('hidden');
                await cargarTodasLasTareas();
                refrescarPantallaActiva();
            } else {
                mostrarAlertaPersonalizada('Hubo un error al intentar crear la actividad.', 'error');
            }
        };
    }

    // ==============================================
    // MANEJO DE UI PANTALLA PRINCIPAL: FORM HOY
    // ==============================================
    const btnMostrarFormHoy = document.getElementById('btn-mostrar-form-hoy');
    const btnCerrarFormHoy = document.getElementById('btn-cerrar-form-hoy');
    const contenedorFormHoy = document.getElementById('contenedor-form-hoy');

    if(btnMostrarFormHoy && contenedorFormHoy) {
        btnMostrarFormHoy.addEventListener('click', () => {
            contenedorFormHoy.classList.remove('hidden');
            contenedorFormHoy.scrollIntoView({ behavior: 'smooth' });
        });
    }

    if(btnCerrarFormHoy && contenedorFormHoy) {
        btnCerrarFormHoy.addEventListener('click', (e) => {
            e.preventDefault();
            contenedorFormHoy.classList.add('hidden');
            builderHoy.clear();
        });
    }

    // ==============================================
    // MANEJO DE FORMULARIOS PRINCIPALES (CON VALIDACIÓN DE DUPLICADOS)
    // ==============================================
    // Toggle para mostrar/ocultar creación de proyectos inline en la sidebar
    const btnMostrarCrearProj = document.getElementById('btn-mostrar-crear-proyecto');
    const btnCancelarCrearProj = document.getElementById('btn-cancelar-crear-proyecto');
    const formProyectoCont = document.getElementById('form-proyecto');

    if (btnMostrarCrearProj && formProyectoCont) {
        btnMostrarCrearProj.addEventListener('click', () => {
            btnMostrarCrearProj.classList.add('hidden');
            formProyectoCont.classList.remove('hidden');
            const inputProjName = document.getElementById('nombre-proyecto');
            if (inputProjName) inputProjName.focus();
        });
    }

    if (btnCancelarCrearProj && formProyectoCont && btnMostrarCrearProj) {
        btnCancelarCrearProj.addEventListener('click', () => {
            formProyectoCont.classList.add('hidden');
            btnMostrarCrearProj.classList.remove('hidden');
            formProyectoCont.reset();
        });
    }

    const formProyecto = document.getElementById('form-proyecto');
    if (formProyecto) {
        formProyecto.addEventListener('submit', async (e) => {
            e.preventDefault();
            const inputProyecto = document.getElementById('nombre-proyecto');
            const selectEmoji = document.getElementById('emoji-proyecto');
            const selectColor = document.getElementById('color-proyecto');

            const nombre = inputProyecto ? inputProyecto.value.trim() : '';
            const emoji = selectEmoji ? selectEmoji.value : '📁';
            const color = selectColor ? selectColor.value : '#3b82f6';
            if(!nombre) return;
            
            const res = await fetch('/api/proyectos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nombre, emoji, color, usuario_id: usuario.id })
            });

            if (res.ok) {
                if (formProyectoCont) {
                    formProyectoCont.reset();
                    formProyectoCont.classList.add('hidden');
                }
                if (btnMostrarCrearProj) {
                    btnMostrarCrearProj.classList.remove('hidden');
                }
                await cargarProyectos();
                refrescarPantallaActiva();
            } else {
                const err = await res.json();
                mostrarAlertaPersonalizada(err.error || 'Error al procesar la solicitud.', 'error');
            }
        });
    }

    const formTareaHoy = document.getElementById('form-tarea-hoy');
    if (formTareaHoy) {
        formTareaHoy.addEventListener('submit', async (e) => {
            e.preventDefault();
            const tituloNuevaTarea = document.getElementById('titulo-tarea-hoy').value.trim();

            if (validarTareaDuplicada(tituloNuevaTarea)) {
                mostrarAlertaPersonalizada(`Ya tienes una actividad registrada con el nombre "${tituloNuevaTarea}" (los nombres no pueden repetirse, ignorando acentos y mayúsculas).`, 'error');
                return;
            }

            const payload = {
                titulo: tituloNuevaTarea,
                hora: document.getElementById('hora-tarea-hoy').value || null,
                prioridad: parseInt(document.getElementById('prioridad-tarea-hoy').value),
                proyecto_id: document.getElementById('proyecto-tarea-hoy').value || null,
                descripcion: document.getElementById('descripcion-tarea-hoy').value,
                notas: document.getElementById('notas-tarea-hoy').value,
                recordatorio_minutos: (function(){ const v = document.getElementById('recordatorio-tarea-hoy'); return v ? parseInt(v.value) : -1; })(),
                usuario_id: usuario.id,
                fecha: todayISO,
                subtareas: builderHoy.getItems()
            };
            
            await fetch('/api/tareas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            e.target.reset();
            builderHoy.clear();
            await cargarTodasLasTareas();
            renderHoy();
            if (contenedorFormHoy) contenedorFormHoy.classList.add('hidden');
        });
    }

    const formTareaProximo = document.getElementById('form-tarea-proximo');
    if (formTareaProximo) {
        formTareaProximo.addEventListener('submit', async (e) => {
            e.preventDefault();
            const tituloNuevaTarea = document.getElementById('titulo-tarea-proximo').value.trim();

            if (validarTareaDuplicada(tituloNuevaTarea)) {
                mostrarAlertaPersonalizada(`Ya tienes una actividad registrada con el nombre "${tituloNuevaTarea}" (los nombres no pueden repetirse, ignorando acentos y mayúsculas).`, 'error');
                return;
            }

            const payload = {
                titulo: tituloNuevaTarea,
                hora: document.getElementById('hora-tarea-proximo').value || null,
                prioridad: parseInt(document.getElementById('prioridad-tarea-proximo').value),
                proyecto_id: document.getElementById('proyecto-tarea-proximo').value || null,
                descripcion: document.getElementById('descripcion-tarea-proximo').value,
                notas: document.getElementById('notas-tarea-proximo').value,
                recordatorio_minutos: (function(){ const v = document.getElementById('recordatorio-tarea-proximo'); return v ? parseInt(v.value) : -1; })(),
                usuario_id: usuario.id,
                fecha: formatISODate(selectedDate),
                subtareas: builderProximo.getItems()
            };
            
            await fetch('/api/tareas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            e.target.reset();
            builderProximo.clear();
            await cargarTodasLasTareas();
            renderCalendar();
            cargarDatosProximo();
        });
    }

    // ==============================================
    // BUSCADOR GLOBAL
    // ==============================================
    let previousSectionId = 'seccion-hoy';
    const globalSearchInput = document.getElementById('global-search-input');

    if (globalSearchInput) {
        globalSearchInput.addEventListener('input', () => {
            const queryText = globalSearchInput.value.trim();
            
            if (queryText) {
                // Ocultar todas las secciones y deseleccionar sidebar links
                sections.forEach(s => s.classList.add('hidden-section'));
                sidebarLinks.forEach(l => l.classList.remove('active'));
                
                // Mostrar la sección de búsqueda
                const searchSec = document.getElementById('seccion-busqueda');
                if (searchSec) searchSec.classList.remove('hidden-section');
                
                ejecutarBusquedaGlobal(queryText);
            } else {
                // Volver a la sección anterior
                sections.forEach(s => s.classList.add('hidden-section'));
                const prevSec = document.getElementById(previousSectionId);
                if (prevSec) prevSec.classList.remove('hidden-section');
                
                // Reactivar el sidebar link correspondiente
                const matchingLink = Array.from(sidebarLinks).find(l => l.getAttribute('data-target') === previousSectionId);
                if (matchingLink) matchingLink.classList.add('active');
                
                refrescarPantallaActiva();
            }
        });
    }

    // Atajo de teclado Ctrl+K para enfocar buscador
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            if (globalSearchInput) {
                globalSearchInput.focus();
            }
        }
    });

    // Manejador del botón Quick Add (Creación Global)
    const btnQuickAdd = document.getElementById('btn-quick-add');
    if (btnQuickAdd) {
        btnQuickAdd.addEventListener('click', () => {
            // 1. Navegar a la sección de "Hoy" simulando clic en la sidebar
            const hoyLink = Array.from(sidebarLinks).find(l => l.getAttribute('data-target') === 'seccion-hoy');
            if (hoyLink) {
                hoyLink.click();
            }
            
            // 2. Desplegar formulario
            const contenedorFormHoy = document.getElementById('contenedor-form-hoy');
            if (contenedorFormHoy) {
                contenedorFormHoy.classList.remove('hidden');
                contenedorFormHoy.scrollIntoView({ behavior: 'smooth' });
                
                // 3. Enfocar título del formulario
                const inputTitulo = document.getElementById('titulo-tarea-hoy');
                if (inputTitulo) {
                    setTimeout(() => inputTitulo.focus(), 350);
                }
            }
        });
    }

    // Redibujar gráficos o refrescar vistas al cambiar tema
    window.addEventListener('themechanged', () => {
        refrescarPantallaActiva();
    });

    function ejecutarBusquedaGlobal(queryText) {
        const queryNorm = normalizarTexto(queryText);
        const resultados = globalTareas.filter(t => normalizarTexto(t.titulo).includes(queryNorm));
        
        const summary = document.getElementById('search-results-summary');
        if (summary) {
            summary.textContent = `Coincidencias encontradas: ${resultados.length} para "${queryText}"`;
        }

        renderBusqueda(resultados);
    }

    function renderBusqueda(resultados) {
        const grid = document.getElementById('lista-busqueda-grid');
        if (!grid) return;

        // Ordenar resultados por fecha (ASC) y luego hora
        resultados.sort((a, b) => {
            if (a.fecha !== b.fecha) return (a.fecha || '').localeCompare(b.fecha || '');
            if (a.hora && b.hora) return a.hora.localeCompare(b.hora);
            return 0;
        });

        grid.innerHTML = '';

        if (resultados.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🔍</div>
                    <p style="font-size: 1.1rem; color: var(--text-secondary);">No se encontraron actividades que coincidan con tu búsqueda.</p>
                </div>
            `;
            return;
        }

        resultados.forEach((t, index) => {
            const isCompletada = t.estado === 'completada';
            const isVencida = t.fecha && t.fecha < todayISO && !isCompletada;
            const prioridad = t.prioridad || 3;
            const proyectoNombre = getProyectoNombre(t.proyecto_id);

            // 1. CONSTRUIR EL HTML DE LAS SUBTAREAS EXISTENTES
            let subtareasHTML = '';
            if (t.subtareas && t.subtareas.length > 0) {
                subtareasHTML = `<div class="subtareas-container" style="margin: 0.8rem 0; padding-left: 0.2rem; display: flex; flex-direction: column; gap: 0.5rem;">`;
                t.subtareas.forEach(sub => {
                    const isSubDone = sub.completada === 1;
                    subtareasHTML += `
                        <div class="subtarea-item" style="display: flex; align-items: center; gap: 0.6rem; font-size: 0.85rem;">
                            <input type="checkbox" 
                                   class="check-subtarea-busqueda" 
                                   data-sub-id="${sub.id}" 
                                   ${isSubDone ? 'checked' : ''} 
                                   style="cursor: pointer; accent-color: #2563eb;">
                            <span style="${isSubDone ? 'text-decoration: line-through; opacity: 0.5;' : 'color: var(--text-primary);'} flex: 1;">
                                ${sub.descripcion}
                            </span>
                            <button class="btn-eliminar-subtarea-busqueda" data-sub-id="${sub.id}" style="background: none; border: none; color: #ef4444; cursor: pointer; opacity: 0.6; font-size: 0.8rem; padding: 0 0.2rem;">✕</button>
                        </div>
                    `;
                });
                subtareasHTML += `</div>`;
            }

            // 1.5. CONSTRUIR EL PROGRESO DE SUBTAREAS
            let progressHTML = '';
            if (t.subtareas && t.subtareas.length > 0) {
                const completedCount = t.subtareas.filter(sub => sub.completada === 1).length;
                const totalCount = t.subtareas.length;
                const percent = Math.round((completedCount / totalCount) * 100);
                progressHTML = `
                    <div class="task-progress-container" style="margin-top: 0.5rem; margin-bottom: 0.5rem;">
                        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.2rem;">
                            <span>Progreso de pasos</span>
                            <span>${completedCount}/${totalCount} (${percent}%)</span>
                        </div>
                        <div style="width: 100%; height: 4px; background: rgba(255, 255, 255, 0.1); border-radius: 2px; overflow: hidden;">
                            <div style="width: ${percent}%; height: 100%; background: linear-gradient(90deg, #3b82f6, #10b981); transition: width 0.3s ease;"></div>
                        </div>
                    </div>
                `;
            }

            // 2. CONSTRUIR EL FORMULARIO COMPACTO PARA AÑADIR SUBTAREAS
            const inputSubtareaHTML = `
                <div class="add-subtarea-inline-busqueda" style="display: flex; gap: 0.4rem; margin-top: 0.6rem; margin-bottom: 0.6rem; padding-top: 0.5rem; border-top: 1px solid var(--glass-border, rgba(255,255,255,0.1));">
                    <input type="text" 
                           placeholder="Añadir paso..." 
                           class="input-nueva-subtarea-busqueda" 
                           style="flex: 1; padding: 0.2rem 0.5rem; font-size: 0.8rem; border-radius: 4px; border: 1px solid var(--glass-border, rgba(255,255,255,0.1)); background: rgba(0,0,0,0.2); color: var(--text-primary); outline: none;">
                    <button class="btn-add-subtarea-busqueda" 
                            style="padding: 0.2rem 0.5rem; font-size: 0.8rem; background: #2563eb; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">
                        +
                    </button>
                </div>
            `;

            const item = document.createElement('div');
            item.className = 'timeline-item';
            item.style.animationDelay = `${index * 0.05}s`;

            item.innerHTML = `
                <div class="timeline-dot ${isCompletada ? 'completed' : ''} ${isVencida ? 'vencida' : ''}" 
                     title="${isCompletada ? 'Marcar como pendiente' : 'Completar tarea'}"
                     data-task-id="${t.id}" 
                     data-new-estado="${isCompletada ? 'pendiente' : 'completada'}">
                </div>
                <div class="timeline-card ${isCompletada ? 'completed' : ''} ${isVencida ? 'vencida' : ''}" data-task-index="${index}">
                    <div class="timeline-card-header">
                        <h4 class="${isCompletada ? 'done' : ''}">${t.titulo}</h4>
                        <div style="display: flex; gap: 0.4rem; align-items: center;">
                            ${isVencida ? '<span class="pill pill-overdue">⚠️ Vencida</span>' : ''}
                            ${isCompletada ? '<span class="pill pill-status-done">✓ Completada</span>' : ''}
                            ${!isCompletada && !isVencida ? '<span class="pill" style="background: rgba(245, 158, 11, 0.15); color: #d97706;">Pendiente</span>' : ''}
                        </div>
                    </div>
                    
                    ${progressHTML}
                    ${subtareasHTML}
                    ${inputSubtareaHTML}

                    <div class="timeline-card-footer">
                        <span class="pill pill-time">📅 ${t.fecha || 'Sin fecha'}</span>
                        ${t.hora ? `<span class="pill pill-time">🕒 ${t.hora}</span>` : ''}
                        <span class="pill pill-priority-${prioridad}">P${prioridad} ${priorityLabels[prioridad]}</span>
                        ${t.proyecto_id ? `<span class="pill pill-project">📁 ${proyectoNombre}</span>` : ''}
                    </div>
                </div>
            `;

            // EVENTO: Checkbox principal de la tarea
            const dot = item.querySelector('.timeline-dot');
            if (dot) {
                dot.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const taskId = dot.getAttribute('data-task-id');
                    const newEstado = dot.getAttribute('data-new-estado');
                    toggleTarea(parseInt(taskId), newEstado);
                });
            }

            // EVENTO: Abrir modal al hacer clic en la tarjeta
            const card = item.querySelector('.timeline-card');
            if (card) {
                card.addEventListener('click', () => abrirModalTarea(t));
            }

            // Prevenir clicks en inputs
            const subContainer = item.querySelector('.subtareas-container');
            if (subContainer) {
                subContainer.addEventListener('click', (e) => e.stopPropagation());
            }
            const addSubContainer = item.querySelector('.add-subtarea-inline-busqueda');
            if (addSubContainer) {
                addSubContainer.addEventListener('click', (e) => e.stopPropagation());
            }

            // Checkbox subtarea
            item.querySelectorAll('.check-subtarea-busqueda').forEach(chk => {
                chk.addEventListener('change', async () => {
                    const subId = chk.getAttribute('data-sub-id');
                    const completada = chk.checked ? 1 : 0;
                    try {
                        const response = await fetch(`/api/tareas/subtareas/${subId}`, {
                           method: 'PUT',
                           headers: { 'Content-Type': 'application/json' },
                           body: JSON.stringify({ completada })
                        });
                        if (response.ok) {
                            await cargarTodasLasTareas();
                            refrescarPantallaActiva();
                        }
                    } catch (error) {
                        console.error(error);
                    }
                });
            });

            // Eliminar subtarea
            item.querySelectorAll('.btn-eliminar-subtarea-busqueda').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const subId = btn.getAttribute('data-sub-id');
                    try {
                        const response = await fetch(`/api/tareas/subtareas/${subId}`, { method: 'DELETE' });
                        if (response.ok) {
                            await cargarTodasLasTareas();
                            refrescarPantallaActiva();
                        }
                    } catch (error) {
                        console.error(error);
                    }
                });
            });

            // Guardar nueva subtarea inline
            const btnAdd = item.querySelector('.btn-add-subtarea-busqueda');
            const inputAdd = item.querySelector('.input-nueva-subtarea-busqueda');
            if (btnAdd && inputAdd) {
                const ejecutarGuardado = async () => {
                    const descripcion = inputAdd.value.trim();
                    if (!descripcion) return;
                    try {
                        const response = await fetch(`/api/tareas/${t.id}/subtareas`, {
                           method: 'POST',
                           headers: { 'Content-Type': 'application/json' },
                           body: JSON.stringify({ descripcion })
                        });
                        if (response.ok) {
                            inputAdd.value = '';
                            await cargarTodasLasTareas();
                            refrescarPantallaActiva();
                        }
                    } catch (error) {
                        console.error(error);
                    }
                };
                btnAdd.addEventListener('click', ejecutarGuardado);
                inputAdd.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') ejecutarGuardado();
                });
            }

            grid.appendChild(item);
        });
    }

    // ==============================================
    // FRASES MOTIVACIONALES DINÁMICAS (8,000 COMBINACIONES)
    // ==============================================
    const frasesStarts = [
        "La constancia", "La disciplina", "Tu esfuerzo de hoy", "Cada actividad completada",
        "El enfoque diario", "Tu compromiso", "El trabajo constante", "Dar lo mejor de ti",
        "La perseverancia", "Organizar tu tiempo", "Dar un paso más", "Tu dedicación",
        "Superar tus límites", "Tener claridad en tus metas", "Avanzar con determinación", "Creer en tu potencial",
        "Mantener la concentración", "Aprender de cada paso", "Tu constancia de hoy", "La acción diaria"
    ];

    const frasesMiddles = [
        "es el camino para", "te abrirá las puertas a", "te guiará directamente hacia", "se convertirá en",
        "es la clave que necesitas para", "te permite alcanzar", "construye el puente hacia", "es la base para lograr",
        "te acerca cada vez más a", "te prepara para recibir", "multiplica tus oportunidades de", "te define en tu camino a",
        "fortalece tu habilidad para", "es el secreto oculto para", "impulsa tu potencial para", "te da el poder de",
        "transforma tu realidad para", "desbloquea tu capacidad para", "sostiene tus metas para", "facilita el camino para"
    ];

    const frasesEndings = [
        "grandes resultados mañana.", "tus metas más ambiciosas.", "un día lleno de logros.", "el éxito que tanto buscas.",
        "una versión mejor de ti.", "una productividad sin límites.", "un crecimiento personal constante.", "hacer realidad tus sueños.",
        "superar cualquier obstáculo hoy.", "conquistar tus objetivos diarios.", "marcar la diferencia en tu vida.", "mantener el enfoque a largo plazo.",
        "sentirte orgulloso al final del día.", "crear hábitos que duren siempre.", "alcanzar el éxito con tranquilidad.", "aprovechar al máximo cada minuto.",
        "construir un futuro brillante.", "dominar tu tiempo con maestría.", "disfrutar de lo que haces.", "inspirar a quienes te rodean."
    ];

    function obtenerFraseDiaria(date) {
        const y = date.getFullYear();
        const m = date.getMonth();
        const d = date.getDate();
        // Generar un hash determinista a partir de la fecha local
        const hash = (y * 367) + (m * 31) + d;
        
        const iStart = hash % frasesStarts.length;
        const iMiddle = (hash + 7) % frasesMiddles.length;
        const iEnding = (hash + 13) % frasesEndings.length;
        
        return `${frasesStarts[iStart]} ${frasesMiddles[iMiddle]} ${frasesEndings[iEnding]}`;
    }

    // ==============================================
    // RACHAS DE PRODUCTIVIDAD (STREAKS)
    // ==============================================
    function calcularRacha(tareas) {
        if (!tareas || tareas.length === 0) return 0;

        // Agrupar tareas por fecha
        const tareasPorFecha = {};
        tareas.forEach(t => {
            if (!t.fecha) return;
            if (!tareasPorFecha[t.fecha]) {
                tareasPorFecha[t.fecha] = [];
            }
            tareasPorFecha[t.fecha].push(t);
        });

        // Determinar si cada fecha fue "exitosa" (todas las tareas completadas y al menos 1 tarea)
        const fechasExitosas = new Set();
        Object.keys(tareasPorFecha).forEach(fecha => {
            const tareasDia = tareasPorFecha[fecha];
            const todasCompletadas = tareasDia.every(t => t.estado === 'completada');
            if (todasCompletadas && tareasDia.length > 0) {
                fechasExitosas.add(fecha);
            }
        });

        let racha = 0;
        const tempDate = new Date(); // Fecha de hoy en hora local
        
        let hoyStr = formatISODate(tempDate);
        
        const hoyTieneTareas = tareasPorFecha[hoyStr] && tareasPorFecha[hoyStr].length > 0;
        const storedHoySuccess = (typeof usuario !== 'undefined' && usuario && localStorage.getItem(`aldia_hoy_success_${usuario.id}_${hoyStr}`) === '1');
        const hoyExitoso = storedHoySuccess || fechasExitosas.has(hoyStr);

        let fechaAEvaluar = new Date(tempDate);
        
        if (hoyTieneTareas && !hoyExitoso) {
            // Hoy hay tareas pendientes, la racha no incluye hoy y evaluamos desde ayer
            fechaAEvaluar.setDate(fechaAEvaluar.getDate() - 1);
        } else if (hoyExitoso) {
            // Hoy fue exitoso, sumamos 1 y evaluamos desde ayer
            racha = 1;
            fechaAEvaluar.setDate(fechaAEvaluar.getDate() - 1);
        } else {
            // Hoy no tiene tareas. Empezamos desde ayer.
            fechaAEvaluar.setDate(fechaAEvaluar.getDate() - 1);
        }
        // Ir hacia atrás día por día
        while (true) {
            const evalStr = formatISODate(fechaAEvaluar);
            
            if (tareasPorFecha[evalStr] && tareasPorFecha[evalStr].length > 0) {
                if (fechasExitosas.has(evalStr)) {
                    racha++;
                } else {
                    // Encontró un día incompleto -> rompe la racha
                    break;
                }
            } else {
                // Día libre (0 tareas), neutral: no rompe la racha. Saltamos al día anterior.
                const todasLasFechas = Object.keys(tareasPorFecha);
                if (todasLasFechas.length === 0) break;
                const fechaMasVieja = todasLasFechas.reduce((min, f) => f < min ? f : min, hoyStr);
                if (evalStr < fechaMasVieja) {
                    break; // Ya pasamos la tarea más antigua
                }
            }
            
            fechaAEvaluar.setDate(fechaAEvaluar.getDate() - 1);
        }

        return racha;
    }

    function markTodaySuccessIfApplicable() {
        try {
            if (!usuario) return;
            const hoyStr = formatISODate(new Date());
            const tareasHoy = globalTareas.filter(t => t.fecha === hoyStr);
            if (tareasHoy.length === 0) return;
            const todasCompletas = tareasHoy.every(t => t.estado === 'completada');
            if (todasCompletas) {
                localStorage.setItem(`aldia_hoy_success_${usuario.id}_${hoyStr}`, '1');
            }
        } catch (err) { console.error('markTodaySuccessIfApplicable error', err); }
    }

    function calcularRachaMaxima(tareas) {
        if (!tareas || tareas.length === 0) return 0;
        
        const tareasPorFecha = {};
        tareas.forEach(t => {
            if (!t.fecha) return;
            if (!tareasPorFecha[t.fecha]) {
                tareasPorFecha[t.fecha] = [];
            }
            tareasPorFecha[t.fecha].push(t);
        });

        const fechasConTareas = Object.keys(tareasPorFecha).filter(f => f <= todayISO);
        if (fechasConTareas.length === 0) return 0;
        
        fechasConTareas.sort();
        const minDateStr = fechasConTareas[0];
        
        let currentStreak = 0;
        let maxStreak = 0;
        
        let cur = new Date(minDateStr);
        const end = new Date(todayISO);
        
        while (cur <= end) {
            const cellISO = formatISODate(cur);
            const tareasDia = tareasPorFecha[cellISO];
            
            if (tareasDia && tareasDia.length > 0) {
                const todoCompletado = tareasDia.every(t => t.estado === 'completada');
                if (todoCompletado) {
                    currentStreak++;
                } else {
                    if (cellISO === todayISO) {
                        // Hoy está incompleto pero en progreso, no rompe la racha máxima aún
                    } else {
                        maxStreak = Math.max(maxStreak, currentStreak);
                        currentStreak = 0;
                    }
                }
            }
            cur.setDate(cur.getDate() + 1);
        }
        
        maxStreak = Math.max(maxStreak, currentStreak);
        return maxStreak;
    }

    function mostrarModalRacha() {
        const racha = calcularRacha(globalTareas);
        const rachaMax = calcularRachaMaxima(globalTareas);
        
        const year = new Date().getFullYear();
        const month = new Date().getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        
        const tareasPorFecha = {};
        globalTareas.forEach(t => {
            if (!t.fecha) return;
            if (!tareasPorFecha[t.fecha]) {
                tareasPorFecha[t.fecha] = [];
            }
            tareasPorFecha[t.fecha].push(t);
        });
        
        let exitos = 0;
        let fallidos = 0;
        let libres = 0;
        
        for (let i = 1; i <= daysInMonth; i++) {
            const cellDate = new Date(year, month, i);
            const cellISO = formatISODate(cellDate);
            
            if (cellISO <= todayISO) {
                const tareasDia = tareasPorFecha[cellISO];
                if (tareasDia && tareasDia.length > 0) {
                    const todoCompletado = tareasDia.every(t => t.estado === 'completada');
                    if (todoCompletado) {
                        exitos++;
                    } else {
                        if (cellISO !== todayISO) {
                            fallidos++;
                        }
                    }
                } else {
                    libres++;
                }
            }
        }
        
        const firstDayIndex = new Date(year, month, 1).getDay();
        const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
        
        let calendarHTML = '';
        const daysOfWeek = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
        daysOfWeek.forEach(d => {
            calendarHTML += `<div class="streak-calendar-day-header">${d}</div>`;
        });
        
        for (let i = 0; i < firstDayIndex; i++) {
            calendarHTML += `<div class="streak-calendar-day streak-day-empty"></div>`;
        }
        
        for (let i = 1; i <= daysInMonth; i++) {
            const cellDate = new Date(year, month, i);
            const cellISO = formatISODate(cellDate);
            
            let dayClass = 'streak-day-future';
            let indicator = '';
            let tooltip = 'Día en el futuro';
            
            if (cellISO <= todayISO) {
                const tareasDia = tareasPorFecha[cellISO];
                if (tareasDia && tareasDia.length > 0) {
                    const todoCompletado = tareasDia.every(t => t.estado === 'completada');
                    if (todoCompletado) {
                        dayClass = 'streak-day-success';
                        indicator = '🔥';
                        tooltip = '¡Día Exitoso! Tareas 100% completadas';
                    } else {
                        if (cellISO === todayISO) {
                            dayClass = 'streak-day-progress';
                            indicator = '⚡';
                            tooltip = 'Hoy en progreso (tareas pendientes)';
                        } else {
                            dayClass = 'streak-day-failed';
                            indicator = '❌';
                            tooltip = 'Racha Rota (tareas pendientes de completar)';
                        }
                    }
                } else {
                    dayClass = 'streak-day-free';
                    indicator = '➖';
                    tooltip = 'Día Libre (sin tareas programadas)';
                }
            }
            
            calendarHTML += `
                <div class="streak-calendar-day ${dayClass}" title="${tooltip}">
                    <span>${i}</span>
                    ${indicator ? `<span class="streak-day-indicator">${indicator}</span>` : ''}
                </div>
            `;
        }
        
        const overlay = document.createElement('div');
        overlay.id = 'alerta-custom-glass';
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100vw';
        overlay.style.height = '100vh';
        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.4)';
        overlay.style.backdropFilter = 'blur(8px)';
        overlay.style.display = 'flex';
        overlay.style.justifyContent = 'center';
        overlay.style.alignItems = 'center';
        overlay.style.zIndex = '9999';
        overlay.style.animation = 'fadeIn 0.2s ease-out';
        
        let mensajeEstado = '';
        if (racha > 0) {
            mensajeEstado = `
                <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.25); padding: 0.8rem 1rem; border-radius: 8px; font-size: 0.82rem; line-height: 1.45; color: #10b981; margin-bottom: 1.2rem;">
                    <strong>¡Racha Activa! 🔥</strong> Excelente trabajo manteniendo tu constancia. Sigue completando tus tareas diarias para que el contador continúe subiendo.
                </div>
            `;
        } else if (rachaMax > 0) {
            mensajeEstado = `
                <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.25); padding: 0.8rem 1rem; border-radius: 8px; font-size: 0.82rem; line-height: 1.45; color: #ef4444; margin-bottom: 1.2rem;">
                    <strong>¡Has perdido tu racha! 😢</strong> Quedó alguna tarea pendiente en los días pasados y tu contador volvió a 0. ¡No te desanimes! Completa tus actividades de hoy para recuperar el ritmo y encender tu racha de nuevo.
                </div>
            `;
        } else {
            mensajeEstado = `
                <div style="background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.25); padding: 0.8rem 1rem; border-radius: 8px; font-size: 0.82rem; line-height: 1.45; color: #3b82f6; margin-bottom: 1.2rem;">
                    <strong>¡Empieza tu racha! 🚀</strong> Aún no has iniciado tu racha. Completa hoy todas tus actividades programadas (al menos una) para encender tu primer día de racha de productividad.
                </div>
            `;
        }

        overlay.innerHTML = `
            <div class="modal-content glass-card streak-modal-content" style="animation: scaleUp 0.25s ease-out; color: var(--text-primary);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.2rem;">
                    <h3 style="margin: 0; color: var(--accent); font-size: 1.2rem;">Historial de Racha 🔥</h3>
                    <span id="btn-cerrar-streak-modal" style="font-size: 1.8rem; font-weight: bold; cursor: pointer; color: var(--text-secondary);">&times;</span>
                </div>
                
                <p style="font-size: 0.88rem; color: var(--text-secondary); margin-bottom: 1rem; line-height: 1.45;">
                    Lleva el registro diario de tu constancia en Al Día. A continuación puedes ver los días completados, los días libres (sin tareas) y el momento exacto en que recuperaste tu racha.
                </p>

                ${mensajeEstado}

                <div class="streak-stats-row">
                   <div class="streak-stat-card">
                       <span class="streak-stat-val">${racha} 🔥</span>
                       <div class="streak-stat-label">Racha Actual</div>
                   </div>
                   <div class="streak-stat-card">
                       <span class="streak-stat-val">${rachaMax} 🏆</span>
                       <div class="streak-stat-label">Racha Máxima</div>
                   </div>
                   <div class="streak-stat-card">
                       <span class="streak-stat-val" style="color: #10b981;">${exitos}</span>
                       <div class="streak-stat-label">Exitosos (Mes)</div>
                   </div>
                </div>

                <h4 style="margin-top: 1.4rem; text-align: center; color: var(--text-primary); font-size: 0.95rem; font-weight: 700;">
                    ${monthNames[month]} ${year}
                </h4>

                <div class="streak-calendar-grid">
                    ${calendarHTML}
                </div>

                <div class="streak-modal-legend">
                   <div class="streak-modal-legend-item">
                       <span>🔥</span> <span><strong>Exitoso:</strong> Racha activa</span>
                   </div>
                   <div class="streak-modal-legend-item">
                       <span>❌</span> <span><strong>Racha rota:</strong> Pendientes</span>
                   </div>
                   <div class="streak-modal-legend-item">
                       <span>➖</span> <span><strong>Día libre:</strong> Sin tareas</span>
                   </div>
                   <div class="streak-modal-legend-item">
                       <span>⚡</span> <span><strong>En progreso:</strong> Hoy pendiente</span>
                   </div>
                </div>

                <button id="btn-cerrar-streak-modal-btn" class="btn btn-primary" style="margin-top: 1.2rem; width: 100%; padding: 0.65rem; border-radius: 8px;">Entendido</button>
            </div>
        `;
        
        document.body.appendChild(overlay);
        
        const cerrarModal = () => overlay.remove();
        
        const btnCross = document.getElementById('btn-cerrar-streak-modal');
        const btnAceptar = document.getElementById('btn-cerrar-streak-modal-btn');
        if (btnCross) btnCross.onclick = cerrarModal;
        if (btnAceptar) btnAceptar.onclick = cerrarModal;
        
        overlay.onclick = (e) => {
            if (e.target === overlay) cerrarModal();
        };
    }

    function actualizarRachaUI() {
        const racha = calcularRacha(globalTareas);

        // 1. Actualizar el saludo en el Navbar
        const greeting = document.getElementById('user-greeting');
        if (greeting) {
            if (racha > 0) {
                greeting.innerHTML = `Hola, ${usuario.nombre} <span class="streak-badge" id="nav-streak-active" title="Ver mi historial de racha 🔥" style="cursor: pointer;"><span class="streak-icon">🔥</span> ${racha} ${racha === 1 ? 'día' : 'días'}</span>`;
                const badge = document.getElementById('nav-streak-active');
                if (badge) {
                    badge.onclick = (e) => {
                        e.stopPropagation();
                        mostrarModalRacha();
                    };
                }
            } else {
                greeting.innerHTML = `Hola, ${usuario.nombre} <span class="streak-badge inactive" id="nav-streak-inactive" title="Ver mi historial de racha 🔥"><span class="streak-icon">🔥</span> 0 días</span>`;
                const badge = document.getElementById('nav-streak-inactive');
                if (badge) {
                    badge.onclick = (e) => {
                        e.stopPropagation();
                        mostrarModalRacha();
                    };
                }
            }
        }

        // 2. Actualizar el banner de la sidebar (debajo del menú)
        const sidebarMenu = document.getElementById('sidebar-menu');
        if (sidebarMenu) {
            let sidebarStreak = document.getElementById('sidebar-streak-container');
            if (!sidebarStreak) {
                sidebarStreak = document.createElement('div');
                sidebarStreak.id = 'sidebar-streak-container';
                sidebarStreak.className = 'sidebar-streak-card';
                
                const links = sidebarMenu.querySelector('.sidebar-links');
                if (links) {
                    links.parentNode.insertBefore(sidebarStreak, links.nextSibling);
                }
            }
            
            if (racha > 0) {
                sidebarStreak.className = 'sidebar-streak-card';
                sidebarStreak.style.display = 'flex';
                sidebarStreak.title = "Ver mi historial de racha 🔥";
                sidebarStreak.onclick = (e) => {
                    e.stopPropagation();
                    mostrarModalRacha();
                };
                sidebarStreak.innerHTML = `
                    <span style="font-size:1.5rem;">🔥</span>
                    <div style="display:flex; flex-direction:column; gap:0.1rem;">
                        <span style="font-size:0.7rem; text-transform:uppercase; font-weight:600; opacity:0.9; letter-spacing:0.05em;">Racha Activa</span>
                        <span class="streak-val" style="font-size:1.2rem; font-weight:800;">${racha} ${racha === 1 ? 'día' : 'días'}</span>
                    </div>
                `;
            } else {
                sidebarStreak.className = 'sidebar-streak-card inactive';
                sidebarStreak.style.display = 'flex';
                sidebarStreak.title = "Ver mi historial de racha 🔥";
                sidebarStreak.onclick = (e) => {
                    e.stopPropagation();
                    mostrarModalRacha();
                };
                sidebarStreak.innerHTML = `
                    <span style="font-size:1.5rem;">🔥</span>
                    <div style="display:flex; flex-direction:column; gap:0.1rem;">
                        <span style="font-size:0.7rem; text-transform:uppercase; font-weight:600; opacity:0.9; letter-spacing:0.05em;">Racha Actual</span>
                        <span class="streak-val" style="font-size:1.2rem; font-weight:800;">0 días</span>
                    </div>
                `;
            }
        }

        // 3. Actualizar la tarjeta Hero de "Hoy"
        const heroGreeting = document.querySelector('.hero-greeting-text');
        if (heroGreeting) {
            let heroStreak = document.getElementById('hero-streak-badge');
            if (!heroStreak) {
                heroStreak = document.createElement('div');
                heroStreak.id = 'hero-streak-badge';
                heroGreeting.appendChild(heroStreak);
            }
            
            if (racha > 0) {
                heroStreak.className = 'streak-hero-pill';
                heroStreak.innerHTML = `🔥 Llevas <strong>${racha} ${racha === 1 ? 'día' : 'días'}</strong> completando todas tus tareas (Ver historial)`;
                heroStreak.style.display = 'inline-block';
                heroStreak.style.cursor = 'pointer';
                heroStreak.title = "Ver mi historial de racha 🔥";
                heroStreak.onclick = (e) => {
                    e.stopPropagation();
                    mostrarModalRacha();
                };
            } else {
                heroStreak.className = 'streak-hero-pill inactive';
                heroStreak.innerHTML = `🔥 La racha actual es 0 - Ver historial`;
                heroStreak.style.display = 'inline-block';
                heroStreak.style.cursor = 'pointer';
                heroStreak.title = "Ver mi historial de racha 🔥";
                heroStreak.onclick = (e) => {
                    e.stopPropagation();
                    mostrarModalRacha();
                };
            }
        }
    }

    // ==============================================
    // INICIALIZACIÓN
    // ==============================================
    if (selectedDateTitle) {
        selectedDateTitle.textContent = `Actividades del Día: ${formatISODate(selectedDate)}`;
    }
    
    (async () => {
        try {
            await cargarProyectos();
            await cargarTodasLasTareas();
            renderHoy();
        } catch (error) {
            console.error("Error durante la inicialización del dashboard:", error);
        }
    })();
});