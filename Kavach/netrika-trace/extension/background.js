// Netrika-Trace Enterprise Background Worker (Manifest V3)

const BACKEND = 'http://localhost:8888';
let deviceId = '';
let orgId = '';
let jwtToken = '';
let activePolicy = {};
let offlineQueue = [];
let wsConnection = null;

// Generate UUID for device registration
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// 1. Initialize Extension & Register Device
chrome.runtime.onInstalled.addListener(async () => {
    console.log('[Netrika Enterprise] Extension installed/updated.');
    const stored = await chrome.storage.local.get(['device_uuid', 'org_id', 'jwt_token']);
    
    let uuid = stored.device_uuid;
    if (!uuid) {
        uuid = generateUUID();
        await chrome.storage.local.set({ 'device_uuid': uuid });
    }
    deviceId = uuid;
    orgId = stored.org_id || 'default-org';
    jwtToken = stored.jwt_token || '';

    await registerDevice();
    await fetchPolicy();
    connectWebSocket();
});

// Load config into memory on startup
chrome.storage.local.get(['device_uuid', 'org_id', 'jwt_token', 'active_policy'], (res) => {
    if (res.device_uuid) deviceId = res.device_uuid;
    if (res.org_id) orgId = res.org_id;
    if (res.jwt_token) jwtToken = res.jwt_token;
    if (res.active_policy) activePolicy = res.active_policy;
    connectWebSocket();
});

// 2. Register Device with Enterprise Backend
async function registerDevice() {
    try {
        const resp = await fetch(`${BACKEND}/api/v1/auth/register-device`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(jwtToken && { 'Authorization': `Bearer ${jwtToken}` })
            },
            body: JSON.stringify({
                device_uuid: deviceId,
                org_id: orgId,
                os: navigator.userAgentData?.platform || 'Unknown OS',
                browser: 'Chrome',
                ext_version: chrome.runtime.getManifest().version
            })
        });
        if (resp.ok) console.log('[Netrika Enterprise] Device registered successfully.');
    } catch (e) {
        console.error('[Netrika Enterprise] Device registration failed (offline).', e);
    }
}

// 3. Fetch Organization Policy
async function fetchPolicy() {
    try {
        const resp = await fetch(`${BACKEND}/api/v1/policies/extension-sync?org_id=${orgId}`, {
            headers: {
                ...(jwtToken && { 'Authorization': `Bearer ${jwtToken}` })
            }
        });
        if (resp.ok) {
            activePolicy = await resp.json();
            await chrome.storage.local.set({ 'active_policy': activePolicy });
            console.log('[Netrika Enterprise] Policy synced:', activePolicy);
        }
    } catch (e) {
        console.error('[Netrika Enterprise] Policy fetch failed.', e);
    }
}

// 4. Live WebSocket Policy Push
function connectWebSocket() {
    if (wsConnection) return;
    try {
        wsConnection = new WebSocket(`ws://localhost:8888/ws/policy-sync`);
        wsConnection.onopen = () => console.log('[Netrika Enterprise] WS Connected');
        wsConnection.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'POLICY_UPDATE' && data.org_id === orgId) {
                activePolicy = { ...activePolicy, ...data.policy };
                chrome.storage.local.set({ 'active_policy': activePolicy });
                console.log('[Netrika Enterprise] LIVE Policy Updated received via WS');
            }
        };
        wsConnection.onclose = () => {
            wsConnection = null;
            setTimeout(connectWebSocket, 10000); // Reconnect backoff
        };
    } catch (e) {
        console.error('WS Error:', e);
    }
}

// 5. Message Listener for Content Scripts
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'GET_CONFIG') {
        sendResponse({
            deviceId,
            orgId,
            jwtToken,
            policy: activePolicy
        });
        return true;
    }
    
    if (msg.action === 'QUEUE_OFFLINE_ANALYZE') {
        offlineQueue.push(msg.payload);
        chrome.storage.local.set({ 'offline_queue': offlineQueue });
        sendResponse({ status: 'queued' });
        return true;
    }

    if (msg.action === 'ANALYZE_API') {
        const { text, url, type, file_name, file_size } = msg.payload;
        let hostname = 'unknown';
        try { hostname = new URL(url).hostname; } catch(e){}

        fetch(`${BACKEND}/api/v1/analyze`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-Device-ID': deviceId,
                'X-Organization-ID': orgId,
                ...(jwtToken && { 'Authorization': `Bearer ${jwtToken}` })
            },
            body: JSON.stringify({
                payload: text,
                user_ip: 'browser-extension',
                target_host: hostname,
                target_url: url,
                http_method: 'POST',
                ...(type === 'file' && { file_name, file_size })
            })
        })
        .then(resp => resp.json())
        .then(data => sendResponse(data))
        .catch(err => {
            console.error('[Netrika Enterprise] Background fetch failed:', err);
            sendResponse(null); // content.js will handle fallback
        });
        
        return true; // Keep message channel open for async response
    }
});
