import { state } from './state.js';
import { elements } from './ui.js';

// Function to check if color is too dark
function isColorDark(hex) {
    if (!hex) return false;
    hex = String(hex).replace(/[^0-9a-f]/gi, '');
    if (hex.length < 6) {
        hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    let r = parseInt(hex.substring(0, 2), 16);
    let g = parseInt(hex.substring(2, 4), 16);
    let b = parseInt(hex.substring(4, 6), 16);
    let luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance < 0.35;
}

export function buildBadgesHtml(badges) {
    if (!badges || badges.length === 0) return '';
    return badges.map(badge => {
        const url = state.badgeMap[`${badge.set_id}/${badge.id}`];
        if (!url) return '';
        return `<img src="${url}" alt="${badge.set_id}" title="${badge.set_id}" class="inline-block align-middle" style="height:1.1em;margin-right:3px;vertical-align:middle;">`;
    }).join('');
}

export function addCard(data, isRestore = false) {
    const card = document.createElement('div');
    if (data.messageId) card.dataset.messageId = data.messageId;
    if (data.userId) card.dataset.userId = data.userId;
    card._messageData = data; // フィルタリング用に元のデータを保持

    const colorMap = {
        'blue': { bg: 'bg-blue-900', innerBg: '', border: 'border-blue-500', textTitle: 'text-blue-300', textContent: 'text-gray-100', textExtra: '', extraBg: '' },
        'purple': { bg: 'bg-purple-900', innerBg: '', border: 'border-purple-500', textTitle: 'text-purple-300', textContent: 'text-gray-100', textExtra: 'text-yellow-400 font-extrabold', extraBg: '' },
        'emerald': { bg: 'bg-emerald-900', innerBg: '', border: 'border-emerald-500', textTitle: 'text-emerald-300', textContent: 'text-gray-100', textExtra: 'text-emerald-100', extraBg: 'bg-emerald-950 px-2 py-1 rounded mt-1 inline-block text-sm' },
        'orange': { bg: 'bg-orange-900', innerBg: '', border: 'border-orange-500', textTitle: 'text-orange-300', textContent: 'text-gray-100', textExtra: 'text-orange-100 font-bold', extraBg: 'bg-orange-950 px-2 py-1 rounded mt-1 inline-block text-sm' },
        'cyan': { bg: 'bg-cyan-900', innerBg: '', border: 'border-cyan-500', textTitle: 'text-cyan-300', textContent: 'text-gray-100', textExtra: '', extraBg: '' },
        'pink': { bg: 'bg-pink-900', innerBg: '', border: 'border-pink-500', textTitle: 'text-pink-300', textContent: 'text-gray-100', textExtra: 'text-pink-200 font-bold', extraBg: 'bg-pink-950 px-2 py-1 rounded mt-1 inline-block text-sm' },
        'sub_first': { bg: 'bg-blue-900', innerBg: 'bg-pink-900', border: 'border-blue-500', textTitle: 'text-blue-300', textContent: 'text-gray-100', textExtra: 'text-pink-200 font-bold', extraBg: 'bg-pink-950 px-2 py-1 rounded mt-1 inline-block text-sm' },
        'raid_first': { bg: 'bg-blue-900', innerBg: 'bg-orange-900', border: 'border-blue-500', textTitle: 'text-blue-300', textContent: 'text-gray-100', textExtra: '', extraBg: '' },
        'gray': { bg: 'bg-gray-800', innerBg: '', border: 'border-gray-600', textTitle: 'text-gray-400', textContent: 'text-gray-100', textExtra: '', extraBg: '' },
        'red': { bg: 'bg-red-900', innerBg: '', border: 'border-red-500', textTitle: 'text-red-300', textContent: 'text-gray-100', textExtra: '', extraBg: '' },
        // アナウンスメント用（配信者の重要告知を目立たせる）
        'announcement': { bg: 'bg-yellow-900', innerBg: '', border: 'border-yellow-500', textTitle: 'text-yellow-300', textContent: 'text-gray-100', textExtra: '', extraBg: '' },
        // チャリティ寄付用（温かみのある赤系）
        'charity': { bg: 'bg-rose-900', innerBg: '', border: 'border-rose-500', textTitle: 'text-rose-300', textContent: 'text-gray-100', textExtra: '', extraBg: '' }
    };

    const colors = colorMap[data.colorClass] || colorMap['gray'];
    const badgesHtml = buildBadgesHtml(data.badges);
    let messageHtmlContent = data.contentHtml !== undefined
        ? data.contentHtml
        : (data.content || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    if (data.isDeleted) {
        messageHtmlContent = `<span class="text-red-500 text-xs font-bold block mb-1">🚫 このメッセージは削除されました</span><s class="text-gray-500">${messageHtmlContent}</s>`;
    }

    card.className = `${colors.bg} border-l-4 ${colors.border} p-3 rounded-lg shadow cursor-pointer transition-all duration-300`;
    if (data.isDeleted) card.classList.add('opacity-50', 'grayscale');

    if (!data.timeStr) {
        const now = new Date();
        data.timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    }
    const timeStr = data.timeStr;

    let html = '';

    // リプライ（返信先）情報のHTMLを生成（存在する場合のみ表示）
    let replyHtml = '';
    if (data.reply && data.reply.parent_user_name) {
        const parentBody = (data.reply.parent_message_body || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        replyHtml = `<div class="reply-indicator"><span class="reply-arrow">↩</span> <span class="reply-username">@${data.reply.parent_user_name}</span> <span class="reply-body">${parentBody}</span></div>`;
    }

    // message_typeに応じたラベルバッジHTMLを生成
    let messageTypeLabel = '';
    if (data.messageType === 'channel_points_highlighted') {
        messageTypeLabel = '<span class="msg-type-badge msg-type-highlight">✨ ハイライト</span>';
    } else if (data.messageType === 'user_intro') {
        messageTypeLabel = '<span class="msg-type-badge msg-type-intro">👋 自己紹介</span>';
    } else if (data.messageType === 'channel_points_sub_only') {
        messageTypeLabel = '<span class="msg-type-badge msg-type-subonly">⭐ サブ限定</span>';
    }

    const nameColorStyle = data.userColor ? `style="color: ${data.userColor};"` : '';
    let nameShadowClass = '';
    if (data.userColor) {
        // 暗い色には白縁取り、明るい色には黒縁取りを適用して視認性を高める
        nameShadowClass = isColorDark(data.userColor) ? 'name-shadow-light' : 'name-shadow-thick';
    }
    const whiteTextClass = data.userColor ? '' : 'text-white';
    const titleTextClass = data.userColor ? '' : colors.textTitle;

    if (data.type === 'announcement') {
        // アナウンスメント専用テンプレート
        html = `
                    <div class="flex items-center justify-between gap-2 mb-1">
                        <div class="flex items-center gap-1 truncate">
                            <span class="text-xs font-bold ${colors.textTitle} bg-yellow-800 px-1.5 py-0.5 rounded whitespace-nowrap">${data.title}</span>
                            <span class="text-lg font-bold ${whiteTextClass} ${nameShadowClass} truncate pr-1" ${nameColorStyle}>${badgesHtml}${data.username}</span>
                        </div>
                        <span class="text-[0.65rem] text-gray-400 whitespace-nowrap ml-1">${timeStr}</span>
                    </div>
                    <div class="text-sm ${colors.textContent} break-words leading-snug">${messageHtmlContent}</div>
                `;
    } else if (data.type === 'cheer') {
        html = `
                    <div class="flex items-start justify-between gap-2 mb-1">
                        <span class="text-lg font-bold ${whiteTextClass} ${nameShadowClass} truncate pr-1" ${nameColorStyle}>${badgesHtml}${data.username}</span>
                        <div class="flex flex-col items-end whitespace-nowrap">
                            <span class="${colors.textExtra} text-sm font-bold">${data.extra}</span>
                            <span class="text-[0.65rem] text-gray-400 mt-0.5">${timeStr}</span>
                        </div>
                    </div>
                    <div class="text-sm ${colors.textContent} break-words leading-snug">${messageHtmlContent}</div>
                `;
    } else if (data.type === 'points') {
        html = `
                    <div class="flex items-center justify-between gap-2 mb-1">
                        <span class="text-lg font-bold ${whiteTextClass} ${nameShadowClass} truncate pr-1" ${nameColorStyle}>${badgesHtml}${data.username}</span>
                        <span class="text-[0.65rem] text-gray-400 whitespace-nowrap">${timeStr}</span>
                    </div>
                    <div class="${colors.textExtra} ${colors.extraBg} text-sm font-bold">${data.extra}</div>
                    ${data.contentHtml ? `<div class="text-sm ${colors.textContent} break-words leading-snug mt-1">${messageHtmlContent}</div>` : ''}
                `;
    } else if (data.type === 'first_comment' || data.type === 'raid_comment') {
        const badgeColor = data.type === 'raid_comment' ? 'bg-orange-800' : 'bg-blue-800';
        html = `
                    <div class="flex items-center justify-between gap-1 mb-1">
                        <div class="flex items-center gap-1 truncate">
                            <span class="text-xs font-bold ${colors.textTitle} ${badgeColor} px-1.5 py-0.5 rounded whitespace-nowrap">${data.title}</span>
                            <span class="text-lg font-bold ${whiteTextClass} ${nameShadowClass} truncate pr-1" ${nameColorStyle}>${badgesHtml}${data.username}</span>
                        </div>
                        <span class="text-[0.65rem] text-gray-400 whitespace-nowrap ml-1">${timeStr}</span>
                    </div>
                    ${replyHtml}
                    ${messageTypeLabel}
                    <div class="text-sm ${colors.textContent} break-words leading-snug">${messageHtmlContent}</div>
                `;
    } else if (data.type === 'raid' || data.type === 'subscribe' || data.type === 'follow'
        || data.type === 'community_gift' || data.type === 'sub_upgrade'
        || data.type === 'pay_it_forward' || data.type === 'bits_badge'
        || data.type === 'charity' || data.type === 'system_notice') {

        // サブスク系（すでに本文にTierやPrime情報が含まれているため重複するラベルを非表示にする）
        const isSubRelated = ['subscribe', 'community_gift', 'sub_upgrade', 'pay_it_forward'].includes(data.type);

        // イベント通知系カード共通テンプレート（タイトル+ユーザー名+内容）
        html = `
                    <div class="flex items-center justify-between gap-2 mb-1">
                        <div class="flex items-center gap-1 truncate">
                            ${data.title ? `<span class="text-xs font-bold ${colors.textTitle} ${colors.bg} px-1.5 py-0.5 rounded whitespace-nowrap">${data.title}</span>` : ''}
                            <span class="text-lg font-bold ${whiteTextClass} ${nameShadowClass} truncate pr-1" ${nameColorStyle}>${badgesHtml}${data.username}</span>
                        </div>
                        <span class="text-[0.65rem] text-gray-400 whitespace-nowrap ml-1">${timeStr}</span>
                    </div>
                    ${data.extra && !isSubRelated ? `<div class="${colors.textExtra} ${colors.extraBg} text-sm font-bold mb-1">${data.extra}</div>` : ''}
                    <div class="text-sm ${colors.textContent} break-words leading-snug mt-1">${messageHtmlContent}</div>
                `;
    } else {
        html = `
                    <div class="flex items-start justify-between gap-2 mb-0.5">
                        <span class="text-sm font-bold ${titleTextClass} ${nameShadowClass} truncate pr-1" ${nameColorStyle}>${badgesHtml}${data.username}</span>
                        <span class="text-[0.65rem] text-gray-500 whitespace-nowrap mt-0.5">${timeStr}</span>
                    </div>
                    ${replyHtml}
                    ${messageTypeLabel}
                    <div class="text-sm ${colors.textContent} break-words leading-snug">${messageHtmlContent}</div>
                `;
    }

    if (colors.innerBg) {
        card.innerHTML = `<div class="${colors.innerBg} rounded p-2 m-1.5 shadow-sm">${html}</div>`;
    } else {
        card.innerHTML = html;
    }

    let pressTimer;
    let isLongPress = false;

    const startPress = (e) => {
        isLongPress = false;
        pressTimer = setTimeout(() => {
            isLongPress = true;
            togglePin(card, data, colors);
        }, 500); // 500msで長押し判定
    };

    const cancelPress = () => {
        clearTimeout(pressTimer);
    };

    const handleTap = (e) => {
        if (isLongPress) {
            e.preventDefault();
            return; // 長押しの場合は通常のクリック処理（既読化）を行わない
        }
        const isRead = card.classList.toggle('is-read');
        if (isRead) {
            card.classList.remove(colors.border);
            card.classList.add('border-gray-600', 'opacity-50');
        } else {
            card.classList.remove('border-gray-600', 'opacity-50');
            card.classList.add(colors.border);
        }
    };

    card.addEventListener('mousedown', startPress);
    card.addEventListener('touchstart', startPress, { passive: true });

    card.addEventListener('mouseup', cancelPress);
    card.addEventListener('mouseleave', cancelPress);
    card.addEventListener('touchend', cancelPress);
    card.addEventListener('touchcancel', cancelPress);
    card.addEventListener('touchmove', cancelPress, { passive: true });

    card.addEventListener('click', handleTap);

    elements.cardsContainer.appendChild(card);

    if (!isRestore) {
        state.messageHistory.push(data);
        if (state.messageHistory.length > 100) {
            state.messageHistory.shift();
        }
        localStorage.setItem('chat_history', JSON.stringify(state.messageHistory));
    }

    if (state.isAutoScroll) {
        elements.mainContainer.scrollTop = elements.mainContainer.scrollHeight;
    }
}

export function restoreHistory() {
    elements.cardsContainer.innerHTML = '';
    elements.pinnedContainer.innerHTML = '';
    state.messageHistory.forEach(data => {
        addCard(data, true);
    });
    if (state.isAutoScroll) {
        elements.mainContainer.scrollTop = elements.mainContainer.scrollHeight;
    }
}

export function togglePin(originalCard, data, colors) {
    if (originalCard.classList.contains('grayscale')) {
        return; // 削除済みメッセージはピン留め不可
    }

    const messageId = originalCard.dataset.messageId;
    if (!messageId) return;

    const isPinned = originalCard.classList.toggle('is-pinned');

    if (isPinned) {
        originalCard.classList.add('border-dashed', 'opacity-70');

        const clone = originalCard.cloneNode(true);
        clone.classList.remove('border-dashed', 'opacity-70', 'is-pinned');
        clone.classList.add('relative', 'shadow-md');

        const badge = document.createElement('div');
        badge.className = 'absolute -top-2 -right-2 bg-yellow-500 text-black text-[0.6rem] font-bold px-1.5 py-0.5 rounded shadow z-10';
        badge.textContent = '📌 キープ';
        clone.appendChild(badge);

        clone.addEventListener('click', () => togglePin(originalCard, data, colors));

        elements.pinnedContainer.appendChild(clone);
    } else {
        originalCard.classList.remove('border-dashed', 'opacity-70');
        const clone = elements.pinnedContainer.querySelector(`div[data-message-id="${messageId}"]`);
        if (clone) clone.remove();
    }
}

export function removeMessage(messageId) {
    if (!messageId) return;
    const cards = document.querySelectorAll(`div[data-message-id="${messageId}"]`);
    cards.forEach(card => markCardAsDeleted(card));
    // 履歴データも更新してリロード時に復元できるようにする
    state.messageHistory.forEach(msg => {
        if (msg.messageId === messageId) msg.isDeleted = true;
    });
    localStorage.setItem('chat_history', JSON.stringify(state.messageHistory));
}

export function clearUserMessages(userId) {
    if (!userId) return;
    const cards = document.querySelectorAll(`div[data-user-id="${userId}"]`);
    cards.forEach(card => markCardAsDeleted(card));
    state.messageHistory.forEach(msg => {
        if (msg.userId === userId) msg.isDeleted = true;
    });
    localStorage.setItem('chat_history', JSON.stringify(state.messageHistory));
}

export function clearAllChat() {
    elements.cardsContainer.innerHTML = '';
    elements.pinnedContainer.innerHTML = '';
    state.messageHistory = [];
    localStorage.setItem('chat_history', JSON.stringify(state.messageHistory));
}

function markCardAsDeleted(card) {
    if (card.classList.contains('grayscale')) return; // すでに削除済み
    card.classList.add('opacity-50', 'grayscale');

    // もしピン留めクローンなら、ピンアイコンを上書きしないようにする
    const contentDiv = card.querySelector('.break-words');
    if (contentDiv) {
        contentDiv.innerHTML = `<span class="text-red-500 text-xs font-bold block mb-1">🚫 このメッセージは削除されました</span><s class="text-gray-500">${contentDiv.innerHTML}</s>`;
    }
}

export function applyFilter() {
    const filter = state.currentFilter || 'all';
    const targetName = (state.targetChannelName || '').toLowerCase();

    const cards = [
        ...elements.cardsContainer.children,
        ...elements.pinnedContainer.children
    ];

    cards.forEach(card => {
        const data = card._messageData;
        if (!data) return;

        let shouldShow = true;

        if (filter === 'events') {
            if (data.type === 'chat' || data.type === 'first_comment' || data.type === 'raid_first') {
                shouldShow = false;
            }
        } else if (filter === 'important') {
            const isFirst = data.type === 'first_comment' || data.type === 'raid_first';
            const isAnnouncement = data.type === 'announcement';
            const isReply = !!(data.reply && data.reply.parent_user_name);
            const isMention = targetName && (data.content || '').toLowerCase().includes(`@${targetName}`);

            if (!isFirst && !isAnnouncement && !isReply && !isMention) {
                shouldShow = false;
            }
        }

        card.classList.toggle('hidden', !shouldShow);
    });
}
