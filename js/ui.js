import { state } from './state.js';
import { changeChannelPrompt } from './api.js';
import { logout, initiateLogin } from './auth.js';
import { fetchTargetBroadcasterAndConnect } from './api.js';

export const elements = {
    loginBtn: document.getElementById('login-btn'),
    loginSection: document.getElementById('login-section'),
    pinnedContainer: document.getElementById('pinned-container'),
    cardsContainer: document.getElementById('cards-container'),
    statusIndicator: document.getElementById('status-indicator'),
    statusText: document.getElementById('status-text'),
    clearLogsBtn: document.getElementById('clear-logs-btn'),
    logoutBtn: document.getElementById('logout-btn'),
    changeChannelBtn: document.getElementById('change-channel-btn'),
    currentChannelText: document.getElementById('current-channel-text'),
    scrollToBottomBtn: document.getElementById('scroll-to-bottom-btn'),
    fontIncreaseBtn: document.getElementById('font-increase-btn'),
    fontDecreaseBtn: document.getElementById('font-decrease-btn'),
    helpBtn: document.getElementById('help-btn'),
    helpModal: document.getElementById('help-modal'),
    closeHelpBtn: document.getElementById('close-help-btn'),
    toggleHeaderBtn: document.getElementById('toggle-header-btn'),
    headerButtons: document.getElementById('header-buttons'),
    toggleIconUp: document.getElementById('toggle-icon-up'),
    toggleIconDown: document.getElementById('toggle-icon-down'),
    fullscreenBtn: document.getElementById('fullscreen-btn'),
    fullscreenIconEnter: document.getElementById('fullscreen-icon-enter'),
    fullscreenIconExit: document.getElementById('fullscreen-icon-exit'),
    mainContainer: document.getElementById('main-container'),
};

export function updateStatus(text, color) {
    elements.statusText.textContent = text;
    if (color === 'red') {
        elements.statusIndicator.className = 'w-4 h-4 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]';
    } else if (color === 'yellow') {
        elements.statusIndicator.className = 'w-4 h-4 rounded-full bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.8)]';
    } else if (color === 'green') {
        elements.statusIndicator.className = 'w-4 h-4 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]';
    }
}

export function showLoginUI() {
    elements.loginSection.classList.remove('hidden');
    elements.cardsContainer.classList.add('hidden');
    elements.clearLogsBtn.classList.add('hidden');
    elements.logoutBtn.classList.add('hidden');
    elements.changeChannelBtn.classList.add('hidden');
    elements.fullscreenBtn.classList.add('hidden');
    elements.fontIncreaseBtn.classList.add('hidden');
    elements.fontDecreaseBtn.classList.add('hidden');
    elements.helpBtn.classList.add('hidden');
    elements.toggleHeaderBtn.classList.add('hidden');
    elements.currentChannelText.classList.add('hidden');
    updateStatus('未接続', 'red');
}

export function showAppUI() {
    elements.loginSection.classList.add('hidden');
    elements.cardsContainer.classList.remove('hidden');
    elements.cardsContainer.classList.add('flex');
    elements.clearLogsBtn.classList.remove('hidden');
    elements.logoutBtn.classList.remove('hidden');
    elements.changeChannelBtn.classList.remove('hidden');
    elements.fullscreenBtn.classList.remove('hidden');
    elements.fontIncreaseBtn.classList.remove('hidden');
    elements.fontDecreaseBtn.classList.remove('hidden');
    elements.helpBtn.classList.remove('hidden');
    elements.toggleHeaderBtn.classList.remove('hidden');
    updateStatus('接続中...', 'yellow');

    setTimeout(() => { elements.mainContainer.scrollTop = elements.mainContainer.scrollHeight; }, 50);
}

export function applyFontSize() {
    const scale = 1 + state.fontSizeStep * 0.2;
    let styleEl = document.getElementById('dynamic-font-style');
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'dynamic-font-style';
        document.head.appendChild(styleEl);
    }
    styleEl.textContent = `
                /* 全体のコメント間の隙間（ベースgap = 0.0625rem = 1px） */
                #cards-container { gap: ${(0.0625 * scale).toFixed(4)}rem !important; }
                /* カード全体に対するパディング（上下左右すべて2pxをベースに連動） */
                #cards-container > div { padding: ${(0.125 * scale).toFixed(3)}rem !important; }
                /* カードのボーダー太さ（ベースborder-l-4 = 4px） */
                #cards-container .border-l-4 { border-left-width: ${(4 * scale).toFixed(2)}px !important; }
                /* 各種フォントサイズ */
                #cards-container .text-xs  { font-size: ${(0.75 * scale).toFixed(3)}rem !important; }
                #cards-container .text-sm  { font-size: ${(0.875 * scale).toFixed(3)}rem !important; }
                #cards-container .text-base{ font-size: ${(1.0 * scale).toFixed(3)}rem !important; }
                #cards-container .text-lg  { font-size: ${(1.125 * scale).toFixed(3)}rem !important; }
                #cards-container .text-xl  { font-size: ${(1.25 * scale).toFixed(3)}rem !important; }
                /* マージン・パディング・ギャップの連動 */
                #cards-container .mb-1     { margin-bottom: ${(0.25 * scale).toFixed(3)}rem !important; }
                #cards-container .mt-1     { margin-top: ${(0.25 * scale).toFixed(3)}rem !important; }
                #cards-container .px-2     { padding-left: ${(0.5 * scale).toFixed(3)}rem !important; padding-right: ${(0.5 * scale).toFixed(3)}rem !important; }
                #cards-container .py-1     { padding-top: ${(0.25 * scale).toFixed(3)}rem !important; padding-bottom: ${(0.25 * scale).toFixed(3)}rem !important; }
                #cards-container .gap-2    { gap: ${(0.5 * scale).toFixed(3)}rem !important; }
            `;
}

export function clearLogs() {
    if (confirm('表示されているすべてのコメントを消去しますか？')) {
        elements.cardsContainer.innerHTML = '';
        updateStatus('接続中...', 'yellow');
        state.seenUsers.clear();
        localStorage.removeItem('seenUsers');
        state.messageHistory = [];
        localStorage.removeItem('chat_history');
    }
}

export function setupUIEventListeners() {
    elements.loginBtn.addEventListener('click', initiateLogin);
    elements.clearLogsBtn.addEventListener('click', clearLogs);
    elements.changeChannelBtn.addEventListener('click', changeChannelPrompt);
    elements.logoutBtn.addEventListener('click', logout);

    elements.helpBtn.addEventListener('click', () => {
        elements.helpModal.classList.remove('hidden');
    });
    elements.closeHelpBtn.addEventListener('click', () => {
        elements.helpModal.classList.add('hidden');
    });
    elements.helpModal.addEventListener('click', (e) => {
        if (e.target === elements.helpModal) {
            elements.helpModal.classList.add('hidden');
        }
    });

    elements.toggleHeaderBtn.addEventListener('click', () => {
        elements.headerButtons.classList.toggle('hidden');
        elements.toggleIconUp.classList.toggle('hidden');
        elements.toggleIconDown.classList.toggle('hidden');
    });

    elements.fontIncreaseBtn.addEventListener('click', () => {
        if (state.fontSizeStep < 5) {
            state.fontSizeStep++;
            localStorage.setItem('fontSizeStep', state.fontSizeStep);
            applyFontSize();
        }
    });
    elements.fontDecreaseBtn.addEventListener('click', () => {
        if (state.fontSizeStep > -2) {
            state.fontSizeStep--;
            localStorage.setItem('fontSizeStep', state.fontSizeStep);
            applyFontSize();
        }
    });

    elements.fullscreenBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
            if (document.documentElement.requestFullscreen) {
                document.documentElement.requestFullscreen();
            } else if (document.documentElement.webkitRequestFullscreen) {
                document.documentElement.webkitRequestFullscreen();
            } else if (document.documentElement.msRequestFullscreen) {
                document.documentElement.msRequestFullscreen();
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
            }
        }
    });

    const toggleFullscreenIcons = () => {
        if (document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement) {
            elements.fullscreenIconEnter.classList.add('hidden');
            elements.fullscreenIconExit.classList.remove('hidden');
        } else {
            elements.fullscreenIconEnter.classList.remove('hidden');
            elements.fullscreenIconExit.classList.add('hidden');
        }
    };
    document.addEventListener('fullscreenchange', toggleFullscreenIcons);
    document.addEventListener('webkitfullscreenchange', toggleFullscreenIcons);
    document.addEventListener('msfullscreenchange', toggleFullscreenIcons);

    elements.mainContainer.addEventListener('scroll', () => {
        const threshold = 60;
        const atBottom = elements.mainContainer.scrollHeight - elements.mainContainer.scrollTop - elements.mainContainer.clientHeight < threshold;
        state.isAutoScroll = atBottom;
        elements.scrollToBottomBtn.classList.toggle('hidden', atBottom);
    });

    elements.scrollToBottomBtn.addEventListener('click', () => {
        elements.mainContainer.scrollTop = elements.mainContainer.scrollHeight;
        state.isAutoScroll = true;
        elements.scrollToBottomBtn.classList.add('hidden');
    });
}
