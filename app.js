const REDIRECT_URI = window.location.origin + window.location.pathname;
// EventSub用のチャット取得やビッツ取得に必要なスコープ
const SCOPES = 'user:read:chat bits:read channel:read:redemptions moderator:read:followers channel:read:subscriptions';

// DOM Elements
const loginBtn = document.getElementById('login-btn');
const clientIdInput = document.getElementById('client-id-input');
const loginSection = document.getElementById('login-section');
const cardsContainer = document.getElementById('cards-container');
const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');
const clearLogsBtn = document.getElementById('clear-logs-btn');
const logoutBtn = document.getElementById('logout-btn');
const changeChannelBtn = document.getElementById('change-channel-btn');
const currentChannelText = document.getElementById('current-channel-text');
const scrollToBottomBtn = document.getElementById('scroll-to-bottom-btn');
const fontIncreaseBtn = document.getElementById('font-increase-btn');
const fontDecreaseBtn = document.getElementById('font-decrease-btn');
const helpBtn = document.getElementById('help-btn');
const helpModal = document.getElementById('help-modal');
const closeHelpBtn = document.getElementById('close-help-btn');
const toggleHeaderBtn = document.getElementById('toggle-header-btn');
const headerButtons = document.getElementById('header-buttons');
const toggleIconUp = document.getElementById('toggle-icon-up');
const toggleIconDown = document.getElementById('toggle-icon-down');

// State
let accessToken = null;
const clientId = "251rxa5wb1ubyf0j00xzg5qc9b59wy";
let loggedInUserId = null;
let targetBroadcasterId = null;
let targetChannelName = '';
let ws = null;
let seenUsers = new Set();
let isAutoScroll = true; // 自動スクロールが有効かどうか
let badgeMap = {}; // バッジ画像のマップ { 'set_id/id': imageUrl }
// 文字サイズステップ (0=標準, -2〜+5まで許容。値が大きいほど大きい)
let fontSizeStep = parseInt(localStorage.getItem('fontSizeStep') || '0', 10);
// レイド監視用: レイド発生後5分間の初コメをオレンジ表示
let raidEndTime = 0; // レイドウィンドウ終了時刻 (Unix ms)
let raidSource = ''; // レイド元のチャンネル名

let wsReconnectTimeout = null;   // WebSocketの再接続ループ防止用タイマー

document.addEventListener('DOMContentLoaded', () => {
    // Load seen users from localStorage to persist across reloads
    const storedUsers = localStorage.getItem('seenUsers');
    if (storedUsers) {
        try {
            seenUsers = new Set(JSON.parse(storedUsers));
        } catch (e) {
            seenUsers = new Set();
        }
    }

    checkAuth();

    // 初期フォントサイズを適用
    applyFontSize();

    loginBtn.addEventListener('click', initiateLogin);
    clearLogsBtn.addEventListener('click', clearLogs);
    changeChannelBtn.addEventListener('click', changeChannelPrompt);
    logoutBtn.addEventListener('click', logout);

    // ヘルプモーダルの開閉
    helpBtn.addEventListener('click', () => {
        helpModal.classList.remove('hidden');
    });
    closeHelpBtn.addEventListener('click', () => {
        helpModal.classList.add('hidden');
    });
    helpModal.addEventListener('click', (e) => {
        if (e.target === helpModal) {
            helpModal.classList.add('hidden');
        }
    });

    // ヘッダー折りたたみ
    toggleHeaderBtn.addEventListener('click', () => {
        headerButtons.classList.toggle('hidden');
        toggleIconUp.classList.toggle('hidden');
        toggleIconDown.classList.toggle('hidden');
    });

    // A+ / A- ボタン
    fontIncreaseBtn.addEventListener('click', () => {
        if (fontSizeStep < 5) {
            fontSizeStep++;
            localStorage.setItem('fontSizeStep', fontSizeStep);
            applyFontSize();
        }
    });
    fontDecreaseBtn.addEventListener('click', () => {
        if (fontSizeStep > -2) {
            fontSizeStep--;
            localStorage.setItem('fontSizeStep', fontSizeStep);
            applyFontSize();
        }
    });

    // スクロール位置で自動スクロールのON/OFFを切り替える
    // 一番下にいるときはON、手動でスクロールアップしたらOFF
    const mainEl = document.getElementById('main-container');
    mainEl.addEventListener('scroll', () => {
        const threshold = 60; // 下端からこの距離以内なら自動スクロールON
        const atBottom = mainEl.scrollHeight - mainEl.scrollTop - mainEl.clientHeight < threshold;
        isAutoScroll = atBottom;
        // 自動スクロールがOFFのときだけ「最新へ戻る」ボタンを表示
        scrollToBottomBtn.classList.toggle('hidden', atBottom);
    });

    // 「最新へ戻る」ボタン押下でスクロールを一番下へ戻す
    scrollToBottomBtn.addEventListener('click', () => {
        const mainEl = document.getElementById('main-container');
        mainEl.scrollTop = mainEl.scrollHeight;
        isAutoScroll = true;
        scrollToBottomBtn.classList.add('hidden');
    });
});

// --- Authentication ---
function initiateLogin() {
    // force_verify=true を付与して、毎回必ず同意画面（最新のスコープ要求）を表示させる
    const authUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=token&scope=${encodeURIComponent(SCOPES)}&force_verify=true`;
    window.location.href = authUrl;
}

function checkAuth() {
    // Check Hash for Implicit Grant Token
    const hash = window.location.hash;
    if (hash && hash.includes('access_token')) {
        const params = new URLSearchParams(hash.substring(1));
        accessToken = params.get('access_token');
        localStorage.setItem('twitch_access_token', accessToken);
        // Clear hash
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
    } else {
        accessToken = localStorage.getItem('twitch_access_token');
    }

    if (accessToken && clientId) {
        showAppUI();
        fetchUserData();
    } else {
        showLoginUI();
    }
}

function logout() {
    if (confirm('ログアウトして連携を解除しますか？')) {
        localStorage.removeItem('twitch_access_token');
        localStorage.removeItem('target_channel');
        localStorage.removeItem('seenUsers');
        if (ws) ws.close();
        window.location.reload();
    }
}

// --- UI State Management ---
function showLoginUI() {
    loginSection.classList.remove('hidden');
    cardsContainer.classList.add('hidden');
    clearLogsBtn.classList.add('hidden');
    logoutBtn.classList.add('hidden');
    changeChannelBtn.classList.add('hidden');
    fontIncreaseBtn.classList.add('hidden');
    fontDecreaseBtn.classList.add('hidden');
    helpBtn.classList.add('hidden');
    toggleHeaderBtn.classList.add('hidden');
    currentChannelText.classList.add('hidden');
    updateStatus('未接続', 'red');
}

function showAppUI() {
    loginSection.classList.add('hidden');
    cardsContainer.classList.remove('hidden');
    cardsContainer.classList.add('flex');
    clearLogsBtn.classList.remove('hidden');
    logoutBtn.classList.remove('hidden');
    changeChannelBtn.classList.remove('hidden');
    fontIncreaseBtn.classList.remove('hidden');
    fontDecreaseBtn.classList.remove('hidden');
    helpBtn.classList.remove('hidden');
    toggleHeaderBtn.classList.remove('hidden');
    updateStatus('接続中...', 'yellow');
    // 接続後は最新コメントが見えるよう一番下へスクロール
    const mainEl = document.getElementById('main-container');
    setTimeout(() => { mainEl.scrollTop = mainEl.scrollHeight; }, 50);
}

// A+/A-ボタンによる文字サイズを適用する
// Tailwindのtext-*クラスはrem固定値のため、dynamicスタイルタグで!important上書きする
function applyFontSize() {
    const scale = 1 + fontSizeStep * 0.2; // 1ステップ=20%アップ
    let styleEl = document.getElementById('dynamic-font-style');
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'dynamic-font-style';
        document.head.appendChild(styleEl);
    }
    styleEl.textContent = `
                #cards-container .text-xs  { font-size: ${(0.75 * scale).toFixed(3)}rem !important; }
                #cards-container .text-sm  { font-size: ${(0.875 * scale).toFixed(3)}rem !important; }
                #cards-container .text-base{ font-size: ${(1.0 * scale).toFixed(3)}rem !important; }
                #cards-container .text-lg  { font-size: ${(1.125 * scale).toFixed(3)}rem !important; }
                #cards-container .text-xl  { font-size: ${(1.25 * scale).toFixed(3)}rem !important; }
                #cards-container img       { height:    ${(1.1 * scale).toFixed(3)}em  !important; }
            `;
}

function updateStatus(text, color) {
    statusText.textContent = text;
    if (color === 'red') {
        statusIndicator.className = 'w-4 h-4 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]';
    } else if (color === 'yellow') {
        statusIndicator.className = 'w-4 h-4 rounded-full bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.8)]';
    } else if (color === 'green') {
        statusIndicator.className = 'w-4 h-4 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]';
    }
}

function logout() {
    localStorage.removeItem('twitch_access_token');
    accessToken = null;
    showLoginUI();
}

// --- Twitch API Calls ---
async function fetchUserData() {
    try {
        // 1. まずログインユーザー自身(アクセストークンの持ち主)のIDを取得
        const res = await fetch('https://api.twitch.tv/helix/users', {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Client-Id': clientId
            }
        });
        if (!res.ok) {
            if (res.status === 401) {
                logout();
                return;
            }
            throw new Error('Failed to fetch user data');
        }
        const data = await res.json();
        loggedInUserId = data.data[0].id;

        // 2. 監視先のチャンネルを決定（初期は自分自身のログイン名）
        const savedChannel = localStorage.getItem('target_channel');
        if (savedChannel) {
            targetChannelName = savedChannel;
        } else {
            targetChannelName = data.data[0].login;
            localStorage.setItem('target_channel', targetChannelName);
        }

        await fetchTargetBroadcasterAndConnect();
    } catch (err) {
        console.error(err);
        updateStatus('APIエラー', 'red');
    }
}

// 現在の配信状態を確認し、新しい配信であれば初コメ履歴をリセットする
async function checkStreamStatus() {
    try {
        const res = await fetch(`https://api.twitch.tv/helix/streams?user_id=${targetBroadcasterId}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Client-Id': clientId
            }
        });
        if (res.ok) {
            const data = await res.json();
            if (data.data && data.data.length > 0) {
                const streamId = data.data[0].id;
                const lastStreamId = localStorage.getItem('last_stream_id');
                if (streamId !== lastStreamId) {
                    console.log('New stream detected, clearing seenUsers...');
                    seenUsers.clear();
                    localStorage.removeItem('seenUsers');
                    localStorage.setItem('last_stream_id', streamId);
                }
            } else {
                // オフラインの場合は履歴をリセットして次の配信に備える
                console.log('Stream offline, cleared seenUsers for next stream...');
                seenUsers.clear();
                localStorage.removeItem('seenUsers');
                localStorage.removeItem('last_stream_id');
            }
        }
    } catch (err) {
        console.error('Failed to check stream status:', err);
    }
}

async function fetchTargetBroadcasterAndConnect() {
    updateStatus('確認中...', 'yellow');
    try {
        const res = await fetch(`https://api.twitch.tv/helix/users?login=${targetChannelName}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Client-Id': clientId
            }
        });
        if (!res.ok) throw new Error('Failed to fetch target broadcaster');
        const data = await res.json();

        if (data.data.length === 0) {
            alert(`ユーザー "${targetChannelName}" が見つかりませんでした。ご自身のアカウントに戻ります。`);
            localStorage.removeItem('target_channel');
            targetChannelName = '';
            updateStatus('ユーザー不明', 'red');
            setTimeout(fetchUserData, 1000);
            return;
        }

        targetBroadcasterId = data.data[0].id;
        currentChannelText.textContent = `監視先: ${data.data[0].display_name}`;
        currentChannelText.classList.remove('hidden');

        // 配信状態をチェックして初コメリセット判定を行う
        await checkStreamStatus();

        // バッジ画像マップを取得してからWebSocketへ接続
        await fetchBadges();
        connectWebSocket();
    } catch (err) {
        console.error(err);
        updateStatus('APIエラー', 'red');
    }
}

// グローバルバッジとチャンネル固有バッジをTwitch APIから取得しbadgeMapに記憶する
async function fetchBadges() {
    badgeMap = {};
    const headers = { 'Authorization': `Bearer ${accessToken}`, 'Client-Id': clientId };
    try {
        // グローバルバッジ（全チャンネル共通）
        const globalRes = await fetch('https://api.twitch.tv/helix/chat/badges/global', { headers });
        const globalData = await globalRes.json();
        for (const set of (globalData.data || [])) {
            for (const version of (set.versions || [])) {
                badgeMap[`${set.set_id}/${version.id}`] = version.image_url_2x;
            }
        }
        // チャンネル固有バッジ（サブスクライバーバッジなど）
        const chanRes = await fetch(`https://api.twitch.tv/helix/chat/badges?broadcaster_id=${targetBroadcasterId}`, { headers });
        const chanData = await chanRes.json();
        for (const set of (chanData.data || [])) {
            for (const version of (set.versions || [])) {
                badgeMap[`${set.set_id}/${version.id}`] = version.image_url_2x;
            }
        }
    } catch (err) {
        console.warn('バッジの取得に失敗しました:', err);
    }
}

// イベントのBadges配列から画像タグのHTMLを生成
function buildBadgesHtml(badges) {
    if (!badges || badges.length === 0) return '';
    return badges.map(badge => {
        const url = badgeMap[`${badge.set_id}/${badge.id}`];
        if (!url) return '';
        return `<img src="${url}" alt="${badge.set_id}" title="${badge.set_id}" class="inline-block align-middle" style="height:1.1em;margin-right:3px;vertical-align:middle;">`;
    }).join('');
}

async function changeChannelPrompt() {
    const newChannel = prompt('監視したいTwitchのチャンネルID（ユーザーID）を入力してください。\n※自身以外のチャンネルを指定した場合、セキュリティの都合上ビッツやポイント機能は取得できません。(コメントのみ監視します)', targetChannelName);
    if (newChannel && newChannel.trim() !== '' && newChannel.trim() !== targetChannelName) {
        targetChannelName = newChannel.trim().toLowerCase();
        localStorage.setItem('target_channel', targetChannelName);
        clearLogs();
        seenUsers.clear();
        localStorage.removeItem('seenUsers');
        await fetchTargetBroadcasterAndConnect();
    }
}

// --- EventSub WebSocket ---
function connectWebSocket() {
    if (ws) {
        ws.onclose = null; // 再接続ループ防止
        ws.close();
    }
    if (wsReconnectTimeout) {
        clearTimeout(wsReconnectTimeout);
        wsReconnectTimeout = null;
    }
    ws = new WebSocket('wss://eventsub.wss.twitch.tv/ws');

    ws.onopen = () => {
        console.log('WebSocket connection opened');
    };

    ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);

        if (data.metadata.message_type === 'session_welcome') {
            const sessionId = data.payload.session.id;
            updateStatus('接続完了', 'green');
            await subscribeToEvents(sessionId);
        } else if (data.metadata.message_type === 'session_keepalive') {
            // Keepalive
        } else if (data.metadata.message_type === 'notification') {
            handleNotification(data.payload);
        } else if (data.metadata.message_type === 'session_reconnect') {
            console.log('Reconnect requested');
            // Twitch will send a new WebSocket URL to connect to, but a simple reload/reconnect is often enough.
        }
    };

    ws.onclose = (event) => {
        console.log('WebSocket connection closed', event ? event.code : '', event ? event.reason : '');
        updateStatus('切断', 'red');
        if (accessToken) {
            // Reconnect later
            wsReconnectTimeout = setTimeout(connectWebSocket, 5000);
        }
    };

    ws.onerror = (err) => {
        console.error('WebSocket error:', err);
    };
}

async function subscribeToEvents(sessionId) {
    const types = [
        // チャット取得には、監視先ID(broadcaster_user_id)と読取者自身のID(user_id)が必要
        { type: 'channel.chat.message', version: '1', condition: { broadcaster_user_id: targetBroadcasterId, user_id: loggedInUserId } },
        // サブスクやシステムメッセージを受け取るチャット通知（全チャンネル共通・user:read:chatで取得可能）
        { type: 'channel.chat.notification', version: '1', condition: { broadcaster_user_id: targetBroadcasterId, user_id: loggedInUserId } }
    ];

    // Twitch API仕様: ビッツ等の専用通知は自分のチャンネルしか取れないため、本人の場合は専用Webhookを利用し、別人の場合はチャットから解析するよう併用しています。
    if (targetBroadcasterId === loggedInUserId) {
        types.push({ type: 'channel.cheer', version: '1', condition: { broadcaster_user_id: targetBroadcasterId } });
        types.push({ type: 'channel.channel_points_custom_reward_redemption.add', version: '1', condition: { broadcaster_user_id: targetBroadcasterId } });
        types.push({ type: 'channel.subscribe', version: '1', condition: { broadcaster_user_id: targetBroadcasterId } });
    }
    // フォロー通知（モデレーター権限があれば他人のチャンネルでも取得可能）
    types.push({ type: 'channel.follow', version: '2', condition: { broadcaster_user_id: targetBroadcasterId, moderator_user_id: loggedInUserId } });

    // レイドは全チャンネル共通・追加スコープ不要
    types.push({ type: 'channel.raid', version: '1', condition: { to_broadcaster_user_id: targetBroadcasterId } });

    // 10秒以内にすべてのサブスクリプションを完了させるため、並列(Promise.all)でリクエストを送信
    await Promise.all(types.map(async (sub) => {
        try {
            const res = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Client-Id': clientId,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    type: sub.type,
                    version: sub.version,
                    condition: sub.condition,
                    transport: {
                        method: 'websocket',
                        session_id: sessionId
                    }
                })
            });

            if (!res.ok) {
                const errData = await res.json();
                console.error(`Failed to subscribe to ${sub.type}:`, errData);
            } else {
                console.log(`Subscribed to ${sub.type}`);
            }
        } catch (err) {
            console.error('Subscription error:', err);
        }
    }));
}

function handleNotification(payload) {
    const type = payload.subscription.type;
    const event = payload.event;

    if (type === 'channel.chat.message') {
        const chatterId = event.chatter_user_id;
        const chatterName = event.chatter_user_name || event.chatter_user_login;
        // エモート(スタンプ)を画像に変換してHTMLを生成
        const messageHtml = buildMessageHtml(event.message);

        // --- 動作確認テスト用コマンド ---
        // ツールにログインしている本人がチャットで「!test」と発言した場合、全カードのテスト表示を行う
        if (chatterId === loggedInUserId && event.message.text.trim() === '!test') {
            addCard({ type: 'first_comment', title: '【テスト】初コメ', username: chatterName, content: '初見です！(テスト)', colorClass: 'blue' });
            addCard({ type: 'raid_comment', title: 'レイド テストchから', username: chatterName, content: 'レイドから来ました(テスト)', colorClass: 'orange' });
            addCard({ type: 'cheer', title: '【テスト】ビッツ', username: chatterName, content: '応援してます！(テスト)', extra: '500 Bits', colorClass: 'purple' });
            addCard({ type: 'points', title: '【テスト】チャンネルポイント', username: chatterName, content: '(テストのテキスト入力)', extra: '足つぼマッサージ', colorClass: 'emerald' });
            addCard({ type: 'raid', title: 'レイド!', username: 'テストチャンネル', contentHtml: '<span>テスト用レイド通知</span>', extra: '50人', colorClass: 'orange' });
            addCard({ type: 'follow', title: 'フォロー', username: 'テストフォロワー', contentHtml: '<span>チャンネルをフォローしました！</span>', colorClass: 'cyan' });
            addCard({ type: 'subscribe', title: 'サブスク', username: 'テストサブスクライバー', contentHtml: '<span>ティア1 サブスクライブ！🎉</span>', extra: 'Tier 1', colorClass: 'pink' });
            return;
        }

        // (以前は本人のコメントを初見コメントから除外していましたが、設定要望により除外処理を廃止しました)

        const isBroadcaster = targetBroadcasterId === loggedInUserId;

        // --- ビッツ（Cheer）の判定（チャットベースは他人のチャンネルの場合のみ） ---
        if (!isBroadcaster && event.cheer && event.cheer.bits > 0) {
            addCard({
                type: 'cheer',
                title: 'Bits',
                username: chatterName,
                badges: event.badges,
                contentHtml: `<span>${event.cheer.bits} Bits 🎉</span> <span class="text-gray-300"> ${messageHtml}</span>`,
                extra: `${event.cheer.bits} Bits`,
                colorClass: 'purple'
            });
            // 初コメとして扱わないよう記録だけしておく
            if (!seenUsers.has(chatterId)) {
                seenUsers.add(chatterId);
                localStorage.setItem('seenUsers', JSON.stringify(Array.from(seenUsers)));
            }
            return;
        }

        // --- チャンネルポイント（メッセージ付き）の判定（チャットベースは他人のチャンネルの場合のみ） ---
        if (!isBroadcaster && event.channel_points_custom_reward_id) {
            addCard({
                type: 'points',
                title: 'ポイント',
                username: chatterName,
                badges: event.badges,
                contentHtml: `<span class="text-gray-300">${messageHtml}</span>`,
                extra: 'ポイント交換', // チャットメッセージからは報酬名が取れないため固定
                colorClass: 'emerald'
            });
            if (!seenUsers.has(chatterId)) {
                seenUsers.add(chatterId);
                localStorage.setItem('seenUsers', JSON.stringify(Array.from(seenUsers)));
            }
            return;
        }

        const isFirstComment = !seenUsers.has(chatterId);
        if (isFirstComment) {
            // 初回コメント→記録しておく
            seenUsers.add(chatterId);
            localStorage.setItem('seenUsers', JSON.stringify(Array.from(seenUsers)));

            // レイドウィンドウ内の初コメはオレンジ（レイドから来た可能性が高い）
            const isRaider = Date.now() < raidEndTime;
            addCard({
                type: isRaider ? 'raid_comment' : 'first_comment',
                title: isRaider ? `レイド 🚨 ${raidSource}から` : '初コメ ⭐',
                username: chatterName,
                badges: event.badges,
                contentHtml: messageHtml,
                colorClass: isRaider ? 'orange' : 'blue'
            });
        } else {
            // 2回目以降のコメントも通常カードとして表示する
            addCard({
                type: 'chat',
                title: '',
                username: chatterName,
                badges: event.badges,
                contentHtml: messageHtml,
                colorClass: 'gray'
            });
        }
    } else if (type === 'channel.chat.notification') {
        const isBroadcaster = targetBroadcasterId === loggedInUserId;
        if (isBroadcaster) return; // 配信者本人の場合は専用Webhook(channel.subscribe)で取得するため重複排除

        // --- 新機能: チャット通知(サブスク等)を他人のチャンネル向けに処理 ---
        const noticeType = event.notice_type;
        const chatterName = event.chatter_user_name || event.chatter_user_login || 'System';

        if (noticeType === 'sub' || noticeType === 'resub' || noticeType === 'sub_gift') {
            let tier = 'Prime/Tier 1';
            let subExtra = '';

            if (noticeType === 'sub' && event.sub) {
                tier = event.sub.sub_tier === '1000' ? 'Tier 1' : event.sub.sub_tier === '2000' ? 'Tier 2' : event.sub.sub_tier === '3000' ? 'Tier 3' : 'Prime';
            } else if (noticeType === 'resub' && event.resub) {
                tier = event.resub.sub_tier === '1000' ? 'Tier 1' : event.resub.sub_tier === '2000' ? 'Tier 2' : event.resub.sub_tier === '3000' ? 'Tier 3' : 'Prime';
                subExtra = `(${event.resub.cumulative_months}ヶ月)`;
            } else if (noticeType === 'sub_gift' && event.sub_gift) {
                tier = event.sub_gift.sub_tier === '1000' ? 'Tier 1' : event.sub_gift.sub_tier === '2000' ? 'Tier 2' : event.sub_gift.sub_tier === '3000' ? 'Tier 3' : 'Tier 1';
                subExtra = `ギフト (${event.sub_gift.recipient_user_name}へ)`;
            }

            addCard({
                type: 'subscribe',
                title: 'サブスク',
                username: chatterName,
                contentHtml: `<span>${tier} サブスクライブ！🎉 ${subExtra}</span>`,
                extra: tier,
                colorClass: 'pink'
            });
        }
    } else if (type === 'channel.cheer') {
        const bits = event.bits;
        const message = event.message || '';
        const userName = event.is_anonymous ? 'アノニマス' : (event.user_name || event.user_login);

        addCard({
            type: 'cheer',
            title: 'Bits',
            username: userName,
            contentHtml: `<span>${bits} Bits 🎉</span> <span class="text-gray-300">${message}</span>`,
            extra: `${bits} Bits`,
            colorClass: 'purple'
        });
    } else if (type === 'channel.channel_points_custom_reward_redemption.add') {
        const rewardName = event.reward.title;
        const userName = event.user_name || event.user_login;

        addCard({
            type: 'points',
            title: 'ポイント',
            username: userName,
            contentHtml: event.user_input ? `<span class="text-gray-300">${event.user_input}</span>` : '',
            extra: rewardName,
            colorClass: 'emerald'
        });
    } else if (type === 'channel.raid') {
        // レイド通知: 5分間のレイドウィンドウを開始
        const raiderName = event.from_broadcaster_user_name || event.from_broadcaster_user_login;
        const viewers = event.viewers;
        raidSource = raiderName;
        raidEndTime = Date.now() + 5 * 60 * 1000; // 5分間

        addCard({
            type: 'raid',
            title: 'レイド!',
            username: raiderName,
            contentHtml: `<span>🚨 <strong>${raiderName}</strong> からレイドが来ました!</span>`,
            extra: `${viewers}人`,
            colorClass: 'orange'
        });
    } else if (type === 'channel.follow') {
        const followerName = event.user_name || event.user_login;
        addCard({
            type: 'follow',
            title: 'フォロー',
            username: followerName,
            contentHtml: `<span>チャンネルをフォローしました！💙</span>`,
            colorClass: 'cyan'
        });
    } else if (type === 'channel.subscribe') {
        const subName = event.user_name || event.user_login;
        const tierMap = { '1000': 'Tier 1', '2000': 'Tier 2', '3000': 'Tier 3' };
        const tier = tierMap[event.tier] || 'Prime';
        // ギフトかどうか（is_giftはv1サブスク通知用）
        const isGift = event.is_gift ? "ギフト" : "";

        addCard({
            type: 'subscribe',
            title: 'サブスク',
            username: subName,
            contentHtml: `<span>${tier} サブスクライブ！🎉 ${isGift}</span>`,
            extra: tier,
            colorClass: 'pink'
        });
    }
}

// エモート(スタンプ)を含むメッセージのHTML生成
// Twitch EventSub API は message.fragments に各パーツのtypeとemote情報を含める
function buildMessageHtml(message) {
    if (!message || !message.fragments) return '';
    return message.fragments.map(fragment => {
        if (fragment.type === 'emote' && fragment.emote) {
            const emoteId = fragment.emote.id;
            const emoteName = fragment.text || fragment.emote.emote_set_id;
            // Twitch CDNのエモート画像URL (1x, 2x, 4xから2xを使用)
            const emoteUrl = `https://static-cdn.jtvnw.net/emoticons/v2/${emoteId}/default/dark/2.0`;
            return `<img src="${emoteUrl}" alt="${emoteName}" title="${emoteName}" class="inline-block align-middle" style="height:1.6em;vertical-align:middle;margin:0 2px;">`;
        }
        // テキストはそのまま（HTMLエスケープ）
        return fragment.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }).join('');
}

// --- UI Card Rendering ---
function addCard(data) {
    const card = document.createElement('div');

    const colorMap = {
        'blue': { bg: 'bg-blue-900', border: 'border-blue-500', textTitle: 'text-blue-300', textContent: 'text-gray-100', textExtra: '', extraBg: '' },
        'purple': { bg: 'bg-purple-900', border: 'border-purple-500', textTitle: 'text-purple-300', textContent: 'text-gray-100', textExtra: 'text-yellow-400 font-extrabold', extraBg: '' },
        'emerald': { bg: 'bg-emerald-900', border: 'border-emerald-500', textTitle: 'text-emerald-300', textContent: 'text-gray-100', textExtra: 'text-emerald-100', extraBg: 'bg-emerald-950 px-2 py-1 rounded mt-1 inline-block text-sm' },
        'orange': { bg: 'bg-orange-900', border: 'border-orange-500', textTitle: 'text-orange-300', textContent: 'text-gray-100', textExtra: 'text-orange-100 font-bold', extraBg: 'bg-orange-950 px-2 py-1 rounded mt-1 inline-block text-sm' },
        'cyan': { bg: 'bg-cyan-900', border: 'border-cyan-500', textTitle: 'text-cyan-300', textContent: 'text-gray-100', textExtra: '', extraBg: '' },
        'pink': { bg: 'bg-pink-900', border: 'border-pink-500', textTitle: 'text-pink-300', textContent: 'text-gray-100', textExtra: 'text-pink-200 font-bold', extraBg: 'bg-pink-950 px-2 py-1 rounded mt-1 inline-block text-sm' },
        'gray': { bg: 'bg-gray-800', border: 'border-gray-600', textTitle: 'text-gray-400', textContent: 'text-gray-100', textExtra: '', extraBg: '' },
        'red': { bg: 'bg-red-900', border: 'border-red-500', textTitle: 'text-red-300', textContent: 'text-gray-100', textExtra: '', extraBg: '' }
    };

    const colors = colorMap[data.colorClass];
    // バッジのHTMLを生成
    const badgesHtml = buildBadgesHtml(data.badges);
    // コンテンツHTML: data.contentHtml が優先、なければ data.content をテキストとして扱う
    const messageHtmlContent = data.contentHtml !== undefined
        ? data.contentHtml
        : (data.content || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // カードのベーススタイル（コンパクト化: p-5 → p-3）
    card.className = `${colors.bg} border-l-4 ${colors.border} p-3 rounded-lg shadow cursor-pointer transition-all duration-300`;

    let html = '';

    if (data.type === 'cheer') {
        // ビッツ: ユーザー名と金額を横並び
        html = `
                    <div class="flex items-center justify-between gap-2 mb-1">
                        <span class="text-lg font-bold text-white truncate">${badgesHtml}${data.username}</span>
                        <span class="${colors.textExtra} text-sm whitespace-nowrap">${data.extra}</span>
                    </div>
                    <div class="text-sm ${colors.textContent} break-words leading-snug">${messageHtmlContent}</div>
                `;
    } else if (data.type === 'points') {
        // ポイント: 報酬名を目立たせる
        html = `
                    <div class="flex items-center justify-between gap-2 mb-1">
                        <span class="text-lg font-bold text-white truncate">${badgesHtml}${data.username}</span>
                    </div>
                    <div class="${colors.textExtra} ${colors.extraBg} text-sm font-bold">${data.extra}</div>
                    ${data.contentHtml ? `<div class="text-sm ${colors.textContent} break-words leading-snug mt-1">${messageHtmlContent}</div>` : ''}
                `;
    } else if (data.type === 'first_comment' || data.type === 'raid_comment') {
        // 初コメ / レイド初コメ: タイトルバッジ付きで目立たせる
        const badgeColor = data.type === 'raid_comment' ? 'bg-orange-800' : 'bg-blue-800';
        html = `
                    <div class="flex items-center gap-2 mb-1">
                        <span class="text-xs font-bold ${colors.textTitle} ${badgeColor} px-2 py-0.5 rounded">${data.title}</span>
                        <span class="text-lg font-bold text-white truncate">${badgesHtml}${data.username}</span>
                    </div>
                    <div class="text-sm ${colors.textContent} break-words leading-snug">${messageHtmlContent}</div>
                `;
    } else if (data.type === 'raid' || data.type === 'subscribe') {
        // レイド通知・サブスク通知: 右上に付加情報を表示
        html = `
                    <div class="flex items-center justify-between gap-2 mb-1">
                        <span class="text-lg font-bold text-white truncate">${data.username}</span>
                    </div>
                    ${data.extra ? `<div class="${colors.textExtra} ${colors.extraBg} text-sm font-bold mb-1">${data.extra}</div>` : ''}
                    <div class="text-sm ${colors.textContent} break-words leading-snug mt-1">${messageHtmlContent}</div>
                `;
    } else if (data.type === 'follow') {
        // フォロー通知自体
        html = `
                    <div class="flex items-center justify-between gap-2 mb-1">
                        <span class="text-lg font-bold text-white truncate">${data.username}</span>
                    </div>
                    <div class="text-sm ${colors.textContent} break-words leading-snug">${messageHtmlContent}</div>
                `;
    } else {
        // 通常コメント: シンプルに（タイトルなし）
        html = `
                    <div class="text-sm font-bold ${colors.textTitle} mb-0.5">${badgesHtml}${data.username}</div>
                    <div class="text-sm ${colors.textContent} break-words leading-snug">${messageHtmlContent}</div>
                `;
    }

    card.innerHTML = html;

    // タップで既読状態を切り替える（縁をグレーにし、半透明にする）
    card.addEventListener('click', () => {
        const isRead = card.classList.toggle('is-read');
        if (isRead) {
            card.classList.remove(colors.border);
            card.classList.add('border-gray-600', 'opacity-50');
        } else {
            card.classList.remove('border-gray-600', 'opacity-50');
            card.classList.add(colors.border);
        }
    });

    // 一番下に追加（Twitchチャット欄と同じ上から下の流れ）
    cardsContainer.appendChild(card);

    // 自動スクロールが有効な場合、最新コメントが見えるよう一番下へスクロール
    if (isAutoScroll) {
        const mainEl = document.getElementById('main-container');
        mainEl.scrollTop = mainEl.scrollHeight;
    }
}

function clearLogs() {
    cardsContainer.innerHTML = '';
}