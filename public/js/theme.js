document.addEventListener('DOMContentLoaded', () => {
    const themeToggle = document.getElementById('theme-toggle');
    const body = document.body;

    // Check local storage for theme preference
    const savedTheme = localStorage.getItem('aldia_theme');
    
    const isCircle = themeToggle && themeToggle.classList.contains('nav-circle-btn');

    // Default to light mode (no class). If savedTheme is 'dark', add class.
    if (savedTheme === 'dark') {
        body.classList.add('dark-mode');
        if (themeToggle) {
            themeToggle.textContent = isCircle ? '☀️' : '☀️ Modo Claro';
        }
    } else {
        // Explicitly remove it just in case
        body.classList.remove('dark-mode');
        if (themeToggle) {
            themeToggle.textContent = isCircle ? '🌙' : '🌙 Modo Oscuro';
        }
    }

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            body.classList.toggle('dark-mode');
            
            const isDark = body.classList.contains('dark-mode');
            localStorage.setItem('aldia_theme', isDark ? 'dark' : 'light');
            
            const isCircleActive = themeToggle.classList.contains('nav-circle-btn');
            themeToggle.textContent = isDark ? (isCircleActive ? '☀️' : '☀️ Modo Claro') : (isCircleActive ? '🌙' : '🌙 Modo Oscuro');
            
            // Dispatch a global event so charts and views can refresh instantly
            window.dispatchEvent(new Event('themechanged'));
        });
    }
});
