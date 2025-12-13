// ==UserScript==
// @name         Gemini Asking Enhanced
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  Hỏi Gemini với text selection, clipboard image, và quick answer
// @author       snoww
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function() {
    'use strict';
    
    // Settings
    const API_KEY = ""; 
    const MODEL_NAME = "gemini-2.5-flash";
    const HOTKEY = "ctrl+shift+g"; // Phím tắt cho text selection
    const IMAGE_HOTKEY = "ctrl+shift+i"; // Phím tắt cho clipboard image
    
    // Prompt prefix cho câu trả lời ngắn gọn
    const SHORT_PROMPT_PREFIX = "Trả lời ngắn gọn, chỉ đưa đáp án: ";
    
    GM_addStyle(`
        /* Nút bấm hình vuông, ẩn, chỉ hiện khi hover */
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
            font-family: sans-serif;
        }
        #gemini-mini-btn:hover {
            background: rgba(0, 0, 0, 0.7);
            border-color: rgba(255, 255, 255, 0.3);
        }
        
        /* Hộp thoại nhỏ gọn */
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
        
        /* Quick answer box - nhỏ gọn, không nổi bật, chỉ hiện khi hover */
        #gemini-quick-answer {
            position: fixed;
            bottom: 10px;
            right: 10px;
            max-width: 300px;
            min-width: 150px;
            background-color: rgba(40, 40, 40, 0.85);
            color: #e0e0e0;
            padding: 8px 12px;
            padding-right: 25px;
            border-radius: 4px;
            box-shadow: 0 2px 6px rgba(0,0,0,0.2);
            z-index: 100000;
            display: none;
            font-family: Arial, sans-serif;
            font-size: 11px;
            line-height: 1.3;
            animation: fadeIn 0.2s ease-out;
            opacity: 0.3;
            transition: opacity 0.2s;
        }
        #gemini-quick-answer:hover {
            opacity: 1;
        }
        @keyframes fadeIn {
            from {
                opacity: 0;
            }
            to {
                opacity: 0.3;
            }
        }
        #gemini-quick-answer .close-btn {
            position: absolute;
            top: 3px;
            right: 5px;
            background: none;
            border: none;
            color: #999;
            cursor: pointer;
            font-size: 14px;
            padding: 0;
            line-height: 1;
            opacity: 0.6;
        }
        #gemini-quick-answer .close-btn:hover {
            opacity: 1;
            color: #fff;
        }
        #gemini-quick-answer .content {
            word-wrap: break-word;
        }
        #gemini-quick-answer .loading {
            display: inline-block;
            width: 10px;
            height: 10px;
            border: 2px solid rgba(255,255,255,0.2);
            border-top-color: rgba(255,255,255,0.6);
            border-radius: 50%;
            animation: spin 0.6s linear infinite;
            margin-right: 5px;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
    `);
    
    // INTERFACE
    const btn = document.createElement('button');
    btn.id = 'gemini-mini-btn';
    btn.textContent = '';
    btn.title = 'Ask Gemini'; // Tooltip khi hover
    document.body.appendChild(btn);
    
    const popup = document.createElement('div');
    popup.id = 'gemini-mini-popup';
    popup.innerHTML = `
        <div class="mini-header" id="mini-header">
            <span>Gemini (${HOTKEY} / ${IMAGE_HOTKEY})</span>
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
    
    // Hàm hiển thị quick answer
    function showQuickAnswer(text, isLoading = false) {
        if (isLoading) {
            quickContent.innerHTML = '<span class="loading"></span>Đang xử lý...';
        } else {
            quickContent.innerHTML = text;
        }
        quickAnswer.style.display = 'block';
        
        // Tự động ẩn sau 8 giây nếu không phải loading
        if (!isLoading) {
            setTimeout(() => {
                quickAnswer.style.display = 'none';
            }, 8000);
        }
    }
    
    // Hàm gọi API với text (giữ nguyên logic code cũ)
    function askGemini(text, showInQuickBox = false) {
        if (!API_KEY || API_KEY.trim() === "") {
            const errMsg = "❌ Lỗi: Chưa có API Key.";
            showInQuickBox ? showQuickAnswer(errMsg) : (result.innerHTML = errMsg);
            return;
        }
        
        if (showInQuickBox) {
            showQuickAnswer('', true);
        } else {
            submit.disabled = true;
            submit.textContent = "...";
            result.innerHTML = "Đang tải...";
        }
        
        // Thêm prefix cho quick box để câu trả lời ngắn gọn hơn
        const finalText = showInQuickBox ? (SHORT_PROMPT_PREFIX + text) : text;
        
        GM_xmlhttpRequest({
            method: "POST",
            url: `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${API_KEY}`,
            headers: { "Content-Type": "application/json" },
            data: JSON.stringify({ 
                "contents": [{ "parts": [{ "text": finalText }] }]
            }),
            onload: (res) => {
                if (!showInQuickBox) {
                    submit.disabled = false;
                    submit.textContent = "Gửi";
                }
                
                try {
                    console.log("API Response:", res.responseText);
                    const data = JSON.parse(res.responseText);
                    
                    // Kiểm tra lỗi từ API
                    if (data.error) {
                        const errMsg = `❌ API Error: ${data.error.message}`;
                        console.error("Gemini API Error:", data.error);
                        showInQuickBox ? showQuickAnswer(errMsg) : (result.innerHTML = errMsg);
                        return;
                    }
                    
                    let ans = data.candidates?.[0]?.content?.parts?.[0]?.text;
                    
                    if (!ans) {
                        console.error("No text in response:", data);
                        const errMsg = "❌ Không nhận được câu trả lời từ API";
                        showInQuickBox ? showQuickAnswer(errMsg) : (result.innerHTML = errMsg);
                        return;
                    }
                    
                    // Simple formatting
                    ans = ans.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
                    
                    if (showInQuickBox) {
                        showQuickAnswer(ans);
                    } else {
                        result.innerHTML = ans;
                    }
                } catch(e) {
                    console.error("Parse error:", e, "Response:", res.responseText);
                    const errMsg = `❌ Lỗi xử lý: ${e.message}`;
                    showInQuickBox ? showQuickAnswer(errMsg) : (result.textContent = errMsg);
                }
            },
            onerror: () => {
                if (!showInQuickBox) {
                    submit.disabled = false;
                    submit.textContent = "Gửi";
                }
                const errMsg = "❌ Lỗi kết nối mạng.";
                showInQuickBox ? showQuickAnswer(errMsg) : (result.textContent = errMsg);
            }
        });
    }
    
    // Hàm gọi API với image (giữ logic đơn giản như code cũ)
    function askGeminiWithImage(imageBase64, mimeType = "image/png") {
        if (!API_KEY || API_KEY.trim() === "") {
            showQuickAnswer("❌ Lỗi: Chưa có API Key.");
            return;
        }
        
        showQuickAnswer('', true);
        
        const promptText = SHORT_PROMPT_PREFIX + "Mô tả hoặc trả lời câu hỏi trong ảnh này";
        
        GM_xmlhttpRequest({
            method: "POST",
            url: `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${API_KEY}`,
            headers: { "Content-Type": "application/json" },
            data: JSON.stringify({
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
            }),
            onload: (res) => {
                try {
                    console.log("API Response (Image):", res.responseText);
                    const data = JSON.parse(res.responseText);
                    
                    // Kiểm tra lỗi từ API
                    if (data.error) {
                        const errMsg = `❌ API Error: ${data.error.message}`;
                        console.error("Gemini API Error:", data.error);
                        showQuickAnswer(errMsg);
                        return;
                    }
                    
                    let ans = data.candidates?.[0]?.content?.parts?.[0]?.text;
                    
                    if (!ans) {
                        console.error("No text in response:", data);
                        showQuickAnswer("❌ Không nhận được câu trả lời từ API");
                        return;
                    }
                    
                    // Simple formatting
                    ans = ans.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
                    showQuickAnswer(ans);
                } catch(e) {
                    console.error("Parse error:", e, "Response:", res.responseText);
                    showQuickAnswer(`❌ Lỗi xử lý: ${e.message}`);
                }
            },
            onerror: () => {
                showQuickAnswer("❌ Lỗi kết nối mạng.");
            }
        });
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
    
    // Event listeners cho chức năng cũ
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
    
    quickCloseBtn.onclick = () => quickAnswer.style.display = 'none';
    
    // CHỨC NĂNG MỚI 1: Bôi đen text và gửi bằng phím tắt
    document.addEventListener('keydown', (e) => {
        // Kiểm tra hotkey cho text selection
        if (e.ctrlKey === textHotkey.ctrl && 
            e.shiftKey === textHotkey.shift && 
            e.altKey === textHotkey.alt && 
            e.key.toLowerCase() === textHotkey.key) {
            
            e.preventDefault();
            const selectedText = window.getSelection().toString().trim();
            
            if (selectedText) {
                askGemini(selectedText, true);
            } else {
                showQuickAnswer("⚠️ Chưa chọn văn bản nào!");
            }
        }
        
        // Kiểm tra hotkey cho clipboard image
        if (e.ctrlKey === imageHotkey.ctrl && 
            e.shiftKey === imageHotkey.shift && 
            e.altKey === imageHotkey.alt && 
            e.key.toLowerCase() === imageHotkey.key) {
            
            e.preventDefault();
            handleClipboardImage();
        }
    });
    
    // CHỨC NĂNG MỚI 2: Đọc ảnh từ clipboard
    async function handleClipboardImage() {
        try {
            const clipboardItems = await navigator.clipboard.read();
            
            for (const item of clipboardItems) {
                // Tìm ảnh trong clipboard
                const imageTypes = item.types.filter(type => type.startsWith('image/'));
                
                if (imageTypes.length > 0) {
                    const imageType = imageTypes[0];
                    const blob = await item.getType(imageType);
                    
                    // Convert blob to base64
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
            console.error("Clipboard error:", err);
            showQuickAnswer("❌ Không thể đọc clipboard. Hãy chắc rằng bạn đã copy ảnh!");
        }
    }
    
    // Drag functionality
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
    
    // Thông báo khi script load
    console.log(`Gemini Enhanced loaded! 
    - Text selection: ${HOTKEY}
    - Clipboard image: ${IMAGE_HOTKEY}`);
    
})();