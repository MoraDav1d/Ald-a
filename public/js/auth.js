document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    
    // Configuración Navbar según sesión
    const navLoginBtn = document.getElementById('nav-login-btn');
    const navDashBtn = document.getElementById('nav-dash-btn');
    const navRegBtn = document.getElementById('nav-reg-btn');
    const navLogoutBtn = document.getElementById('nav-logout-btn');

    const usuario = JSON.parse(localStorage.getItem('aldia_usuario'));

    if (usuario) {
        if (navLoginBtn) navLoginBtn.classList.add('hidden');
        if (navRegBtn) navRegBtn.classList.add('hidden');
        if (navDashBtn) navDashBtn.classList.remove('hidden');
        if (navLogoutBtn) navLogoutBtn.classList.remove('hidden');
    }

    // OLVIDÉ CONTRASEÑA
    const forgotLink = document.getElementById('forgot-link');
    if (forgotLink) {
        forgotLink.addEventListener('click', async (e) => {
            e.preventDefault();
            const email = prompt('Introduce tu correo para recuperar la contraseña:');
            if (!email) return;
            try {
                const res = await fetch('/api/auth/forgot', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });
                const data = await res.json();
                alert(data.message || 'Si el correo existe, recibirás instrucciones.');
            } catch (err) {
                console.error(err);
                alert('Error al solicitar recuperación.');
            }
        });
    }

    if (navLogoutBtn) {
        navLogoutBtn.addEventListener('click', () => {
            localStorage.removeItem('aldia_usuario');
            sessionStorage.removeItem('aldia_shown_overdue');
            window.location.href = 'index.html';
        });
    }

    // ==========================================
    // 1. VER / OCULTAR CONTRASEÑA
    // ==========================================
    const passwordToggle = document.getElementById('password-toggle');
    const passwordInput = document.getElementById('password');

    if (passwordToggle && passwordInput) {
        passwordToggle.addEventListener('click', () => {
            const isPassword = passwordInput.getAttribute('type') === 'password';
            passwordInput.setAttribute('type', isPassword ? 'text' : 'password');
            passwordToggle.textContent = isPassword ? '🙈' : '👁️';
            passwordToggle.setAttribute('title', isPassword ? 'Ocultar contraseña' : 'Mostrar contraseña');
        });
    }

    // ==========================================
    // 2. BOTONES SOCIALES SIMULADOS
    // ==========================================
    const googleBtn = document.getElementById('btn-social-google');
    const githubBtn = document.getElementById('btn-social-github');

    function handleSocialClick(provider) {
        alert(`El acceso con ${provider} es simulado en este demo. Por favor, regístrate o inicia sesión utilizando tu correo electrónico y contraseña.`);
    }

    if (googleBtn) googleBtn.addEventListener('click', () => handleSocialClick('Google'));
    if (githubBtn) githubBtn.addEventListener('click', () => handleSocialClick('GitHub'));

    // ==========================================
    // 3. ENVÍO DE FORMULARIOS CON ESTADO DE CARGA
    // ==========================================
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const errorMsg = document.getElementById('error-msg');
            const submitBtn = document.getElementById('btn-login-submit');

            // Mostrar estado loading
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.classList.add('loading');
            }
            if (errorMsg) errorMsg.classList.add('hidden');

            try {
                // Validaciones cliente
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(email)) {
                    if (errorMsg) {
                        errorMsg.textContent = 'Introduce un correo válido.';
                        errorMsg.classList.remove('hidden');
                    }
                    return;
                }
                const res = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                
                const data = await res.json();
                if (res.ok) {
                    localStorage.setItem('aldia_usuario', JSON.stringify(data));
                    window.location.href = 'dashboard.html';
                } else {
                    if (errorMsg) {
                        errorMsg.textContent = data.error || 'Error al iniciar sesión';
                        errorMsg.classList.remove('hidden');
                    }
                }
            } catch (err) {
                console.error(err);
                if (errorMsg) {
                    errorMsg.textContent = 'Error de conexión con el servidor.';
                    errorMsg.classList.remove('hidden');
                }
            } finally {
                // Quitar estado loading
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.classList.remove('loading');
                }
            }
        });
    }

    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const nombre = document.getElementById('nombre').value;
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const errorMsg = document.getElementById('error-msg-reg');
            const submitBtn = document.getElementById('btn-register-submit');
            const errorName = document.getElementById('error-name');

            // Mostrar estado loading
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.classList.add('loading');
            }
            if (errorMsg) errorMsg.classList.add('hidden');

            try {
                // Validaciones cliente
                const nameOk = /^[^0-9]+$/.test(nombre.trim());
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!nameOk) {
                    if (errorName) errorName.style.display = 'block';
                    return;
                } else if (errorName) {
                    errorName.style.display = 'none';
                }
                if (!emailRegex.test(email)) {
                    if (errorMsg) {
                        errorMsg.textContent = 'Introduce un correo válido.';
                        errorMsg.classList.remove('hidden');
                    }
                    return;
                }
                if (!password || password.length < 6) {
                    if (errorMsg) {
                        errorMsg.textContent = 'La contraseña debe tener al menos 6 caracteres.';
                        errorMsg.classList.remove('hidden');
                    }
                    return;
                }
                const res = await fetch('/api/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ nombre, email, password })
                });
                
                const data = await res.json();
                if (res.ok) {
                    localStorage.setItem('aldia_usuario', JSON.stringify(data));
                    window.location.href = 'dashboard.html';
                } else {
                    if (errorMsg) {
                        errorMsg.textContent = data.error || 'Error al registrar';
                        errorMsg.classList.remove('hidden');
                    }
                }
            } catch (err) {
                console.error(err);
                if (errorMsg) {
                    errorMsg.textContent = 'Error de conexión con el servidor.';
                    errorMsg.classList.remove('hidden');
                }
            } finally {
                // Quitar estado loading
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.classList.remove('loading');
                }
            }
        });
    }
});
