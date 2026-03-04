import { config } from './config.js';
import { state } from './state.js';
import { showLoginUI, showAppUI } from './ui.js';
import { fetchUserData } from './api.js';

export function initiateLogin() {
    const authUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${config.CLIENT_ID}&redirect_uri=${encodeURIComponent(config.REDIRECT_URI)}&response_type=token&scope=${encodeURIComponent(config.SCOPES)}&force_verify=true`;
    window.location.href = authUrl;
}

export function checkAuth() {
    const hash = window.location.hash;
    if (hash && hash.includes('access_token')) {
        const params = new URLSearchParams(hash.substring(1));
        state.accessToken = params.get('access_token');
        localStorage.setItem('twitch_access_token', state.accessToken);
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
    } else {
        state.accessToken = localStorage.getItem('twitch_access_token');
    }

    if (state.accessToken && config.CLIENT_ID) {
        showAppUI();
        fetchUserData();
    } else {
        showLoginUI();
    }
}

export function logout() {
    if (confirm('ログアウトして連携を解除しますか？')) {
        localStorage.removeItem('twitch_access_token');
        localStorage.removeItem('target_channel');
        localStorage.removeItem('seenUsers');
        if (state.ws) state.ws.close();
        window.location.reload();
    }
}
