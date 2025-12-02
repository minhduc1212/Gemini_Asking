// ==UserScript==
// @name         Gemini Asking
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  Phiên bản siêu nhỏ gọn để hỏi Gemini.
// @author       snoww
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    //Settings
    const API_KEY = ""; 
    const MODEL_NAME = "gemini-2.5-flash";

    GM_addStyle(`
        /* Nút bấm siêu nhỏ, mờ */
        #gemini-mini-btn {
            position: fixed;
            bottom: 5px;
            right: 5px;
            background: rgba(0, 0, 0, 0.3); /* Mờ, không nổi bật */
            color: white;
            padding: 2px 8px;
            font-size: 10px;
            border-radius: 3px;
            border: none;
            cursor: pointer;
            z-index: 99998;
            transition: all 0.3s;
            font-family: sans-serif;
        }
        #gemini-mini-btn:hover {
            background: rgba(0, 0, 0, 0.8); /* Rõ hơn khi di chuột */
            opacity: 1;
        }

        /* Hộp thoại nhỏ gọn */
        #gemini-mini-popup {
            position: fixed;
            bottom: 35px; /* Hiện ngay trên nút bấm */
            right: 10px;
            width: 280px; /* Chiều rộng nhỏ */
            background-color: #fff;
            border: 1px solid #ccc;
            box-shadow: 0 4px 8px rgba(0,0,0,0.2);
            z-index: 99999;
            display: none;
            flex-direction: column;
            font-family: Arial, sans-serif;
            font-size: 11px; /* Chữ nhỏ */
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
            height: 40px; /* Ô nhập thấp */
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
            max-height: 150px; /* Chiều cao tối đa ngắn */
            overflow-y: auto;
            background-color: #f4f4f4;
            padding: 5px;
            border: 1px solid #eee;
            color: #333;
            line-height: 1.3;
        }

        /* Scrollbar nhỏ cho đẹp */
        #mini-result::-webkit-scrollbar { width: 5px; }
        #mini-result::-webkit-scrollbar-thumb { background: #ccc; }
    `);

    //INTERFACE
    const btn = document.createElement('button');
    btn.id = 'gemini-mini-btn';
    btn.textContent = '[Ask Gemini]';
    document.body.appendChild(btn);

    const popup = document.createElement('div');
    popup.id = 'gemini-mini-popup';
    popup.innerHTML = `
        <div class="mini-header" id="mini-header">
            <span>Gemini Mini</span>
            <button class="mini-close">&times;</button>
        </div>
        <div class="mini-body">
            <textarea id="mini-input" placeholder="Enter your question..."></textarea>
            <button id="mini-submit">Send</button>
            <div id="mini-result">...</div>
        </div>
    `;
    document.body.appendChild(popup);

    // --- LOGIC ---
    const closeBtn = popup.querySelector('.mini-close');
    const input = popup.querySelector('#mini-input');
    const submit = popup.querySelector('#mini-submit');
    const result = popup.querySelector('#mini-result');

    // Hàm gọi API
    function askGemini(text) {
        if (!API_KEY || API_KEY.includes("YOUR_API_KEY")) {
            result.innerHTML = "Error: No API Key."; return;
        }
        submit.disabled = true;
        submit.textContent = "...";
        result.innerHTML = "Loading...";

        GM_xmlhttpRequest({
            method: "POST",
            url: `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${API_KEY}`,
            headers: { "Content-Type": "application/json" },
            data: JSON.stringify({ "contents": [{ "parts": [{ "text": text }] }] }),
            onload: (res) => {
                submit.disabled = false; submit.textContent = "Gửi";
                try {
                    const data = JSON.parse(res.responseText);
                    let ans = data.candidates?.[0]?.content?.parts?.[0]?.text || "Error.";
                    // Simple formatting
                    ans = ans.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
                    result.innerHTML = ans;
                } catch(e) { result.textContent = "Processing error."; }
            },
            onerror: () => { submit.disabled = false; submit.textContent = "Send"; result.textContent = "Network error."; }
        });
    }

    // Events
    btn.onclick = () => {
        popup.style.display = (popup.style.display === 'flex') ? 'none' : 'flex';
        if(popup.style.display === 'flex') input.focus();
    };
    closeBtn.onclick = () => popup.style.display = 'none';
    submit.onclick = () => { if(input.value.trim()) askGemini(input.value); };
    input.onkeydown = (e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit.click(); }};

    //Drag func
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
        document.onmouseup = () => { isDragging = false; document.onmousemove = null; };
    };

})();