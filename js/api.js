import { config } from './config.js';
import { state } from './state.js';
import { logout } from './auth.js';
import { updateStatus, elements, clearLogs } from './ui.js';
import { addCard } from './card.js';

export async function fetchUserData() {
    try {
        const res = await fetch('https://api.twitch.tv/helix/users', {
            headers: {
                'Authorization': `Bearer ${state.accessToken}`,
                'Client-Id': config.CLIENT_ID
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
        state.loggedInUserId = data.data[0].id;

        const savedChannel = localStorage.getItem('target_channel');
        if (savedChannel) {
            state.targetChannelName = savedChannel;
        } else {
            state.targetChannelName = data.data[0].login;
            localStorage.setItem('target_channel', state.targetChannelName);
        }

        await fetchTargetBroadcasterAndConnect();
    } catch (err) {
        console.error(err);
        updateStatus('APIエラー', 'red');
    }
}

export async function checkStreamStatus() {
    try {
        const res = await fetch(`https://api.twitch.tv/helix/streams?user_id=${state.targetBroadcasterId}`, {
            headers: {
                'Authorization': `Bearer ${state.accessToken}`,
                'Client-Id': config.CLIENT_ID
            }
        });
        if (res.ok) {
            const data = await res.json();
            if (data.data && data.data.length > 0) {
                const streamId = data.data[0].id;
                const lastStreamId = localStorage.getItem('last_stream_id');
                if (streamId !== lastStreamId) {
                    console.log('New stream detected, clearing seenUsers...');
                    state.seenUsers.clear();
                    localStorage.removeItem('seenUsers');
                    localStorage.setItem('last_stream_id', streamId);
                }
            } else {
                console.log('Stream offline, cleared seenUsers for next stream...');
                state.seenUsers.clear();
                localStorage.removeItem('seenUsers');
                localStorage.removeItem('last_stream_id');
            }
        }
    } catch (err) {
        console.error('Failed to check stream status:', err);
    }
}

export async function fetchTargetBroadcasterAndConnect() {
    updateStatus('確認中...', 'yellow');
    try {
        const res = await fetch(`https://api.twitch.tv/helix/users?login=${state.targetChannelName}`, {
            headers: {
                'Authorization': `Bearer ${state.accessToken}`,
                'Client-Id': config.CLIENT_ID
            }
        });
        if (!res.ok) throw new Error('Failed to fetch target broadcaster');
        const data = await res.json();

        if (data.data.length === 0) {
            alert(`ユーザー "${state.targetChannelName}" が見つかりませんでした。ご自身のアカウントに戻ります。`);
            localStorage.removeItem('target_channel');
            state.targetChannelName = '';
            updateStatus('ユーザー不明', 'red');
            setTimeout(fetchUserData, 1000);
            return;
        }

        state.targetBroadcasterId = data.data[0].id;
        elements.currentChannelText.textContent = `監視先: ${data.data[0].display_name}`;
        elements.currentChannelText.classList.remove('hidden');

        await checkStreamStatus();
        await fetchBadges();
        connectWebSocket();
    } catch (err) {
        console.error(err);
        updateStatus('APIエラー', 'red');
    }
}

export async function fetchBadges() {
    state.badgeMap = {};
    const headers = { 'Authorization': `Bearer ${state.accessToken}`, 'Client-Id': config.CLIENT_ID };
    try {
        const globalRes = await fetch('https://api.twitch.tv/helix/chat/badges/global', { headers });
        const globalData = await globalRes.json();
        for (const set of (globalData.data || [])) {
            for (const version of (set.versions || [])) {
                state.badgeMap[`${set.set_id}/${version.id}`] = version.image_url_2x;
            }
        }
        const chanRes = await fetch(`https://api.twitch.tv/helix/chat/badges?broadcaster_id=${state.targetBroadcasterId}`, { headers });
        const chanData = await chanRes.json();
        for (const set of (chanData.data || [])) {
            for (const version of (set.versions || [])) {
                state.badgeMap[`${set.set_id}/${version.id}`] = version.image_url_2x;
            }
        }
    } catch (err) {
        console.warn('バッジの取得に失敗しました:', err);
    }
}

export async function changeChannelPrompt() {
    const newChannel = prompt('監視したいTwitchのチャンネルID（ユーザーID）を入力してください。\\n※自身以外のチャンネルを指定した場合、セキュリティの都合上ビッツやポイント機能は取得できません。(コメントのみ監視します)', state.targetChannelName);
    if (newChannel && newChannel.trim() !== '' && newChannel.trim() !== state.targetChannelName) {
        state.targetChannelName = newChannel.trim().toLowerCase();
        localStorage.setItem('target_channel', state.targetChannelName);
        clearLogs();
        state.seenUsers.clear();
        localStorage.removeItem('seenUsers');
        await fetchTargetBroadcasterAndConnect();
    }
}

export function connectWebSocket() {
    if (state.ws) {
        state.ws.onclose = null;
        state.ws.close();
    }
    if (state.wsReconnectTimeout) {
        clearTimeout(state.wsReconnectTimeout);
        state.wsReconnectTimeout = null;
    }
    state.ws = new WebSocket('wss://eventsub.wss.twitch.tv/ws');

    state.ws.onopen = () => {
        console.log('WebSocket connection opened');
    };

    state.ws.onmessage = async (event) => {
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
        }
    };

    state.ws.onclose = (event) => {
        console.log('WebSocket connection closed', event ? event.code : '', event ? event.reason : '');
        updateStatus('切断', 'red');
        if (state.accessToken) {
            state.wsReconnectTimeout = setTimeout(connectWebSocket, 5000);
        }
    };

    state.ws.onerror = (err) => {
        console.error('WebSocket error:', err);
    };
}

export async function subscribeToEvents(sessionId) {
    const types = [
        { type: 'channel.chat.message', version: '1', condition: { broadcaster_user_id: state.targetBroadcasterId, user_id: state.loggedInUserId } },
        { type: 'channel.chat.notification', version: '1', condition: { broadcaster_user_id: state.targetBroadcasterId, user_id: state.loggedInUserId } }
    ];

    if (state.targetBroadcasterId === state.loggedInUserId) {
        types.push({ type: 'channel.channel_points_custom_reward_redemption.add', version: '1', condition: { broadcaster_user_id: state.targetBroadcasterId } });
    }
    types.push({ type: 'channel.follow', version: '2', condition: { broadcaster_user_id: state.targetBroadcasterId, moderator_user_id: state.loggedInUserId } });
    types.push({ type: 'channel.raid', version: '1', condition: { to_broadcaster_user_id: state.targetBroadcasterId } });

    await Promise.all(types.map(async (sub) => {
        try {
            const res = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${state.accessToken}`,
                    'Client-Id': config.CLIENT_ID,
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
                if (errData.status === 403) {
                    console.error('権限エラー: 指定されたユーザーにこの操作を行う権限がないか、必要なスコープ（moderator:read:followers等）が不足しています。');
                    updateStatus('権限エラー(再ログイン必須)', 'red');
                    if (!window.authErrorAlerted) {
                        alert('【Twitch連携エラー】\n現在の権限が古いため、テキスト無しのチャンネルポイント等を正常に取得できません。\n\nお手数ですが、右下の「ログアウト」ボタンから一度連携を解除し、再度ログインを行ってください。');
                        window.authErrorAlerted = true;
                    }
                }
            } else {
                console.log(`Subscribed to ${sub.type}`);
            }
        } catch (err) {
            console.error('Subscription error:', err);
        }
    }));
}

export function buildMessageHtml(message) {
    if (!message || !message.fragments) return '';
    return message.fragments.map(fragment => {
        if (fragment.type === 'emote' && fragment.emote) {
            const emoteId = fragment.emote.id;
            const emoteName = fragment.text || fragment.emote.emote_set_id;
            const emoteUrl = `https://static-cdn.jtvnw.net/emoticons/v2/${emoteId}/default/dark/2.0`;
            return `<img src="${emoteUrl}" alt="${emoteName}" title="${emoteName}" class="inline-block align-middle" style="height:1.6em;vertical-align:middle;margin:0 2px;">`;
        }
        return fragment.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }).join('');
}

// Function to adjust color brightness if it's too dark
function adjustColorBrightness(hex) {
    if (!hex) return '';
    hex = String(hex).replace(/[^0-9a-f]/gi, '');
    if (hex.length < 6) {
        hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }

    let r = parseInt(hex.substring(0, 2), 16);
    let g = parseInt(hex.substring(2, 4), 16);
    let b = parseInt(hex.substring(4, 6), 16);

    // Calculate perceived luminance
    let luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

    // Lighten the color if it is too dark (less than 0.35 luminance)
    if (luminance < 0.35) {
        const factor = 1.8;
        r = Math.min(255, Math.floor(r * factor + 50));
        g = Math.min(255, Math.floor(g * factor + 50));
        b = Math.min(255, Math.floor(b * factor + 50));
    }

    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export function handleNotification(payload) {
    const type = payload.subscription.type;
    const event = payload.event;

    if (type === 'channel.chat.message') {
        const chatterId = event.chatter_user_id;
        const chatterName = event.chatter_user_name || event.chatter_user_login;
        const userColor = adjustColorBrightness(event.color);
        const messageHtml = buildMessageHtml(event.message);

        if (chatterId === state.loggedInUserId && event.message.text.trim() === '!test') {
            addCard({ type: 'first_comment', title: '【テスト】初コメ', username: chatterName, content: '初見です！(テスト)', colorClass: 'blue', userColor: adjustColorBrightness('#000000') }); // Test black color conversion
            addCard({ type: 'subscribe', title: '初コメ ⭐ サブスク', username: '複合色テストさん', contentHtml: '<span>Tier 1 サブスクライブ！🎉 </span><br><span class="text-gray-300 mt-1 block">複合カラー（外側青色、内側ピンク）のテストです！</span>', extra: 'Tier 1', colorClass: 'sub_first', userColor: adjustColorBrightness('#FF69B4') });
            addCard({ type: 'raid_comment', title: 'レイド 🚨 テストchから', username: chatterName, content: 'レイドの二重構造（青色・オレンジ）テスト', colorClass: 'raid_first', userColor: adjustColorBrightness('#00008B') }); // Test dark blue color conversion
            addCard({ type: 'cheer', title: '【テスト】ビッツ', username: chatterName, content: '応援してます！(テスト)', extra: '500 Bits', colorClass: 'purple', userColor });
            addCard({ type: 'points', title: '【テスト】チャンネルポイント', username: chatterName, content: '(テストのテキスト入力)', extra: '足つぼマッサージ', colorClass: 'emerald', userColor });
            addCard({ type: 'raid', title: 'レイド!', username: 'テストチャンネル', contentHtml: '<span>テスト用レイド通知</span>', extra: '50人', colorClass: 'orange' });
            addCard({ type: 'follow', title: 'フォロー', username: 'テストフォロワー', contentHtml: '<span>チャンネルをフォローしました！</span>', colorClass: 'cyan' });
            addCard({ type: 'subscribe', title: 'サブスク', username: 'テストサブスクライバー', contentHtml: '<span>ティア1 サブスクライブ！🎉</span>', extra: 'Tier 1', colorClass: 'pink', userColor: adjustColorBrightness('#FF1493') });
            return;
        }

        if (event.cheer && event.cheer.bits > 0) {
            addCard({
                type: 'cheer',
                title: 'Bits',
                username: chatterName,
                badges: event.badges,
                contentHtml: `<span>${event.cheer.bits} Bits 🎉</span> <span class="text-gray-300"> ${messageHtml}</span>`,
                extra: `${event.cheer.bits} Bits`,
                colorClass: 'purple',
                userColor: userColor
            });
            if (!state.seenUsers.has(chatterId)) {
                state.seenUsers.add(chatterId);
                localStorage.setItem('seenUsers', JSON.stringify(Array.from(state.seenUsers)));
            }
            return;
        }

        const isBroadcaster = state.targetBroadcasterId === state.loggedInUserId;
        if (!isBroadcaster && event.channel_points_custom_reward_id) {
            addCard({
                type: 'points',
                title: 'ポイント',
                username: chatterName,
                badges: event.badges,
                contentHtml: `<span class="text-gray-300">${messageHtml}</span>`,
                extra: 'ポイント交換',
                colorClass: 'emerald',
                userColor: userColor
            });
            if (!state.seenUsers.has(chatterId)) {
                state.seenUsers.add(chatterId);
                localStorage.setItem('seenUsers', JSON.stringify(Array.from(state.seenUsers)));
            }
            return;
        }

        const isFirstComment = !state.seenUsers.has(chatterId);
        if (isFirstComment) {
            state.seenUsers.add(chatterId);
            localStorage.setItem('seenUsers', JSON.stringify(Array.from(state.seenUsers)));

            const isRaider = Date.now() < state.raidEndTime;
            addCard({
                type: isRaider ? 'raid_comment' : 'first_comment',
                title: isRaider ? `レイド 🚨 ${state.raidSource}から` : '初コメ ⭐',
                username: chatterName,
                badges: event.badges,
                contentHtml: messageHtml,
                colorClass: isRaider ? 'raid_first' : 'blue',
                userColor: userColor
            });
        } else {
            addCard({
                type: 'chat',
                title: '',
                username: chatterName,
                badges: event.badges,
                contentHtml: messageHtml,
                colorClass: 'gray',
                userColor: userColor
            });
        }
    } else if (type === 'channel.chat.notification') {
        const noticeType = event.notice_type;
        const chatterName = event.chatter_user_name || event.chatter_user_login || 'System';
        const userColor = adjustColorBrightness(event.color);

        if (noticeType === 'sub' || noticeType === 'resub' || noticeType === 'sub_gift') {
            let tier = 'Prime/Tier 1';
            let subExtra = '';

            let customMessageHtml = '';

            if (noticeType === 'sub' && event.sub) {
                tier = event.sub.sub_tier === '1000' ? 'Tier 1' : event.sub.sub_tier === '2000' ? 'Tier 2' : event.sub.sub_tier === '3000' ? 'Tier 3' : 'Prime';
                // (Very rare but possible according to docs) First time sub custom message
                if (event.sub.sub_message && event.sub.sub_message.fragments) {
                    customMessageHtml = buildMessageHtml(event.sub.sub_message);
                } else if (event.message && event.message.fragments) { // Fallback
                    customMessageHtml = buildMessageHtml(event.message);
                }
            } else if (noticeType === 'resub' && event.resub) {
                tier = event.resub.sub_tier === '1000' ? 'Tier 1' : event.resub.sub_tier === '2000' ? 'Tier 2' : event.resub.sub_tier === '3000' ? 'Tier 3' : 'Prime';
                subExtra = `(${event.resub.cumulative_months}ヶ月)`;
                // Resub standard location for custom messages
                if (event.resub.resub_message && event.resub.resub_message.fragments) {
                    customMessageHtml = buildMessageHtml(event.resub.resub_message);
                } else if (event.message && event.message.fragments) { // Fallback
                    customMessageHtml = buildMessageHtml(event.message);
                }
            } else if (noticeType === 'sub_gift' && event.sub_gift) {
                tier = event.sub_gift.sub_tier === '1000' ? 'Tier 1' : event.sub_gift.sub_tier === '2000' ? 'Tier 2' : event.sub_gift.sub_tier === '3000' ? 'Tier 3' : 'Tier 1';
                subExtra = `ギフト (${event.sub_gift.recipient_user_name}へ)`;
                // Gift subs rarely have a custom message for the event itself, but just in case
                if (event.message && event.message.fragments) {
                    customMessageHtml = buildMessageHtml(event.message);
                }
            }

            let messageHtmlContent = `<span>${tier} サブスクライブ！🎉 ${subExtra}</span>`;
            if (customMessageHtml) {
                messageHtmlContent += `<br><span class="text-gray-300 mt-1 block">${customMessageHtml}</span>`;
            }

            const chatterId = event.chatter_user_id || event.target_user_id; // target_user_id handling for some API payload variations
            let isFirstComment = false;
            if (chatterId && !state.seenUsers.has(chatterId)) {
                isFirstComment = true;
                state.seenUsers.add(chatterId);
                localStorage.setItem('seenUsers', JSON.stringify(Array.from(state.seenUsers)));
            }

            addCard({
                type: isFirstComment ? 'first_comment' : 'subscribe',
                title: isFirstComment ? '初コメ ⭐ サブスク' : 'サブスク',
                username: chatterName,
                contentHtml: messageHtmlContent,
                extra: tier,
                colorClass: isFirstComment ? 'sub_first' : 'pink',
                userColor: userColor
            });
        }
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
        const raiderName = event.from_broadcaster_user_name || event.from_broadcaster_user_login;
        const viewers = event.viewers;
        state.raidSource = raiderName;
        state.raidEndTime = Date.now() + 5 * 60 * 1000;

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
