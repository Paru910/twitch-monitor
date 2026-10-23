import { config } from './config.js';
import { state } from './state.js';
import { showLoginUI, showAppUI } from './ui.js';
import { fetchUserData } from './api.js';
import { restoreHistory } from './card.js';

const OAUTH_STATE_KEY = 'twitch_oauth_state';

export function initiateLogin() {
    try {
        const bytes = crypto.getRandomValues(new Uint8Array(32));
        const oauthState = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
        sessionStorage.setItem(OAUTH_STATE_KEY, oauthState);
        const authUrl = new URL('https://id.twitch.tv/oauth2/authorize');
        authUrl.search = new URLSearchParams({
            client_id: config.CLIENT_ID,
            redirect_uri: config.REDIRECT_URI,
            response_type: 'token',
            scope: config.SCOPES,
            force_verify: 'true',
            state: oauthState,
        }).toString();
        window.location.href = authUrl.href;
    } catch {
        // 安全な乱数や一時保存を利用できない場合は認証を開始しない。
        showLoginUI();
    }
}

export function checkAuth() {
    const params = new URLSearchParams(window.location.hash.substring(1));
    const query = new URLSearchParams(window.location.search);
    if (params.has('access_token') || params.has('error') || query.has('error')) {
        let expectedState;
        try {
            expectedState = sessionStorage.getItem(OAUTH_STATE_KEY);
            // 成否を問わず一度だけ消費し、同じ応答の再利用を防ぐ。
            sessionStorage.removeItem(OAUTH_STATE_KEY);
        } catch {
            expectedState = null;
        }
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        const token = params.get('access_token');
        if (!expectedState || params.getAll('state').length !== 1 ||
            params.get('state') !== expectedState || params.getAll('access_token').length !== 1 ||
            !token || params.has('error') || query.has('error')) {
            state.accessToken = null;
            showLoginUI();
            return;
        }
        state.accessToken = token;
        localStorage.setItem('twitch_access_token', state.accessToken);
    } else {
        state.accessToken = localStorage.getItem('twitch_access_token');
    }

    if (state.accessToken && config.CLIENT_ID) {
        showAppUI();
        restoreHistory();
        fetchUserData();
    } else {
        showLoginUI();
    }
}

export function logout() {
    if (confirm('ログアウトして連携を解除しますか？')) {
        try {
            sessionStorage.removeItem(OAUTH_STATE_KEY);
        } catch {
            // 一時保存が利用できなくても既存のログアウトを続ける。
        }
        localStorage.removeItem('twitch_access_token');
        localStorage.removeItem('target_channel');
        localStorage.removeItem('seenUsers');
        if (state.ws) state.ws.close();
        window.location.reload();
    }
}
