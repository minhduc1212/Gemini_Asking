// ==UserScript==
// @name         Gemini Asking Enhanced (Hover Mode)
// @namespace    http://tampermonkey.net/
// @version      3.2
// @description  Hỏi Gemini với text selection, clipboard image. Hiển thị dạng chấm thông báo, hover để xem kết quả. Bypass anti-cheat (blur, visibilitychange) và tự động đổi API key/model.
// @author       snoww
// @match        *://*/*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function() {
    'use strict';

    // 1. BYPASS ANTI-CHEAT (Chạy ngay lập tức)
    const blockedEvents = ['blur', 'visibilitychange', 'focusout', 'mouseleave', 'webkitvisibilitychange', 'mozvisibilitychange', 'msvisibilitychange'];
    
    // Proxy for window.addEventListener
    const originalWindowAddEventListener = window.addEventListener;
    window.addEventListener = new Proxy(originalWindowAddEventListener, {
        apply(target, thisArg, args) {
            if (blockedEvents.includes(args[0])) {
                return; // Chặn đăng ký event
            }
            return Reflect.apply(target, thisArg, args);
        }
    });

    // Proxy for document.addEventListener
    const originalDocumentAddEventListener = document.addEventListener;
    document.addEventListener = new Proxy(originalDocumentAddEventListener, {
        apply(target, thisArg, args) {
            if (blockedEvents.includes(args[0])) {
                return;
            }
            return Reflect.apply(target, thisArg, args);
        }
    });

    // Mock properties
    try {
        Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
        Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
        Object.defineProperty(document, 'hasFocus', { value: () => true, configurable: true });
        Object.defineProperty(window, 'onblur', { set: () => {}, get: () => null, configurable: true });
        Object.defineProperty(document, 'onvisibilitychange', { set: () => {}, get: () => null, configurable: true });
    } catch (e) {
        console.warn("Gemini Bypass: Could not redefine some properties", e);
    }

    // Settings
    let API_KEYS = [""]; // Thêm các API key của bạn vào đây
    let MODELS = ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"];
    
    let currentKeyIndex = 0;
    let currentModelIndex = 0;

    const HOTKEY = "ctrl+shift+g"; 
    const IMAGE_HOTKEY = "ctrl+shift+i"; 

    const SHORT_PROMPT_PREFIX = "Trả lời ngắn gọn, đi thẳng vào vấn đề/đáp án: ";

    // Helper to get current config
    function getCurrentConfig() {
        return {
            key: API_KEYS[currentKeyIndex % API_KEYS.length],
            model: MODELS[currentModelIndex % MODELS.length]
        };
    }

    // Helper to rotate config
    function rotateConfig() {
        currentKeyIndex++;
        if (currentKeyIndex % API_KEYS.length === 0) {
            currentModelIndex = (currentModelIndex + 1) % MODELS.length;
        }
        console.log(`Gemini: Rotated to Key Index ${currentKeyIndex % API_KEYS.length}, Model: ${MODELS[currentModelIndex % MODELS.length]}`);
    }

    GM_addStyle(`
        /* Nút bấm hình vuông, ẩn, chỉ hiện khi hover (Giữ nguyên tính năng cũ) */
        #gemini-mini-btn {
            position: fixed;
            bottom: 5px;
            right: 5px;
            background: transparent;
            color: transparent;
            width: 20px;
            height: 20px;
            padding: 0;
            font-size: 0;
            border-radius: 3px;
            border: 1px solid transparent;
            cursor: pointer;
            z-index: 99998;
            transition: all 0.2s;
        }
        #gemini-mini-btn:hover {
            background: rgba(0, 0, 0, 0.7);
            border-color: rgba(255, 255, 255, 0.3);
        }

        /* Hộp thoại chat đầy đủ (Giữ nguyên) */
        #gemini-mini-popup {
            position: fixed;
            bottom: 35px;
            right: 10px;
            width: 280px;
            background-color: #fff;
            border: 1px solid #ccc;
            box-shadow: 0 4px 8px rgba(0,0,0,0.2);
            z-index: 99999;
            display: none;
            flex-direction: column;
            font-family: Arial, sans-serif;
            font-size: 11px;
            border-radius: 4px;
        }
        .mini-header {
            padding: 5px 8px;
            background-color: #333;
            color: #fff;
            font-weight: bold;
            display: flex;
            justify-content: space-between;
            align-items: center;
            cursor: move;
            font-size: 10px;
        }
        .mini-close {
            background: none;
            border: none;
            color: #fff;
            cursor: pointer;
            font-size: 14px;
            line-height: 10px;
        }
        .mini-body {
            padding: 5px;
            display: flex;
            flex-direction: column;
        }
        #mini-input {
            width: 100%;
            height: 40px;
            padding: 4px;
            border: 1px solid #ddd;
            margin-bottom: 5px;
            font-size: 11px;
            resize: vertical;
            box-sizing: border-box;
            font-family: sans-serif;
        }
        #mini-submit {
            padding: 3px;
            background-color: #444;
            color: white;
            border: none;
            cursor: pointer;
            font-size: 10px;
            margin-bottom: 5px;
        }
        #mini-result {
            max-height: 150px;
            overflow-y: auto;
            background-color: #f4f4f4;
            padding: 5px;
            border: 1px solid #eee;
            color: #333;
            line-height: 1.3;
        }
        #mini-result::-webkit-scrollbar { width: 5px; }
        #mini-result::-webkit-scrollbar-thumb { background: #ccc; }

        /* --- QUICK ANSWER BOX - HOVER STYLE --- */
        #gemini-quick-answer {
            position: fixed;
            bottom: 15px;
            right: 15px;
            z-index: 100000;
            display: none; /* Ẩn mặc định */

            /* Trạng thái mặc định (chưa hover): Là một chấm tròn nhỏ */
            width: 12px;
            height: 12px;
            background-color: #007bff; /* Màu xanh khi có kết quả */
            border-radius: 50%;
            padding: 0;
            overflow: hidden; /* Ẩn nội dung text */
            box-shadow: 0 0 5px rgba(0,0,0,0.3);
            opacity: 0.6;
            transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
            font-family: Arial, sans-serif;
            font-size: 11px;
            line-height: 1.4;
            color: #e0e0e0;
        }

        /* Màu sắc khi đang Loading (màu cam) */
        #gemini-quick-answer.is-loading {
            background-color: #ff9800 !important;
            animation: pulse-dot 1s infinite;
        }

        @keyframes pulse-dot {
            0% { box-shadow: 0 0 0 0 rgba(255, 152, 0, 0.7); }
            70% { box-shadow: 0 0 0 6px rgba(255, 152, 0, 0); }
            100% { box-shadow: 0 0 0 0 rgba(255, 152, 0, 0); }
        }

        /* Khi hover vào: Mở rộng ra để hiện nội dung */
        #gemini-quick-answer:hover {
            width: auto;
            height: auto;
            max-width: 350px;
            min-width: 150px;
            border-radius: 6px;
            padding: 10px 15px;
            padding-right: 25px;
            background-color: rgba(30, 30, 30, 0.95); /* Nền tối khi mở rộng */
            opacity: 1;
            box-shadow: 0 5px 15px rgba(0,0,0,0.4);
        }

        /* Nội dung bên trong (ẩn khi chưa hover) */
        #gemini-quick-answer .content {
            opacity: 0;
            transition: opacity 0.2s;
            white-space: pre-wrap;
            display: block;
            width: 100%;
        }

        #gemini-quick-answer:hover .content {
            opacity: 1;
            transition-delay: 0.1s; /* Hiện chữ chậm hơn 1 chút sau khi khung mở ra */
        }

        #gemini-quick-answer .close-btn {
            position: absolute;
            top: 2px;
            right: 5px;
            background: none;
            border: none;
            color: #888;
            cursor: pointer;
            font-size: 16px;
            opacity: 0; /* Ẩn nút close khi chưa hover */
            transition: opacity 0.2s;
        }
        #gemini-quick-answer:hover .close-btn {
            opacity: 1;
        }
        #gemini-quick-answer .close-btn:hover {
            color: #fff;
        }

        /* Loading Spinner bên trong (chỉ hiện khi hover vào lúc đang load) */
        .qa-spinner {
            display: inline-block;
            width: 10px;
            height: 10px;
            border: 2px solid rgba(255,255,255,0.3);
            border-top-color: #fff;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
            margin-right: 8px;
            vertical-align: middle;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
    `);

    // INTERFACE
    const btn = document.createElement('button');
    btn.id = 'gemini-mini-btn';
    btn.textContent = '';
    btn.title = 'Ask Gemini';
    document.body.appendChild(btn);

    const popup = document.createElement('div');
    popup.id = 'gemini-mini-popup';
    popup.innerHTML = `
        <div class="mini-header" id="mini-header">
            <span>Gemini Chat</span>
            <button class="mini-close">&times;</button>
        </div>
        <div class="mini-body">
            <textarea id="mini-input" placeholder="Nhập câu hỏi..."></textarea>
            <button id="mini-submit">Gửi</button>
            <div id="mini-result">...</div>
        </div>
    `;
    document.body.appendChild(popup);

    // Quick answer box
    const quickAnswer = document.createElement('div');
    quickAnswer.id = 'gemini-quick-answer';
    quickAnswer.innerHTML = `
        <button class="close-btn">&times;</button>
        <div class="content"></div>
    `;
    document.body.appendChild(quickAnswer);

    // Elements
    const closeBtn = popup.querySelector('.mini-close');
    const input = popup.querySelector('#mini-input');
    const submit = popup.querySelector('#mini-submit');
    const result = popup.querySelector('#mini-result');
    const quickContent = quickAnswer.querySelector('.content');
    const quickCloseBtn = quickAnswer.querySelector('.close-btn');

    let hideTimeout;

    // Hàm hiển thị quick answer
    function showQuickAnswer(text, isLoading = false) {
        // Clear timeout cũ nếu có
        if (hideTimeout) clearTimeout(hideTimeout);

        quickAnswer.style.display = 'block';

        if (isLoading) {
            quickAnswer.classList.add('is-loading');
            quickContent.innerHTML = '<span class="qa-spinner"></span> Đang phân tích...';
        } else {
            quickAnswer.classList.remove('is-loading');
            quickContent.innerHTML = text;
        }

        //autohiding
        if (!isLoading) {
            hideTimeout = setTimeout(() => {
                quickAnswer.style.display = 'none';
            }, 15000);
        }
    }

    // Khi hover vào quick answer, hủy timer ẩn để người dùng đọc
    quickAnswer.onmouseenter = () => {
        if (hideTimeout) clearTimeout(hideTimeout);
    };

    // Hàm gọi API tổng quát với retry logic
    function callGemini(payload, onSuccess, onError, retryCount = 0) {
        const { key, model } = getCurrentConfig();
        const maxRetries = API_KEYS.length * MODELS.length;

        if (!key || key.trim() === "") {
            onError("❌ Lỗi: Chưa có API Key. Hãy thêm vào script settings.");
            return;
        }

        GM_xmlhttpRequest({
            method: "POST",
            url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
            headers: { "Content-Type": "application/json" },
            data: JSON.stringify(payload),
            onload: (res) => {
                try {
                    const data = JSON.parse(res.responseText);
                    
                    // Kiểm tra lỗi từ API (hết quota, key chết, etc.)
                    if (data.error) {
                        console.error(`Gemini Error (Model: ${model}):`, data.error);
                        
                        if (retryCount < maxRetries) {
                            rotateConfig();
                            callGemini(payload, onSuccess, onError, retryCount + 1);
                        } else {
                            onError(`❌ Tất cả API Key/Model đều thất bại. Lỗi cuối: ${data.error.message}`);
                        }
                        return;
                    }

                    let ans = data.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (!ans) {
                        onError("❌ Không nhận được câu trả lời từ AI.");
                        return;
                    }

                    // Format đơn giản
                    ans = ans.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
                    onSuccess(ans);
                } catch(e) {
                    onError(`❌ Lỗi xử lý JSON: ${e.message}`);
                }
            },
            onerror: (err) => {
                console.error("Network Error:", err);
                if (retryCount < maxRetries) {
                    rotateConfig();
                    callGemini(payload, onSuccess, onError, retryCount + 1);
                } else {
                    onError("❌ Lỗi kết nối mạng sau nhiều lần thử.");
                }
            }
        });
    }

    // Hàm gọi API với text
    function askGemini(text, showInQuickBox = false) {
        if (showInQuickBox) {
            showQuickAnswer('', true);
        } else {
            submit.disabled = true;
            submit.textContent = "...";
            result.innerHTML = "Đang tải...";
        }

        const finalText = showInQuickBox ? (SHORT_PROMPT_PREFIX + text) : text;
        const payload = { "contents": [{ "parts": [{ "text": finalText }] }] };

        callGemini(payload, 
            (ans) => {
                if (!showInQuickBox) {
                    submit.disabled = false;
                    submit.textContent = "Gửi";
                    result.innerHTML = ans;
                } else {
                    showQuickAnswer(ans);
                }
            },
            (errMsg) => {
                if (!showInQuickBox) {
                    submit.disabled = false;
                    submit.textContent = "Gửi";
                    result.innerHTML = errMsg;
                } else {
                    showQuickAnswer(errMsg);
                }
            }
        );
    }

    // Hàm gọi API với image
    function askGeminiWithImage(imageBase64, mimeType = "image/png") {
        showQuickAnswer('', true);

        const promptText = SHORT_PROMPT_PREFIX + "Phân tích ảnh và trả lời câu hỏi hoặc mô tả nội dung chính:";
        const payload = {
            "contents": [{
                "parts": [
                    { "text": promptText },
                    {
                        "inline_data": {
                            "mime_type": mimeType,
                            "data": imageBase64
                        }
                    }
                ]
            }]
        };

        callGemini(payload,
            (ans) => showQuickAnswer(ans),
            (errMsg) => showQuickAnswer(errMsg)
        );
    }

    // Parse hotkey
    function parseHotkey(hotkey) {
        const parts = hotkey.toLowerCase().split('+');
        return {
            ctrl: parts.includes('ctrl'),
            shift: parts.includes('shift'),
            alt: parts.includes('alt'),
            key: parts[parts.length - 1]
        };
    }

    const textHotkey = parseHotkey(HOTKEY);
    const imageHotkey = parseHotkey(IMAGE_HOTKEY);

    // Event listeners
    btn.onclick = () => {
        popup.style.display = (popup.style.display === 'flex') ? 'none' : 'flex';
        if(popup.style.display === 'flex') input.focus();
    };

    closeBtn.onclick = () => popup.style.display = 'none';
    submit.onclick = () => { if(input.value.trim()) askGemini(input.value); };
    input.onkeydown = (e) => {
        if(e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit.click();
        }
    };

    // Đóng quick answer
    quickCloseBtn.onclick = (e) => {
        e.stopPropagation(); // Ngăn chặn sự kiện click lan ra ngoài
        quickAnswer.style.display = 'none';
    };

    // Hotkey listener (Use window and capture phase to bypass page's own preventDefault)
    window.addEventListener('keydown', (e) => {
        if (e.ctrlKey === textHotkey.ctrl &&
            e.shiftKey === textHotkey.shift &&
            e.altKey === textHotkey.alt &&
            e.key.toLowerCase() === textHotkey.key) {

            e.preventDefault();
            e.stopPropagation();
            const selectedText = window.getSelection().toString().trim();
            if (selectedText) {
                askGemini(selectedText, true);
            } else {
                showQuickAnswer("⚠️ Chưa chọn văn bản!");
            }
        }

        if (e.ctrlKey === imageHotkey.ctrl &&
            e.shiftKey === imageHotkey.shift &&
            e.altKey === imageHotkey.alt &&
            e.key.toLowerCase() === imageHotkey.key) {

            e.preventDefault();
            e.stopPropagation();
            handleClipboardImage();
        }
    }, true);

    // Handle Image from clipboard
    async function handleClipboardImage() {
        try {
            const clipboardItems = await navigator.clipboard.read();
            for (const item of clipboardItems) {
                const imageTypes = item.types.filter(type => type.startsWith('image/'));
                if (imageTypes.length > 0) {
                    const imageType = imageTypes[0];
                    const blob = await item.getType(imageType);
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        const base64data = reader.result.split(',')[1];
                        askGeminiWithImage(base64data, imageType);
                    };
                    reader.readAsDataURL(blob);
                    return;
                }
            }
            showQuickAnswer("⚠️ Không tìm thấy ảnh trong clipboard!");
        } catch (err) {
            console.error(err);
            showQuickAnswer("❌ Lỗi clipboard. Hãy chắc rằng bạn đã copy ảnh!");
        }
    }

    // Drag functionality for main popup
    const header = popup.querySelector('#mini-header');
    let isDragging = false, startX, startY, initialLeft, initialTop;

    header.onmousedown = (e) => {
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        initialLeft = popup.offsetLeft;
        initialTop = popup.offsetTop;

        document.onmousemove = (e) => {
            if (!isDragging) return;
            popup.style.left = (initialLeft + e.clientX - startX) + "px";
            popup.style.top = (initialTop + e.clientY - startY) + "px";
            popup.style.bottom = 'auto';
            popup.style.right = 'auto';
        };

        document.onmouseup = () => {
            isDragging = false;
            document.onmousemove = null;
        };
    };

    console.log("Gemini Enhanced Hover-Mode loaded");

})();