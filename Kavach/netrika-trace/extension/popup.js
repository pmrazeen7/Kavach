document.addEventListener('DOMContentLoaded', () => {
    const statusIndicator = document.getElementById('status-indicator');
    const statusText = document.getElementById('status-text');
    const openDashboardBtn = document.getElementById('open-dashboard');

    // Check if backend is online
    async function checkBackend() {
        try {
            const response = await fetch('http://localhost:8888/health');
            if (response.ok) {
                statusIndicator.className = 'indicator online';
                statusText.textContent = 'Backend Online';
            } else {
                throw new Error();
            }
        } catch (e) {
            statusIndicator.className = 'indicator offline';
            statusText.textContent = 'Backend Offline';
        }
    }

    checkBackend();

    openDashboardBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: 'http://localhost:3000/dashboard' });
    });
});
