document.addEventListener('DOMContentLoaded', () => {
    // ==========================================
    // 1. DETECCIÓN DE SESIÓN INTELIGENTE
    // ==========================================
    const usuario = JSON.parse(localStorage.getItem('aldia_usuario'));
    
    const navLoginBtn = document.getElementById('nav-login-btn');
    const navRegBtn = document.getElementById('nav-reg-btn');
    const navDashBtn = document.getElementById('nav-dash-btn');
    const navLogoutBtn = document.getElementById('nav-logout-btn');
    
    // Botones de acción principales en el cuerpo del index
    const heroCtaContainer = document.querySelector('.hero-cta-group');
    const finalCtaContainer = document.querySelector('.cta-final');

    if (usuario) {
        // Usuario logueado: Ajustar navbar
        if (navLoginBtn) navLoginBtn.classList.add('hidden');
        if (navRegBtn) navRegBtn.classList.add('hidden');
        if (navDashBtn) {
            navDashBtn.classList.remove('hidden');
            navDashBtn.textContent = 'Ir a mi Agenda 📅';
        }
        if (navLogoutBtn) navLogoutBtn.classList.remove('hidden');

        // Modificar CTAs del héroe
        if (heroCtaContainer) {
            heroCtaContainer.innerHTML = `
                <a href="dashboard.html" class="btn btn-primary btn-large">Continuar al Dashboard 🚀</a>
            `;
        }
        // Modificar CTA final
        if (finalCtaContainer) {
            const finalBtn = finalCtaContainer.querySelector('a');
            if (finalBtn) {
                finalBtn.setAttribute('href', 'dashboard.html');
                finalBtn.textContent = 'Volver a mi Agenda';
            }
        }
    }

    if (navLogoutBtn) {
        navLogoutBtn.addEventListener('click', () => {
            localStorage.removeItem('aldia_usuario');
            sessionStorage.removeItem('aldia_shown_overdue');
            window.location.reload();
        });
    }

    // ==========================================
    // 2. ACORDEÓN DE PREGUNTAS FRECUENTES (FAQs)
    // ==========================================
    const faqQuestions = document.querySelectorAll('.faq-question');
    
    faqQuestions.forEach(question => {
        question.addEventListener('click', () => {
            const item = question.parentElement;
            const answer = item.querySelector('.faq-answer');
            const isActive = item.classList.contains('active');
            
            // Cerrar otros abiertos
            document.querySelectorAll('.faq-item').forEach(otherItem => {
                if (otherItem !== item) {
                    otherItem.classList.remove('active');
                    otherItem.querySelector('.faq-answer').style.maxHeight = null;
                }
            });
            
            // Toggle actual
            if (isActive) {
                item.classList.remove('active');
                answer.style.maxHeight = null;
            } else {
                item.classList.add('active');
                answer.style.maxHeight = answer.scrollHeight + 'px';
            }
        });
    });

    // ==========================================
    // 3. WIDGET INTERACTIVO (LIVE DEMO)
    // ==========================================
    let demoTasks = [
        {
            id: 1,
            titulo: '🚀 Lanzamiento de Al Día',
            completed: false,
            subtasks: [
                { id: 101, titulo: 'Diseñar interfaz', completed: true },
                { id: 102, titulo: 'Configurar base de datos', completed: false }
            ]
        },
        {
            id: 2,
            titulo: '🛒 Compras del hogar',
            completed: true,
            subtasks: [
                { id: 201, titulo: 'Café de grano', completed: true }
            ]
        },
        {
            id: 3,
            titulo: '🏃‍♂️ Entrenar 45 min',
            completed: false,
            subtasks: []
        }
    ];

    const demoTasksContainer = document.getElementById('demo-tasks-list');
    const demoProgressFill = document.getElementById('demo-progress-fill');
    const demoInput = document.getElementById('demo-task-input');
    const demoAddBtn = document.getElementById('demo-task-add-btn');
    const streakCounter = document.getElementById('demo-streak-val');

    function renderDemoTasks() {
        if (!demoTasksContainer) return;
        demoTasksContainer.innerHTML = '';

        demoTasks.forEach(task => {
            const card = document.createElement('div');
            card.className = `demo-task-card ${task.completed ? 'completed' : ''}`;
            card.dataset.id = task.id;

            // Renderizar subtareas si tiene
            let subtasksHTML = '';
            if (task.subtasks && task.subtasks.length > 0) {
                subtasksHTML = `<div class="demo-subtasks">`;
                task.subtasks.forEach(sub => {
                    subtasksHTML += `
                        <div class="demo-subtask-item ${sub.completed ? 'completed' : ''}" data-subid="${sub.id}">
                            <div class="demo-subtask-check">✓</div>
                            <span>${sub.titulo}</span>
                        </div>
                    `;
                });
                subtasksHTML += `</div>`;
            }

            card.innerHTML = `
                <div class="demo-task-main">
                    <div class="demo-checkbox">✓</div>
                    <span class="demo-task-title">${task.titulo}</span>
                </div>
                ${subtasksHTML}
            `;

            // Escuchar clic en el check principal
            const mainRow = card.querySelector('.demo-task-main');
            mainRow.addEventListener('click', (e) => {
                task.completed = !task.completed;
                // Si se marca completada la tarea principal, completamos todas sus subtareas
                if (task.subtasks) {
                    task.subtasks.forEach(sub => sub.completed = task.completed);
                }
                updateDemoProgress();
                renderDemoTasks();
            });

            // Escuchar clics en subtareas
            const subItems = card.querySelectorAll('.demo-subtask-item');
            subItems.forEach(subItem => {
                subItem.addEventListener('click', (e) => {
                    e.stopPropagation(); // Evitar clic en la tarea principal
                    const subId = parseInt(subItem.dataset.subid);
                    const sub = task.subtasks.find(s => s.id === subId);
                    if (sub) {
                        sub.completed = !sub.completed;
                        
                        // Si todas las subtareas están completadas, autocompletamos la principal
                        const todasComp = task.subtasks.every(s => s.completed);
                        // Si alguna se desmarca, se desmarca la principal si estaba completada
                        if (todasComp) {
                            task.completed = true;
                        } else {
                            task.completed = false;
                        }
                        
                        updateDemoProgress();
                        renderDemoTasks();
                    }
                });
            });

            demoTasksContainer.appendChild(card);
        });
    }

    function updateDemoProgress() {
        if (demoTasks.length === 0) {
            demoProgressFill.style.width = '0%';
            streakCounter.textContent = '0 días';
            return;
        }

        // Calcular progreso ponderando tareas y subtareas
        let totalItems = 0;
        let completedItems = 0;

        demoTasks.forEach(task => {
            if (!task.subtasks || task.subtasks.length === 0) {
                totalItems++;
                if (task.completed) completedItems++;
            } else {
                task.subtasks.forEach(sub => {
                    totalItems++;
                    if (sub.completed) completedItems++;
                });
            }
        });

        const pct = Math.round((completedItems / totalItems) * 100);
        demoProgressFill.style.width = `${pct}%`;

        // Si se completa el 100%, la racha aumenta
        if (pct === 100) {
            streakCounter.innerHTML = '🔥 5 días';
            // Agregar efecto de vibración
            const badge = document.querySelector('.demo-streak');
            if (badge) {
                badge.style.transform = 'scale(1.15)';
                setTimeout(() => badge.style.transform = 'scale(1)', 300);
            }
        } else {
            streakCounter.innerHTML = '🔥 4 días';
        }
    }

    // Agregar nueva tarea
    function addDemoTask() {
        if (!demoInput) return;
        const tituloVal = demoInput.value.trim();
        if (tituloVal === '') return;

        const newId = demoTasks.length > 0 ? Math.max(...demoTasks.map(t => t.id)) + 1 : 1;
        demoTasks.push({
            id: newId,
            titulo: tituloVal,
            completed: false,
            subtasks: []
        });

        demoInput.value = '';
        renderDemoTasks();
        updateDemoProgress();

        // Autoscroll al final de la lista de tareas demo
        setTimeout(() => {
            if (demoTasksContainer) {
                demoTasksContainer.scrollTop = demoTasksContainer.scrollHeight;
            }
        }, 50);
    }

    if (demoAddBtn && demoInput) {
        demoAddBtn.addEventListener('click', addDemoTask);
        demoInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                addDemoTask();
            }
        });
    }

    // Inicializar el demo
    renderDemoTasks();
    updateDemoProgress();
});
