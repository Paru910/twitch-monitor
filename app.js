import { checkAuth } from './js/auth.js';
import { setupUIEventListeners, applyFontSize } from './js/ui.js';

document.addEventListener('DOMContentLoaded', () => {
    // UIのイベントリスナー（ボタンのクリックなど）を設定
    setupUIEventListeners();

    // ユーザー保存の文字サイズ設定を適用
    applyFontSize();

    // トークンチェックとアプリ初期化を開始
    checkAuth();
});