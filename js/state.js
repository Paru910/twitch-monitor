export const state = {
    accessToken: null,
    loggedInUserId: null,
    targetBroadcasterId: null,
    targetChannelName: '',
    ws: null,
    seenUsers: new Set(),
    messageHistory: [],
    isAutoScroll: true,
    badgeMap: {},
    fontSizeStep: parseInt(localStorage.getItem('fontSizeStep') || '0', 10),
    raidEndTime: 0,
    raidSource: '',
    wsReconnectTimeout: null,
    currentFilter: 'all' // 'all', 'events', 'important' 
};

// Initialize seenUsers from localStorage
const storedUsers = localStorage.getItem('seenUsers');
if (storedUsers) {
    try {
        state.seenUsers = new Set(JSON.parse(storedUsers));
    } catch (e) {
        state.seenUsers = new Set();
    }
}

// Initialize messageHistory from localStorage
const storedHistory = localStorage.getItem('chat_history');
if (storedHistory) {
    try {
        state.messageHistory = JSON.parse(storedHistory);
    } catch (e) {
        state.messageHistory = [];
    }
}
